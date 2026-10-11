"""Authenticated application-level encryption for minimal shipping data."""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.settings import Settings, parse_previous_shipping_keys

# The key sandbox mode falls back to when SHIPPING_ENCRYPTION_KEY is not set. It
# is public on purpose, being in this repository: sandbox orders hold fictional
# shipping data. ShippingCipher refuses to use it outside commerce's sandbox
# mode, where a real key is required.
SANDBOX_ENCRYPTION_KEY = bytes.fromhex(
    "6c2eac56df0d3fe7577d3d5b0bdb868b719d04f6f696637ac4fe58b62f7ab1f2"
)


class ShippingEncryptionError(RuntimeError):
    """Fail closed without exposing keys, ciphertext, or plaintext."""


@dataclass(frozen=True, slots=True)
class EncryptedShipping:
    ciphertext: bytes
    nonce: bytes
    key_id: str


class ShippingCipher:
    def __init__(self, settings: Settings) -> None:
        if settings.shipping_encryption_key is None:
            if settings.commerce_mode != "sandbox":
                raise ShippingEncryptionError("shipping encryption is not configured")
            self._key = SANDBOX_ENCRYPTION_KEY
        else:
            try:
                self._key = base64.b64decode(
                    settings.shipping_encryption_key.get_secret_value(), validate=True
                )
            except (ValueError, TypeError):
                raise ShippingEncryptionError(
                    "shipping encryption is not configured"
                ) from None
        if len(self._key) != 32:
            raise ShippingEncryptionError("shipping encryption is not configured")
        self.key_id = settings.shipping_encryption_key_id
        # Keys from before a rotation. An order records the id of the key that
        # encrypted it, so these only ever decrypt; new data uses the current key.
        self._previous: dict[str, bytes] = {}
        if settings.shipping_encryption_previous_keys is not None:
            try:
                self._previous = parse_previous_shipping_keys(
                    settings.shipping_encryption_previous_keys.get_secret_value()
                )
            except ValueError:
                raise ShippingEncryptionError(
                    "shipping encryption is not configured"
                ) from None

    def encrypt(self, order_id: str, shipping: dict[str, object]) -> EncryptedShipping:
        nonce = os.urandom(12)
        plaintext = json.dumps(shipping, sort_keys=True, separators=(",", ":")).encode()
        ciphertext = AESGCM(self._key).encrypt(nonce, plaintext, order_id.encode())
        return EncryptedShipping(ciphertext, nonce, self.key_id)

    def decrypt(
        self, order_id: str, ciphertext: bytes, nonce: bytes, key_id: str
    ) -> dict[str, object]:
        key = self._key if key_id == self.key_id else self._previous.get(key_id)
        if key is None or len(nonce) != 12:
            raise ShippingEncryptionError("shipping data cannot be decrypted")
        try:
            plaintext = AESGCM(key).decrypt(nonce, ciphertext, order_id.encode())
            value = json.loads(plaintext)
        except Exception:
            raise ShippingEncryptionError("shipping data cannot be decrypted") from None
        if not isinstance(value, dict):
            raise ShippingEncryptionError("shipping data cannot be decrypted")
        return value
