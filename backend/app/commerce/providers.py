"""Hosted-checkout provider boundary with deterministic sandbox and Stripe."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlencode

from app.settings import Settings

SANDBOX_WEBHOOK_SECRET = b"sewncovers-fictional-sandbox-webhook-v1"


class ProviderError(RuntimeError):
    """Safe provider failure without payload or credential detail."""


class InvalidWebhook(RuntimeError):
    """Signature or event contract failed verification."""


@dataclass(frozen=True, slots=True)
class CheckoutPayload:
    attempt_id: str
    order_id: str
    order_reference: str
    amount_minor: int
    currency: str
    lines: tuple[dict[str, object], ...]
    customer_email: str
    expires_at_epoch: int
    idempotency_key: str


@dataclass(frozen=True, slots=True)
class ProviderSession:
    id: str
    url: str


@dataclass(frozen=True, slots=True)
class VerifiedPaymentEvent:
    id: str
    event_type: str
    session_id: str
    order_id: str | None
    amount_minor: int | None
    currency: str | None
    payment_id: str | None
    tax_minor: int | None
    shipping_minor: int | None
    shipping: dict[str, object] | None


class PaymentProvider(Protocol):
    name: str
    demonstration: bool

    def create_checkout(self, payload: CheckoutPayload) -> ProviderSession: ...
    def verify_webhook(
        self, raw_body: bytes, signature: str | None
    ) -> VerifiedPaymentEvent: ...
    def create_refund(
        self, payment_id: str, order_id: str, idempotency_key: str
    ) -> bytes: ...


def _canonical(value: dict[str, object]) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def sandbox_signature(raw_body: bytes, *, timestamp: int | None = None) -> str:
    issued_at = int(time.time()) if timestamp is None else timestamp
    signed = str(issued_at).encode() + b"." + raw_body
    digest = hmac.new(SANDBOX_WEBHOOK_SECRET, signed, hashlib.sha256).hexdigest()
    return f"t={issued_at},v1={digest}"


class SandboxProvider:
    name = "sandbox"
    demonstration = True

    def __init__(self, frontend_origin: str) -> None:
        self._frontend_origin = frontend_origin.rstrip("/")

    def create_checkout(self, payload: CheckoutPayload) -> ProviderSession:
        session_id = f"sc_demo_{payload.attempt_id}"
        return ProviderSession(
            id=session_id,
            url=(
                f"{self._frontend_origin}/checkout/sandbox/?"
                + urlencode({"session": session_id, "order": payload.order_id})
            ),
        )

    def verify_webhook(
        self, raw_body: bytes, signature: str | None
    ) -> VerifiedPaymentEvent:
        if len(raw_body) > 64_000 or not signature:
            raise InvalidWebhook("invalid sandbox webhook")
        pieces = dict(
            item.split("=", 1) for item in signature.split(",") if "=" in item
        )
        try:
            timestamp = int(pieces["t"])
        except (KeyError, ValueError):
            raise InvalidWebhook("invalid sandbox webhook") from None
        if abs(int(time.time()) - timestamp) > 300:
            raise InvalidWebhook("expired sandbox webhook")
        expected = sandbox_signature(raw_body, timestamp=timestamp).split("v1=", 1)[1]
        if not hmac.compare_digest(expected, pieces.get("v1", "")):
            raise InvalidWebhook("invalid sandbox webhook")
        try:
            event = json.loads(raw_body)
            data = event["data"]
            return VerifiedPaymentEvent(
                id=str(event["id"]),
                event_type=str(event["type"]),
                session_id=str(data["session_id"]),
                order_id=str(data["order_id"]) if data.get("order_id") else None,
                amount_minor=int(data["amount_minor"])
                if data.get("amount_minor") is not None
                else None,
                currency=str(data["currency"]).upper()
                if data.get("currency")
                else None,
                payment_id=str(data["payment_id"]) if data.get("payment_id") else None,
                tax_minor=int(data["tax_minor"])
                if data.get("tax_minor") is not None
                else None,
                shipping_minor=int(data["shipping_minor"])
                if data.get("shipping_minor") is not None
                else None,
                shipping=data.get("shipping")
                if isinstance(data.get("shipping"), dict)
                else None,
            )
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            raise InvalidWebhook("invalid sandbox event") from None

    def create_refund(
        self, payment_id: str, order_id: str, idempotency_key: str
    ) -> bytes:
        return _canonical(
            {
                "id": (
                    "evt_demo_refund_"
                    f"{hashlib.sha256(idempotency_key.encode()).hexdigest()[:24]}"
                ),
                "type": "charge.refunded",
                "data": {
                    "session_id": payment_id,
                    "order_id": order_id,
                    "payment_id": payment_id,
                },
            }
        )


class StripeCheckoutProvider:
    """Configured-only real hosted adapter; tests replace this boundary."""

    name = "stripe"
    demonstration = False

    def __init__(self, settings: Settings) -> None:
        if settings.stripe_secret_key is None or settings.stripe_webhook_secret is None:
            raise ProviderError("Stripe commerce configuration is incomplete")
        import stripe

        self._stripe = stripe
        self._client = stripe.StripeClient(
            settings.stripe_secret_key.get_secret_value()
        )
        self._webhook_secret = settings.stripe_webhook_secret.get_secret_value()
        self._return_url = (settings.checkout_return_url or "").rstrip("/")
        self._countries = list(settings.shipping_country_codes)

    def create_checkout(self, payload: CheckoutPayload) -> ProviderSession:
        try:
            session = self._client.v1.checkout.sessions.create(
                {
                    "mode": "payment",
                    "ui_mode": "hosted_page",
                    "client_reference_id": payload.order_id,
                    "customer_email": payload.customer_email,
                    "success_url": f"{self._return_url}/?order={payload.order_id}",
                    "cancel_url": (
                        f"{self._return_url.replace('/return', '/cancel')}"
                        f"/?order={payload.order_id}"
                    ),
                    "expires_at": payload.expires_at_epoch,
                    "automatic_tax": {"enabled": True},
                    "shipping_address_collection": {
                        "allowed_countries": self._countries
                    },
                    "line_items": [
                        {
                            "quantity": 1,
                            "price_data": {
                                "currency": payload.currency.lower(),
                                "unit_amount": payload.amount_minor,
                                "product_data": {
                                    "name": (
                                        f"SewnCovers order {payload.order_reference}"
                                    ),
                                    "description": "Configured cushion cover",
                                },
                            },
                        }
                    ],
                    "metadata": {
                        "order_id": payload.order_id,
                        "attempt_id": payload.attempt_id,
                    },
                    "payment_intent_data": {
                        "metadata": {
                            "order_id": payload.order_id,
                            "attempt_id": payload.attempt_id,
                        }
                    },
                },
                options={"idempotency_key": payload.idempotency_key},
            )
        except Exception:
            raise ProviderError("Hosted checkout could not be created") from None
        if not getattr(session, "id", None) or not getattr(session, "url", None):
            raise ProviderError("Hosted checkout returned an incomplete response")
        return ProviderSession(id=str(session.id), url=str(session.url))

    def verify_webhook(
        self, raw_body: bytes, signature: str | None
    ) -> VerifiedPaymentEvent:
        if not signature or len(raw_body) > 64_000:
            raise InvalidWebhook("invalid Stripe webhook")
        try:
            event = self._client.construct_event(
                raw_body, signature, self._webhook_secret
            )
            obj = event.data.object
            metadata = dict(getattr(obj, "metadata", {}) or {})
            total_details = getattr(obj, "total_details", None)
            shipping = getattr(obj, "shipping_details", None)
            if shipping is None:
                collected = getattr(obj, "collected_information", None)
                shipping = (
                    getattr(collected, "shipping_details", None) if collected else None
                )
            shipping_dict = (
                shipping.to_dict() if hasattr(shipping, "to_dict") else shipping
            )
            normalized_shipping = None
            if isinstance(shipping_dict, dict):
                address = shipping_dict.get("address")
                if isinstance(address, dict):
                    normalized_shipping = {
                        "name": shipping_dict.get("name"),
                        "line1": address.get("line1"),
                        "line2": address.get("line2"),
                        "city": address.get("city"),
                        "region": address.get("state"),
                        "postalCode": address.get("postal_code"),
                        "country": address.get("country"),
                    }
            return VerifiedPaymentEvent(
                id=str(event.id),
                event_type=str(event.type),
                session_id=str(obj.id),
                order_id=metadata.get("order_id")
                or getattr(obj, "client_reference_id", None),
                amount_minor=(
                    getattr(obj, "amount_total", None)
                    or getattr(obj, "amount_refunded", None)
                    or getattr(obj, "amount", None)
                ),
                currency=(
                    str(obj.currency).upper()
                    if getattr(obj, "currency", None)
                    else None
                ),
                payment_id=(
                    str(obj.payment_intent)
                    if getattr(obj, "payment_intent", None)
                    else None
                ),
                tax_minor=(
                    getattr(total_details, "amount_tax", None)
                    if total_details
                    else None
                ),
                shipping_minor=(
                    getattr(total_details, "amount_shipping", None)
                    if total_details
                    else None
                ),
                shipping=normalized_shipping,
            )
        except Exception:
            raise InvalidWebhook("invalid Stripe webhook") from None

    def create_refund(
        self, payment_id: str, order_id: str, idempotency_key: str
    ) -> bytes:
        try:
            refund = self._client.v1.refunds.create(
                {"payment_intent": payment_id, "metadata": {"order_id": order_id}},
                options={"idempotency_key": idempotency_key},
            )
        except Exception:
            raise ProviderError("Refund request could not be submitted") from None
        return _canonical(
            {
                "id": f"provider-response-{refund.id}",
                "type": "refund.provider_accepted",
                "data": {
                    "session_id": payment_id,
                    "order_id": order_id,
                    "payment_id": payment_id,
                },
            }
        )


def get_payment_provider(settings: Settings) -> PaymentProvider:
    if settings.commerce_mode == "sandbox":
        return SandboxProvider(settings.frontend_origin or "http://localhost:3000")
    return StripeCheckoutProvider(settings)
