"""Rotating the shipping encryption key without orphaning existing orders."""

import base64
from typing import Any

import pytest
from pydantic import ValidationError

from app.commerce.encryption import (
    SANDBOX_ENCRYPTION_KEY,
    ShippingCipher,
    ShippingEncryptionError,
)
from app.settings import (
    PREVIOUS_SHIPPING_KEYS_MESSAGE,
    Settings,
    parse_previous_shipping_keys,
)

ORDER_ID = "OrderExample0000000001"
SHIPPING = {"name": "Avery Example", "city": "Ottawa", "country": "CA"}
FIRST = bytes(range(32))
SECOND = bytes(range(32, 64))
THIRD = bytes(range(64, 96))


def encoded(key: bytes) -> str:
    return base64.b64encode(key).decode()


def settings(
    key: bytes | None, key_id: str, previous: str | None = None, **more: Any
) -> Settings:
    return Settings(
        _env_file=None,
        shipping_encryption_key=None if key is None else encoded(key),
        shipping_encryption_key_id=key_id,
        shipping_encryption_previous_keys=previous,
        **more,
    )


def test_an_order_encrypted_before_the_rotation_still_decrypts() -> None:
    before = ShippingCipher(settings(FIRST, "v1")).encrypt(ORDER_ID, SHIPPING)
    assert before.key_id == "v1"

    after = ShippingCipher(settings(SECOND, "v2", f"v1:{encoded(FIRST)}"))

    assert (
        after.decrypt(ORDER_ID, before.ciphertext, before.nonce, before.key_id)
        == SHIPPING
    )


def test_new_orders_use_the_current_key_and_previous_keys_never_encrypt() -> None:
    cipher = ShippingCipher(settings(SECOND, "v2", f"v1:{encoded(FIRST)}"))

    fresh = cipher.encrypt(ORDER_ID, SHIPPING)

    assert fresh.key_id == "v2"
    assert cipher.decrypt(ORDER_ID, fresh.ciphertext, fresh.nonce, "v2") == SHIPPING
    # Only the current key opens it: a cipher that has just the old key cannot.
    only_old = ShippingCipher(settings(FIRST, "v2"))
    with pytest.raises(ShippingEncryptionError):
        only_old.decrypt(ORDER_ID, fresh.ciphertext, fresh.nonce, "v2")


def test_without_the_previous_key_the_order_cannot_be_read() -> None:
    before = ShippingCipher(settings(FIRST, "v1")).encrypt(ORDER_ID, SHIPPING)

    rotated_without_keyring = ShippingCipher(settings(SECOND, "v2"))

    with pytest.raises(ShippingEncryptionError, match="cannot be decrypted"):
        rotated_without_keyring.decrypt(
            ORDER_ID, before.ciphertext, before.nonce, before.key_id
        )


def test_several_rotations_keep_every_earlier_order_readable() -> None:
    oldest = ShippingCipher(settings(FIRST, "v1")).encrypt(ORDER_ID, SHIPPING)
    middle = ShippingCipher(settings(SECOND, "v2")).encrypt(ORDER_ID, SHIPPING)
    latest = ShippingCipher(
        settings(THIRD, "v3", f"v1:{encoded(FIRST)}, v2:{encoded(SECOND)}")
    )

    for stored in (oldest, middle):
        assert (
            latest.decrypt(ORDER_ID, stored.ciphertext, stored.nonce, stored.key_id)
            == SHIPPING
        )


def test_a_previous_key_is_still_bound_to_its_order() -> None:
    before = ShippingCipher(settings(FIRST, "v1")).encrypt(ORDER_ID, SHIPPING)
    after = ShippingCipher(settings(SECOND, "v2", f"v1:{encoded(FIRST)}"))

    with pytest.raises(ShippingEncryptionError):
        after.decrypt("DifferentOrder00000001", before.ciphertext, before.nonce, "v1")
    with pytest.raises(ShippingEncryptionError):
        after.decrypt(ORDER_ID, before.ciphertext, b"short", "v1")
    with pytest.raises(ShippingEncryptionError):
        after.decrypt(ORDER_ID, before.ciphertext, before.nonce, "never-existed")


def test_the_sandbox_key_can_be_listed_as_a_previous_key_too() -> None:
    # Moving from the built-in sandbox key to a real one keeps sandbox orders.
    stored = ShippingCipher(settings(None, "sandbox-v1")).encrypt(ORDER_ID, SHIPPING)

    real = ShippingCipher(
        settings(FIRST, "v1", f"sandbox-v1:{encoded(SANDBOX_ENCRYPTION_KEY)}")
    )

    assert (
        real.decrypt(ORDER_ID, stored.ciphertext, stored.nonce, stored.key_id)
        == SHIPPING
    )


@pytest.mark.parametrize(
    "value",
    [
        "",  # an empty list is not a key
        "v1",  # no key
        "v1:",  # empty key
        f"v1:{encoded(FIRST)[:-4]}",  # not 32 bytes
        f"v1:{encoded(FIRST + b'x')}",  # 33 bytes
        f"v1:{encoded(FIRST)}!",  # not base64
        f":{encoded(FIRST)}",  # no id
        f"{'x' * 33}:{encoded(FIRST)}",  # id too long
        f"bad id:{encoded(FIRST)}",  # id with a space
        f"v1:{encoded(FIRST)},v1:{encoded(SECOND)}",  # duplicate id
        f"v1:{encoded(FIRST)},",  # trailing comma
    ],
)
def test_a_malformed_keyring_is_refused_without_echoing_it(value: str) -> None:
    with pytest.raises(ValueError) as refused:
        parse_previous_shipping_keys(value)
    assert str(refused.value) == PREVIOUS_SHIPPING_KEYS_MESSAGE
    assert encoded(FIRST)[:12] not in str(refused.value)


def test_settings_refuse_a_keyring_that_lists_the_current_key_id() -> None:
    secret = f"v2:{encoded(FIRST)}"

    with pytest.raises(ValidationError) as refused:
        settings(SECOND, "v2", secret)

    assert "SHIPPING_ENCRYPTION_PREVIOUS_KEYS" in str(refused.value)
    assert encoded(FIRST) not in str(refused.value)


def test_settings_refuse_a_malformed_keyring_without_echoing_it() -> None:
    secret = f"v1:{encoded(FIRST)}!!"

    with pytest.raises(ValidationError) as refused:
        settings(SECOND, "v2", secret)

    assert "SHIPPING_ENCRYPTION_PREVIOUS_KEYS" in str(refused.value)
    assert encoded(FIRST)[:12] not in str(refused.value)


def test_the_keyring_is_a_secret_and_off_by_default() -> None:
    assert Settings(_env_file=None).shipping_encryption_previous_keys is None
    configured = settings(SECOND, "v2", f"v1:{encoded(FIRST)}")

    assert encoded(FIRST) not in repr(configured)
    assert encoded(FIRST) not in configured.model_dump_json()


def test_the_keyring_is_read_from_its_environment_variable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = ShippingCipher(settings(FIRST, "v1")).encrypt(ORDER_ID, SHIPPING)
    monkeypatch.setenv("SHIPPING_ENCRYPTION_KEY", encoded(SECOND))
    monkeypatch.setenv("SHIPPING_ENCRYPTION_KEY_ID", "v2")
    monkeypatch.setenv("SHIPPING_ENCRYPTION_PREVIOUS_KEYS", f"v1:{encoded(FIRST)}")

    cipher = ShippingCipher(Settings(_env_file=None))

    assert (
        cipher.decrypt(ORDER_ID, before.ciphertext, before.nonce, before.key_id)
        == SHIPPING
    )
