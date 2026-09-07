"""Authoritative pricing, checkout, payment, order, and operations use cases."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.accounts.security import (
    IdGenerator,
    TokenGenerator,
    generate_bearer_token,
    generate_resource_id,
    hash_token,
    token_hash_matches,
)
from app.accounts.service import AuthenticatedAccount, utc_now
from app.assurance.service import create_paid_order_work
from app.commerce.encryption import ShippingCipher, ShippingEncryptionError
from app.commerce.providers import (
    CheckoutPayload,
    InvalidWebhook,
    PaymentProvider,
    ProviderError,
    SandboxProvider,
    sandbox_signature,
)
from app.commerce.schema import (
    AuditResponse,
    CartLineResponse,
    CartResponse,
    CheckoutResponse,
    CompleteSandboxCheckoutRequest,
    MoneyResponse,
    OrderResponse,
    PriceBookConfiguration,
    PriceBookRequest,
    PriceBookResponse,
    PricingComponentResponse,
    PricingResponse,
    ProductionAssetAccessResponse,
    QuoteResponse,
    RepriceQuoteRequest,
    SandboxCheckoutResponse,
    ShipmentRequest,
    ShipmentResponse,
    ShippingAddressRequest,
    TimelineEntryResponse,
    TransitionOrderRequest,
    VersionQuantityRequest,
    WebhookResponse,
)
from app.designs.schema import DesignConfiguration
from app.designs.service import DesignService
from app.errors import APIProblem
from app.patterns.repository import PatternRepository
from app.persistence.models import (
    AuditEvent,
    CartLine,
    CommerceQuote,
    CustomDerivative,
    CustomerOrder,
    CustomUpload,
    OrderHistory,
    OrderProductionAsset,
    PaymentAttempt,
    PaymentEvent,
    PriceBook,
    ProductionAssetReservation,
    ProjectCustomPatternReference,
    ProjectVersion,
    Shipment,
    ShoppingCart,
)
from app.persistence.transactions import service_transaction
from app.projects.schema import ProjectConfiguration
from app.settings import Settings
from app.uploads.storage import ObjectStorage, ObjectStorageError

CHECKOUT_LIFETIME = timedelta(minutes=30)
ASSET_ACCESS_LIFETIME = timedelta(minutes=5)
MAX_AMOUNT_MINOR = 100_000_000
PI = Decimal("3.141592653589793")
SUCCESS_EVENTS = {
    "checkout.session.completed",
    "payment_intent.succeeded",
    "sandbox.checkout.completed",
}
FAILURE_EVENTS = {
    "checkout.session.async_payment_failed",
    "payment_intent.payment_failed",
    "sandbox.checkout.failed",
}
CANCEL_EVENTS = {"checkout.session.expired", "sandbox.checkout.cancelled"}
REFUND_EVENTS = {"charge.refunded", "refund.updated", "sandbox.refund.completed"}
ACTIVE_FULFILMENT_STATES = {
    "paid",
    "production_review",
    "approved_for_production",
    "in_production",
    "quality_check",
    "ready_to_ship",
    "shipped",
}
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "payment_pending": {"paid", "cancelled", "manual_review_required"},
    "paid": {
        "production_review",
        "refund_pending",
        "manual_review_required",
    },
    "production_review": {
        "approved_for_production",
        "manual_review_required",
        "refund_pending",
    },
    "approved_for_production": {
        "in_production",
        "manual_review_required",
        "refund_pending",
    },
    "in_production": {"quality_check", "manual_review_required", "refund_pending"},
    "quality_check": {"ready_to_ship", "manual_review_required", "refund_pending"},
    "ready_to_ship": {"shipped", "manual_review_required", "refund_pending"},
    "shipped": {"delivered", "manual_review_required", "refund_pending"},
    "delivered": {"refund_pending"},
    "manual_review_required": {
        "production_review",
        "cancelled",
    },
    "refund_pending": {"refunded", "manual_review_required"},
    "cancelled": set(),
    "refunded": set(),
}
TRACKING_TEMPLATES = {
    "canada-post": "https://www.canadapost-postescanada.ca/track-reperage/en#/details/{reference}",
    "ups": "https://www.ups.com/track?tracknum={reference}",
    "fedex": "https://www.fedex.com/fedextrack/?trknbr={reference}",
    "purolator": "https://www.purolator.com/en/shipping/tracker?pin={reference}",
}


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _money(amount: int, currency: str = "CAD") -> MoneyResponse:
    return MoneyResponse(
        currency=currency,
        amount_minor=amount,
        formatted=f"${Decimal(amount) / 100:,.2f} {currency}",
    )


def _problem(status: int, code: str, message: str, field: str) -> APIProblem:
    return APIProblem(status, code, message, ("request", field))  # type: ignore[arg-type]


class CommerceService:
    def __init__(
        self,
        session: Session,
        settings: Settings,
        provider: PaymentProvider,
        storage: ObjectStorage,
        *,
        clock: Callable[[], datetime] = utc_now,
        id_generator: IdGenerator = generate_resource_id,
        token_generator: TokenGenerator = generate_bearer_token,
    ) -> None:
        self._session = session
        self._settings = settings
        self._provider = provider
        self._storage = storage
        self._clock = clock
        self._id_generator = id_generator
        self._token_generator = token_generator
        self._cipher = ShippingCipher(settings)
        self._patterns = PatternRepository(session)

    def preview(
        self, authenticated: AuthenticatedAccount, request: VersionQuantityRequest
    ) -> PricingResponse:
        version, configuration, asset = self._owned_pricable_version(
            authenticated, request.project_version_id
        )
        del version
        book = self._active_price_book()
        return self._pricing_response(
            self._calculate(book, configuration, request.quantity), request.quantity
        )

    def create_quote(
        self, authenticated: AuthenticatedAccount, request: VersionQuantityRequest
    ) -> QuoteResponse:
        version, configuration, asset = self._owned_pricable_version(
            authenticated, request.project_version_id
        )
        book = self._active_price_book()
        calculated = self._calculate(book, configuration, request.quantity)
        now = self._clock()
        quote = CommerceQuote(
            id=self._new_id(),
            account_id=authenticated.account.id,
            project_version_id=version.id,
            price_book_id=book.id,
            status="active",
            currency=book.currency,
            quantity=request.quantity,
            unit_amount=calculated["unit_amount"],
            subtotal_amount=calculated["subtotal_amount"],
            configuration_snapshot=configuration.model_dump(mode="json", by_alias=True),
            pricing_snapshot=calculated["snapshot"],
            asset_snapshot=asset,
            tax_treatment="Tax is calculated by the hosted checkout provider.",
            shipping_treatment=(
                "Shipping is calculated by the hosted checkout provider."
            ),
            created_at=now,
            expires_at=now + timedelta(days=self._settings.quote_valid_days),
        )
        with service_transaction(self._session):
            self._session.add(quote)
            self._session.flush()
        return self._quote_response(quote)

    def list_quotes(self, authenticated: AuthenticatedAccount) -> list[QuoteResponse]:
        quotes = self._session.scalars(
            select(CommerceQuote)
            .where(CommerceQuote.account_id == authenticated.account.id)
            .order_by(CommerceQuote.created_at.desc(), CommerceQuote.id)
        ).all()
        self._expire_quotes(quotes)
        return [self._quote_response(item) for item in quotes]

    def get_quote(
        self, authenticated: AuthenticatedAccount, quote_id: str
    ) -> QuoteResponse:
        quote = self._owned_quote(authenticated, quote_id)
        self._expire_quotes([quote])
        return self._quote_response(quote)

    def reprice_quote(
        self,
        authenticated: AuthenticatedAccount,
        quote_id: str,
        request: RepriceQuoteRequest,
    ) -> QuoteResponse:
        old = self._owned_quote(authenticated, quote_id)
        if old.project_version_id is None:
            raise _problem(
                409,
                "invalid_value",
                "The source version is no longer available for repricing.",
                "quote",
            )
        return self.create_quote(
            authenticated,
            VersionQuantityRequest(
                projectVersionId=old.project_version_id,
                quantity=request.quantity or old.quantity,
            ),
        )

    def get_cart(self, authenticated: AuthenticatedAccount) -> CartResponse:
        cart = self._cart(authenticated)
        notices = self._clean_cart(cart)
        return self._cart_response(cart, notices)

    def add_to_cart(
        self, authenticated: AuthenticatedAccount, quote_id: str
    ) -> CartResponse:
        quote = self._owned_quote(authenticated, quote_id)
        self._expire_quotes([quote])
        if quote.status != "active":
            raise _problem(
                409,
                "invalid_value",
                "Only an active, unexpired quote can be added.",
                "quoteId",
            )
        self._revalidate_quote(authenticated, quote)
        cart = self._cart(authenticated)
        if cart.state != "active":
            raise _problem(
                409,
                "invalid_value",
                "Checkout is already being created for this cart.",
                "cart",
            )
        exists = self._session.scalar(
            select(CartLine.id).where(
                CartLine.cart_id == cart.id, CartLine.quote_id == quote.id
            )
        )
        if exists is not None:
            raise _problem(
                409, "invalid_value", "This quote is already in the cart.", "quoteId"
            )
        with service_transaction(self._session):
            self._session.add(
                CartLine(
                    id=self._new_id(),
                    cart_id=cart.id,
                    quote_id=quote.id,
                    quantity=quote.quantity,
                    created_at=self._clock(),
                )
            )
            cart.updated_at = self._clock()
        return self._cart_response(cart, [])

    def change_cart_line(
        self, authenticated: AuthenticatedAccount, line_id: str, quantity: int
    ) -> CartResponse:
        cart = self._cart(authenticated)
        line = self._owned_line(cart, line_id)
        old = self._session.get(CommerceQuote, line.quote_id)
        if old is None or old.project_version_id is None:
            raise _problem(
                409, "invalid_value", "The cart line can no longer be repriced.", "line"
            )
        replacement = self.create_quote(
            authenticated,
            VersionQuantityRequest(
                projectVersionId=old.project_version_id, quantity=quantity
            ),
        )
        with service_transaction(self._session):
            line.quote_id = replacement.id
            line.quantity = quantity
            cart.updated_at = self._clock()
        return self._cart_response(
            cart, ["Quantity changed and a new quote was created."]
        )

    def remove_cart_line(
        self, authenticated: AuthenticatedAccount, line_id: str
    ) -> CartResponse:
        cart = self._cart(authenticated)
        line = self._owned_line(cart, line_id)
        with service_transaction(self._session):
            self._session.delete(line)
            cart.updated_at = self._clock()
        return self._cart_response(cart, [])

    def empty_cart(self, authenticated: AuthenticatedAccount) -> CartResponse:
        cart = self._cart(authenticated)
        if cart.state != "active":
            raise _problem(
                409,
                "invalid_value",
                "A checkout is already pending for this cart.",
                "cart",
            )
        with service_transaction(self._session):
            self._session.execute(delete(CartLine).where(CartLine.cart_id == cart.id))
            cart.updated_at = self._clock()
        return self._cart_response(cart, [])

    def create_checkout(
        self,
        authenticated: AuthenticatedAccount,
        idempotency_key: str,
    ) -> CheckoutResponse:
        scoped_idempotency_key = hashlib.sha256(
            f"{authenticated.account.id}:{idempotency_key}".encode()
        ).hexdigest()
        prior = self._session.scalar(
            select(PaymentAttempt)
            .join(CustomerOrder, CustomerOrder.id == PaymentAttempt.order_id)
            .where(
                PaymentAttempt.idempotency_key == scoped_idempotency_key,
                CustomerOrder.account_id == authenticated.account.id,
            )
        )
        if prior is not None and prior.checkout_url:
            order = self._session.get(CustomerOrder, prior.order_id)
            assert order is not None
            return self._checkout_response(order, prior)
        cart = self._cart(authenticated, lock=True)
        notices = self._clean_cart(cart)
        if notices:
            raise _problem(
                409,
                "invalid_value",
                "Expired or invalid cart lines were removed. Review the cart "
                "and retry.",
                "cart",
            )
        if cart.state != "active":
            raise _problem(
                409,
                "invalid_value",
                "Checkout is already being created for this cart.",
                "cart",
            )
        rows = self._cart_rows(cart)
        if not rows:
            raise _problem(409, "invalid_value", "The cart is empty.", "cart")
        for _line, quote in rows:
            self._revalidate_quote(authenticated, quote)
        now = self._clock()
        order_id = self._new_id()
        order_reference = f"SC-DEMO-{order_id[:10].upper()}"
        line_snapshots = [
            self._order_line(index, line, quote)
            for index, (line, quote) in enumerate(rows)
        ]
        subtotal = sum(int(item["extendedAmountMinor"]) for item in line_snapshots)
        if subtotal > MAX_AMOUNT_MINOR:
            raise _problem(
                422,
                "value_out_of_range",
                "Cart total exceeds the demonstration limit.",
                "cart",
            )
        order = CustomerOrder(
            id=order_id,
            reference=order_reference,
            account_id=authenticated.account.id,
            state="payment_pending",
            payment_status="pending",
            currency="CAD",
            subtotal_amount=subtotal,
            tax_amount=0,
            shipping_amount=0,
            total_amount=subtotal,
            snapshot={
                "demonstration": self._provider.demonstration,
                "lines": line_snapshots,
            },
            created_at=now,
        )
        attempt = PaymentAttempt(
            id=self._new_id(),
            order_id=order.id,
            cart_id=cart.id,
            provider=self._provider.name,
            idempotency_key=scoped_idempotency_key,
            status="pending",
            expected_amount=subtotal,
            expected_currency="CAD",
            created_at=now,
            expires_at=now + CHECKOUT_LIFETIME,
        )
        with service_transaction(self._session):
            self._session.add(order)
            self._session.add(attempt)
            self._session.flush()
            for index, (_line, quote) in enumerate(rows):
                quote.status = "checked_out"
                if quote.asset_snapshot:
                    self._session.add(
                        ProductionAssetReservation(
                            id=self._new_id(),
                            attempt_id=attempt.id,
                            line_index=index,
                            derivative_id=str(quote.asset_snapshot["derivativeId"]),
                            checksum=str(quote.asset_snapshot["checksum"]),
                            processing_version=str(
                                quote.asset_snapshot["processingVersion"]
                            ),
                            status="reserved",
                            created_at=now,
                        )
                    )
            cart.state = "checkout_pending"
            cart.updated_at = now
            self._history(order, None, "checkout_created", None, "payment_pending", {})
        try:
            provider_session = self._provider.create_checkout(
                CheckoutPayload(
                    attempt_id=attempt.id,
                    order_id=order.id,
                    order_reference=order.reference,
                    amount_minor=subtotal,
                    currency="CAD",
                    lines=tuple(line_snapshots),
                    customer_email=authenticated.account.email,
                    expires_at_epoch=int(attempt.expires_at.timestamp()),
                    idempotency_key=scoped_idempotency_key,
                )
            )
        except ProviderError:
            self._cancel_attempt(attempt, order, "checkout_provider_failed")
            raise _problem(
                503,
                "storage_unavailable",
                "Hosted checkout is temporarily unavailable.",
                "checkout",
            ) from None
        with service_transaction(self._session):
            attempt.provider_session_id = provider_session.id
            attempt.checkout_url = provider_session.url
        return self._checkout_response(order, attempt)

    def sandbox_checkout(self, session_id: str) -> SandboxCheckoutResponse:
        if not isinstance(self._provider, SandboxProvider):
            raise _problem(
                404, "resource_not_found", "Sandbox checkout is unavailable.", "session"
            )
        attempt, order = self._attempt_by_session(session_id)
        if attempt.status == "pending" and _aware(attempt.expires_at) <= self._clock():
            self._cancel_attempt(attempt, order, "checkout_expired", status="cancelled")
        return SandboxCheckoutResponse(
            session_id=session_id,
            order_reference=order.reference,
            amount_minor=attempt.expected_amount,
            currency="CAD",
            status=attempt.status,
            expires_at=_aware(attempt.expires_at),
        )

    def complete_sandbox_checkout(
        self, session_id: str, request: CompleteSandboxCheckoutRequest
    ) -> WebhookResponse:
        if not isinstance(self._provider, SandboxProvider):
            raise _problem(
                404, "resource_not_found", "Sandbox checkout is unavailable.", "session"
            )
        attempt, order = self._attempt_by_session(session_id)
        if _aware(attempt.expires_at) <= self._clock():
            outcome = "cancel"
        else:
            outcome = request.outcome
        shipping_minor = 1200 if outcome == "success" else 0
        tax_minor = (
            int(
                (
                    Decimal(attempt.expected_amount + shipping_minor) * Decimal("0.13")
                ).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
            )
            if outcome == "success"
            else 0
        )
        event_type = {
            "success": "sandbox.checkout.completed",
            "failure": "sandbox.checkout.failed",
            "cancel": "sandbox.checkout.cancelled",
        }[outcome]
        event_id = f"evt_demo_{outcome}_{attempt.id}"
        raw = json.dumps(
            {
                "id": event_id,
                "type": event_type,
                "data": {
                    "session_id": session_id,
                    "order_id": order.id,
                    "amount_minor": attempt.expected_amount
                    + shipping_minor
                    + tax_minor,
                    "tax_minor": tax_minor,
                    "shipping_minor": shipping_minor,
                    "currency": "CAD",
                    "payment_id": f"pay_demo_{attempt.id}",
                    "shipping": request.shipping.model_dump(mode="json", by_alias=True),
                },
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        return self.process_webhook(raw, sandbox_signature(raw))

    def process_webhook(
        self, raw_body: bytes, signature: str | None
    ) -> WebhookResponse:
        try:
            event = self._provider.verify_webhook(raw_body, signature)
        except InvalidWebhook:
            raise _problem(
                400,
                "authentication_failed",
                "Webhook signature or payload could not be verified.",
                "signature",
            ) from None
        duplicate = self._session.scalar(
            select(PaymentEvent).where(
                PaymentEvent.provider == self._provider.name,
                PaymentEvent.provider_event_id == event.id,
            )
        )
        if duplicate is not None:
            return WebhookResponse(duplicate=True, outcome=duplicate.outcome)
        attempt = self._session.scalar(
            select(PaymentAttempt).where(
                PaymentAttempt.provider_session_id == event.session_id
            )
        )
        if attempt is None and event.payment_id:
            attempt = self._session.scalar(
                select(PaymentAttempt).where(
                    PaymentAttempt.provider_payment_id == event.payment_id
                )
            )
        if attempt is None and event.order_id:
            attempt = self._session.scalar(
                select(PaymentAttempt).where(PaymentAttempt.order_id == event.order_id)
            )
        digest = hashlib.sha256(raw_body).hexdigest()
        if attempt is None:
            with service_transaction(self._session):
                self._session.add(
                    PaymentEvent(
                        attempt_id=None,
                        provider=self._provider.name,
                        provider_event_id=event.id,
                        event_type=event.event_type,
                        payload_digest=digest,
                        outcome="unknown_order",
                        received_at=self._clock(),
                    )
                )
            return WebhookResponse(duplicate=False, outcome="unknown_order")
        order = self._session.get(CustomerOrder, attempt.order_id)
        if order is None or (event.order_id and event.order_id != order.id):
            return self._record_event(
                attempt, event.id, event.event_type, digest, "order_mismatch"
            )
        if event.event_type in REFUND_EVENTS:
            refund_mismatch = (
                event.payment_id is not None
                and attempt.provider_payment_id is not None
                and event.payment_id != attempt.provider_payment_id
            ) or (
                not self._provider.demonstration
                and (
                    event.amount_minor != order.total_amount
                    or event.currency != order.currency
                )
            )
            if refund_mismatch:
                self._manual_review(
                    order, attempt, "refund_amount_or_identity_mismatch"
                )
                return self._record_event(
                    attempt, event.id, event.event_type, digest, "manual_review"
                )
            outcome = self._apply_refund_event(attempt, order)
            return self._record_event(
                attempt, event.id, event.event_type, digest, outcome
            )
        if event.event_type in SUCCESS_EVENTS:
            reported_tax = event.tax_minor or 0
            reported_shipping = event.shipping_minor or 0
            expected_total = attempt.expected_amount + reported_tax + reported_shipping
            if (
                event.amount_minor != expected_total
                or event.currency != attempt.expected_currency
            ):
                self._manual_review(
                    order, attempt, "payment_amount_or_currency_mismatch"
                )
                return self._record_event(
                    attempt, event.id, event.event_type, digest, "manual_review"
                )
            if attempt.status in {"paid", "refund_pending", "refunded"}:
                return self._record_event(
                    attempt, event.id, event.event_type, digest, "out_of_order_ignored"
                )
            if event.shipping is None or event.payment_id is None:
                self._manual_review(order, attempt, "payment_data_incomplete")
                return self._record_event(
                    attempt, event.id, event.event_type, digest, "manual_review"
                )
            try:
                shipping = ShippingAddressRequest.model_validate(event.shipping)
                encrypted = self._cipher.encrypt(
                    order.id, shipping.model_dump(mode="json", by_alias=True)
                )
            except (ShippingEncryptionError, ValidationError):
                self._manual_review(order, attempt, "shipping_data_unavailable")
                return self._record_event(
                    attempt, event.id, event.event_type, digest, "manual_review"
                )
            try:
                promoted = self._promote_assets(attempt, order)
            except ObjectStorageError:
                self._manual_review(order, attempt, "production_asset_unavailable")
                return self._record_event(
                    attempt, event.id, event.event_type, digest, "manual_review"
                )
            with service_transaction(self._session):
                previous = order.state
                order.state = "paid"
                order.payment_status = "paid"
                order.tax_amount = reported_tax
                order.shipping_amount = reported_shipping
                order.total_amount = expected_total
                order.shipping_ciphertext = encrypted.ciphertext
                order.shipping_nonce = encrypted.nonce
                order.shipping_key_id = encrypted.key_id
                order.paid_at = self._clock()
                attempt.status = "paid"
                attempt.provider_payment_id = event.payment_id
                self._session.add_all(promoted)
                self._session.flush()
                create_paid_order_work(self._session, order, self._clock())
                for reservation in self._reservations(attempt.id):
                    self._session.delete(reservation)
                cart = self._session.get(ShoppingCart, attempt.cart_id)
                if cart:
                    cart.state = "closed"
                self._history(order, None, "payment_verified", previous, "paid", {})
            return self._record_event(
                attempt, event.id, event.event_type, digest, "paid"
            )
        if event.event_type in FAILURE_EVENTS | CANCEL_EVENTS:
            if attempt.status in {"paid", "refund_pending", "refunded"}:
                return self._record_event(
                    attempt,
                    event.id,
                    event.event_type,
                    digest,
                    "out_of_order_ignored",
                )
            outcome = "failed" if event.event_type in FAILURE_EVENTS else "cancelled"
            self._cancel_attempt(attempt, order, f"payment_{outcome}", status=outcome)
            return self._record_event(
                attempt, event.id, event.event_type, digest, outcome
            )
        return self._record_event(
            attempt, event.id, event.event_type, digest, "ignored"
        )

    def list_orders(self, authenticated: AuthenticatedAccount) -> list[OrderResponse]:
        self._expire_pending_attempts(authenticated.account.id)
        orders = self._session.scalars(
            select(CustomerOrder)
            .where(CustomerOrder.account_id == authenticated.account.id)
            .order_by(CustomerOrder.created_at.desc(), CustomerOrder.id)
        ).all()
        return [self._order_response(order, include_shipping=False) for order in orders]

    def get_order(
        self, authenticated: AuthenticatedAccount, order_id: str
    ) -> OrderResponse:
        self._expire_pending_attempts(authenticated.account.id)
        order = self._session.scalar(
            select(CustomerOrder).where(
                CustomerOrder.id == order_id,
                CustomerOrder.account_id == authenticated.account.id,
            )
        )
        if order is None:
            raise _problem(
                404, "resource_not_found", "Order resource not found.", "order_id"
            )
        return self._order_response(order, include_shipping=True)

    def list_admin_orders(self, actor: AuthenticatedAccount) -> list[OrderResponse]:
        self._require_admin(actor)
        orders = self._session.scalars(
            select(CustomerOrder)
            .where(
                CustomerOrder.payment_status.in_(
                    ("paid", "refund_pending", "refunded", "manual_review")
                )
            )
            .order_by(CustomerOrder.created_at, CustomerOrder.id)
        ).all()
        return [self._order_response(order, include_shipping=False) for order in orders]

    def get_admin_order(
        self, actor: AuthenticatedAccount, order_id: str
    ) -> OrderResponse:
        self._require_admin(actor)
        order = self._order(order_id)
        return self._order_response(order, include_shipping=True)

    def transition_order(
        self,
        actor: AuthenticatedAccount,
        order_id: str,
        request: TransitionOrderRequest,
    ) -> OrderResponse:
        self._require_admin(actor)
        order = self._order(order_id)
        if request.target_state not in ALLOWED_TRANSITIONS.get(order.state, set()):
            raise _problem(
                409,
                "invalid_value",
                "The requested order transition is not allowed.",
                "targetState",
            )
        if (
            order.state == "manual_review_required"
            and order.payment_status != "paid"
            and request.target_state == "production_review"
        ):
            raise _problem(
                409,
                "invalid_value",
                "An unverified payment cannot enter production.",
                "targetState",
            )
        if (
            order.state == "manual_review_required"
            and order.payment_status == "paid"
            and request.target_state == "cancelled"
        ):
            raise _problem(
                409,
                "invalid_value",
                "A verified payment must use the refund workflow.",
                "targetState",
            )
        if request.target_state == "manual_review_required" and (
            request.reason.code == "none" or not request.reason.message.strip()
        ):
            raise _problem(
                422,
                "invalid_value",
                "Manual review requires a structured issue reason.",
                "reason",
            )
        previous = order.state
        data = request.reason.model_dump(mode="json")
        with service_transaction(self._session):
            order.state = request.target_state
            if request.target_state == "cancelled":
                order.payment_status = "cancelled"
                attempt = self._session.scalar(
                    select(PaymentAttempt).where(
                        PaymentAttempt.order_id == order.id,
                        PaymentAttempt.status.not_in(
                            ("paid", "refund_pending", "refunded")
                        ),
                    )
                )
                if attempt is not None:
                    attempt.status = "cancelled"
                    for reservation in self._reservations(attempt.id):
                        self._session.delete(reservation)
                    if attempt.cart_id:
                        cart = self._session.get(ShoppingCart, attempt.cart_id)
                        if cart is not None:
                            cart.state = "active"
            if request.target_state == "refunded":
                order.payment_status = "refunded"
            if request.target_state in {"delivered", "cancelled", "refunded"}:
                order.completed_at = self._clock()
            self._history(
                order, actor.account.id, "admin_transition", previous, order.state, data
            )
            self._audit(
                actor,
                "order.transition",
                "order",
                order.id,
                {"from": previous, "to": order.state, "reason": data},
            )
        return self._order_response(order, include_shipping=True)

    def update_shipment(
        self, actor: AuthenticatedAccount, order_id: str, request: ShipmentRequest
    ) -> OrderResponse:
        self._require_admin(actor)
        order = self._order(order_id)
        if order.state not in {"ready_to_ship", "shipped", "delivered"}:
            raise _problem(
                409,
                "invalid_value",
                "Shipment can be recorded only when an order is ready to ship.",
                "shipment",
            )
        if request.delivered_at and request.delivered_at < request.shipped_at:
            raise _problem(
                422, "invalid_value", "Delivery cannot precede shipment.", "deliveredAt"
            )
        shipment = self._session.get(Shipment, order.id)
        previous = order.state
        with service_transaction(self._session):
            if shipment is None:
                shipment = Shipment(
                    order_id=order.id,
                    carrier=request.carrier,
                    tracking_reference=request.tracking_reference,
                    shipped_at=request.shipped_at,
                    delivered_at=request.delivered_at,
                )
                self._session.add(shipment)
            else:
                shipment.carrier = request.carrier
                shipment.tracking_reference = request.tracking_reference
                shipment.shipped_at = request.shipped_at
                shipment.delivered_at = request.delivered_at
            order.state = "delivered" if request.delivered_at else "shipped"
            if request.delivered_at:
                order.completed_at = request.delivered_at
            self._history(
                order,
                actor.account.id,
                "fulfilment_updated",
                previous,
                order.state,
                {"carrier": request.carrier},
            )
            self._audit(
                actor,
                "order.fulfilment",
                "order",
                order.id,
                {"carrier": request.carrier, "delivered": bool(request.delivered_at)},
            )
        return self._order_response(order, include_shipping=True)

    def refund(self, actor: AuthenticatedAccount, order_id: str) -> OrderResponse:
        self._require_admin(actor)
        order = self._order(order_id)
        if order.payment_status in {"refund_pending", "refunded"}:
            return self._order_response(order, include_shipping=True)
        if order.payment_status != "paid" or order.state in {"refunded", "cancelled"}:
            raise _problem(
                409,
                "invalid_value",
                "This order is not eligible for a full refund.",
                "order",
            )
        attempt = self._session.scalar(
            select(PaymentAttempt).where(
                PaymentAttempt.order_id == order.id, PaymentAttempt.status == "paid"
            )
        )
        if attempt is None or not attempt.provider_payment_id:
            raise _problem(
                409,
                "invalid_value",
                "A verified payment is required before refund.",
                "order",
            )
        previous = order.state
        refund_key = hashlib.sha256(f"refund:{order.id}".encode()).hexdigest()
        with service_transaction(self._session):
            order.state = "refund_pending"
            order.payment_status = "refund_pending"
            attempt.status = "refund_pending"
            self._history(
                order,
                actor.account.id,
                "refund_requested",
                previous,
                "refund_pending",
                {},
            )
            self._audit(actor, "refund.requested", "order", order.id, {"full": True})
        try:
            raw = self._provider.create_refund(
                attempt.provider_payment_id, order.id, refund_key
            )
        except ProviderError:
            raise _problem(
                503,
                "storage_unavailable",
                "Refund provider is temporarily unavailable; the request "
                "remains pending.",
                "refund",
            ) from None
        if isinstance(self._provider, SandboxProvider):
            event = json.loads(raw)
            event["type"] = "sandbox.refund.completed"
            event["data"]["session_id"] = attempt.provider_session_id
            raw = json.dumps(event, sort_keys=True, separators=(",", ":")).encode()
            self.process_webhook(raw, sandbox_signature(raw))
        return self._order_response(order, include_shipping=True)

    def list_price_books(self, actor: AuthenticatedAccount) -> list[PriceBookResponse]:
        self._require_admin(actor)
        return [
            self._book_response(item)
            for item in self._session.scalars(
                select(PriceBook).order_by(PriceBook.version.desc())
            ).all()
        ]

    def create_price_book(
        self, actor: AuthenticatedAccount, request: PriceBookRequest
    ) -> PriceBookResponse:
        self._require_admin(actor)
        version = (
            int(self._session.scalar(select(func.max(PriceBook.version))) or 0) + 1
        )
        book = PriceBook(
            id=self._new_id(),
            version=version,
            label=request.label,
            state="draft",
            currency="CAD",
            configuration=request.configuration.model_dump(mode="json", by_alias=True),
            created_by=actor.account.id,
            created_at=self._clock(),
        )
        with service_transaction(self._session):
            self._session.add(book)
            self._audit(
                actor, "price_book.drafted", "price_book", book.id, {"version": version}
            )
        return self._book_response(book)

    def update_price_book(
        self, actor: AuthenticatedAccount, book_id: str, request: PriceBookRequest
    ) -> PriceBookResponse:
        self._require_admin(actor)
        book = self._session.get(PriceBook, book_id)
        if book is None:
            raise _problem(
                404, "resource_not_found", "Price book not found.", "price_book_id"
            )
        if book.state != "draft":
            raise _problem(
                409,
                "invalid_value",
                "Published price books cannot be edited.",
                "price_book",
            )
        with service_transaction(self._session):
            book.label = request.label
            book.configuration = request.configuration.model_dump(
                mode="json", by_alias=True
            )
            self._audit(
                actor,
                "price_book.updated",
                "price_book",
                book.id,
                {"version": book.version},
            )
        return self._book_response(book)

    def publish_price_book(
        self, actor: AuthenticatedAccount, book_id: str, effective_at: datetime | None
    ) -> PriceBookResponse:
        self._require_admin(actor)
        book = self._session.get(PriceBook, book_id)
        if book is None:
            raise _problem(
                404, "resource_not_found", "Price book not found.", "price_book_id"
            )
        if book.state != "draft":
            raise _problem(
                409,
                "invalid_value",
                "Only a draft price book can be published.",
                "price_book",
            )
        now = self._clock()
        with service_transaction(self._session):
            book.state = "published"
            book.effective_at = effective_at or now
            book.published_at = now
            book.published_by = actor.account.id
            self._audit(
                actor,
                "price_book.published",
                "price_book",
                book.id,
                {"version": book.version},
            )
        return self._book_response(book)

    def audit_history(self, actor: AuthenticatedAccount) -> list[AuditResponse]:
        self._require_admin(actor)
        return [
            AuditResponse(
                id=item.id,
                actor_account_id=item.actor_account_id,
                action=item.action,
                target_type=item.target_type,
                target_id=item.target_id,
                data=item.data,
                created_at=_aware(item.created_at),
            )
            for item in self._session.scalars(
                select(AuditEvent)
                .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
                .limit(500)
            ).all()
        ]

    def production_asset_access(
        self, actor: AuthenticatedAccount, order_id: str, line_index: int
    ) -> ProductionAssetAccessResponse:
        self._require_admin(actor)
        self._order(order_id)
        asset = self._session.scalar(
            select(OrderProductionAsset).where(
                OrderProductionAsset.order_id == order_id,
                OrderProductionAsset.line_index == line_index,
            )
        )
        if asset is None:
            raise _problem(
                404, "resource_not_found", "Production asset not found.", "asset"
            )
        token = self._token_generator()
        expires = self._clock() + ASSET_ACCESS_LIFETIME
        with service_transaction(self._session):
            asset.access_token_hash = hash_token(token)
            asset.access_expires_at = expires
            self._audit(
                actor,
                "production_asset.access",
                "order",
                order_id,
                {"lineIndex": line_index},
            )
        return ProductionAssetAccessResponse(
            url=f"/production-assets/{token}",
            expires_at=expires,
            checksum=asset.checksum,
            processing_version=asset.processing_version,
        )

    def read_production_asset(self, token: str) -> bytes:
        digest = hash_token(token)
        asset = self._session.scalar(
            select(OrderProductionAsset).where(
                OrderProductionAsset.access_token_hash == digest
            )
        )
        if (
            asset is None
            or asset.access_expires_at is None
            or _aware(asset.access_expires_at) <= self._clock()
            or not token_hash_matches(token, asset.access_token_hash or "")
        ):
            raise _problem(
                404, "resource_not_found", "Production asset not found.", "asset"
            )
        try:
            return self._storage.read(asset.object_key)
        except ObjectStorageError:
            raise _problem(
                404, "resource_not_found", "Production asset not found.", "asset"
            ) from None

    # Internal validation and response mapping
    def _owned_pricable_version(
        self, authenticated: AuthenticatedAccount, version_id: str
    ) -> tuple[ProjectVersion, ProjectConfiguration, dict[str, object] | None]:
        version = self._session.scalar(
            select(ProjectVersion).where(
                ProjectVersion.id == version_id,
                ProjectVersion.account_id == authenticated.account.id,
            )
        )
        if version is None:
            raise _problem(
                404,
                "resource_not_found",
                "Project version not found.",
                "projectVersionId",
            )
        configuration = ProjectConfiguration.model_validate(version.configuration)
        common = configuration.model_dump(
            mode="json", by_alias=True, exclude={"pattern"}
        )
        placeholder = (
            configuration.pattern.pattern_id
            if configuration.pattern.kind == "built-in"
            else "terrace-wave"
        )
        DesignService._validate_configuration(
            DesignConfiguration.model_validate({**common, "patternId": placeholder})
        )
        if configuration.pattern.kind == "built-in":
            if not self._patterns.is_active(configuration.pattern.pattern_id):
                raise _problem(
                    422,
                    "pattern_unavailable",
                    "Selected pattern is unavailable for pricing.",
                    "pattern",
                )
            return version, configuration, None
        row = self._session.execute(
            select(ProjectCustomPatternReference, CustomUpload, CustomDerivative)
            .join(
                CustomUpload, CustomUpload.id == ProjectCustomPatternReference.upload_id
            )
            .join(
                CustomDerivative,
                CustomDerivative.id == ProjectCustomPatternReference.derivative_id,
            )
            .where(
                ProjectCustomPatternReference.version_id == version.id,
                ProjectCustomPatternReference.account_id == authenticated.account.id,
                CustomUpload.state == "approved",
                CustomDerivative.kind == "tile",
                CustomDerivative.processing_version
                == ProjectCustomPatternReference.processing_version,
            )
        ).one_or_none()
        if row is None:
            raise _problem(
                422,
                "pattern_unavailable",
                "Selected custom pattern is unavailable for pricing.",
                "pattern",
            )
        reference, upload, derivative = row
        if (
            configuration.pattern.asset_id != upload.id
            or configuration.pattern.derivative_id != derivative.id
        ):
            raise _problem(
                422,
                "pattern_unavailable",
                "Custom pattern identity does not match the immutable version.",
                "pattern",
            )
        return (
            version,
            configuration,
            {
                "uploadId": upload.id,
                "derivativeId": derivative.id,
                "checksum": derivative.checksum,
                "processingVersion": derivative.processing_version,
            },
        )

    def _active_price_book(self) -> PriceBook:
        now = self._clock()
        book = self._session.scalar(
            select(PriceBook)
            .where(
                PriceBook.state == "published",
                PriceBook.currency == self._settings.commerce_currency,
                PriceBook.effective_at.is_not(None),
                PriceBook.effective_at <= now,
            )
            .order_by(PriceBook.version.desc())
            .limit(1)
        )
        if book is None:
            raise _problem(
                503,
                "storage_unavailable",
                "No published demonstration price book is currently effective.",
                "pricing",
            )
        PriceBookConfiguration.model_validate(book.configuration)
        return book

    def _calculate(
        self, book: PriceBook, configuration: ProjectConfiguration, quantity: int
    ) -> dict[str, object]:
        rules = PriceBookConfiguration.model_validate(book.configuration)
        if quantity < rules.quantity_minimum or quantity > rules.quantity_maximum:
            raise _problem(
                422,
                "value_out_of_range",
                "Quantity is outside the published price-book bounds.",
                "quantity",
            )
        factor = Decimal("1") if configuration.unit == "cm" else Decimal("2.54")
        width = Decimal(str(configuration.width)) * factor
        height = Decimal(str(configuration.height)) * factor
        thickness = Decimal(str(configuration.thickness)) * factor
        back = (
            Decimal(str(configuration.back_width)) * factor
            if configuration.back_width is not None
            else None
        )
        if configuration.shape == "round":
            area = PI * (width / 2) ** 2
        elif configuration.shape == "tapered" and back is not None:
            area = (width + back) / 2 * height
        else:
            area = width * height
        dimensions = width + height + thickness + (back or Decimal("0"))
        values = [
            (
                "shape-base",
                "Shape base",
                Decimal(rules.shape_base_minor[configuration.shape]),
                configuration.shape,
            ),
            (
                "area",
                "Face-area component",
                area * rules.area_rate_minor_per_square_cm,
                f"{area.quantize(Decimal('0.01'))} cm²",
            ),
            (
                "dimensions",
                "Dimension component",
                dimensions * rules.dimension_rate_minor_per_cm,
                f"{dimensions.quantize(Decimal('0.01'))} cm",
            ),
            (
                "material",
                "Material adjustment",
                Decimal(rules.material_adjustment_minor[configuration.material_id]),
                configuration.material_id,
            ),
            (
                "fit",
                "Fit adjustment",
                Decimal(rules.fit_adjustment_minor[configuration.fit_preference]),
                configuration.fit_preference,
            ),
            (
                "closure",
                "Closure/access adjustment",
                Decimal(rules.closure_adjustment_minor[configuration.closure_type]),
                configuration.closure_type,
            ),
            (
                "edge",
                "Edge-finish adjustment",
                Decimal(rules.edge_adjustment_minor[configuration.seam_style]),
                configuration.seam_style,
            ),
            (
                "pattern",
                "Pattern adjustment",
                Decimal(rules.pattern_adjustment_minor[configuration.pattern.kind]),
                configuration.pattern.kind,
            ),
        ]
        breakdown: list[dict[str, object]] = []
        total = 0
        for code, label, raw, basis in values:
            minor = int(raw.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
            total += minor
            breakdown.append(
                {"code": code, "label": label, "amountMinor": minor, "basis": basis}
            )
        if total < 0 or total > MAX_AMOUNT_MINOR or total * quantity > MAX_AMOUNT_MINOR:
            raise _problem(
                422,
                "value_out_of_range",
                "Calculated amount is outside the demonstration bounds.",
                "configuration",
            )
        return {
            "unit_amount": total,
            "subtotal_amount": total * quantity,
            "snapshot": {
                "priceBookId": book.id,
                "priceBookVersion": book.version,
                "priceBookLabel": book.label,
                "currency": book.currency,
                "rounding": rules.rounding,
                "breakdown": breakdown,
                "unitAmountMinor": total,
                "subtotalAmountMinor": total * quantity,
                "configuration": rules.model_dump(mode="json", by_alias=True),
            },
        }

    def _pricing_response(
        self, calculated: dict[str, object], quantity: int
    ) -> PricingResponse:
        snapshot = calculated["snapshot"]
        assert isinstance(snapshot, dict)
        return PricingResponse(
            model_label=str(snapshot["priceBookLabel"]),
            price_book_version=int(snapshot["priceBookVersion"]),
            currency="CAD",
            quantity=quantity,
            unit_amount_minor=int(calculated["unit_amount"]),
            subtotal_amount_minor=int(calculated["subtotal_amount"]),
            subtotal_formatted=_money(int(calculated["subtotal_amount"])).formatted,
            breakdown=[
                PricingComponentResponse.model_validate(item)
                for item in snapshot["breakdown"]
            ],
            tax_treatment="Tax is calculated by the hosted checkout provider.",
            shipping_treatment=(
                "Shipping is calculated by the hosted checkout provider."
            ),
        )

    def _quote_response(self, quote: CommerceQuote) -> QuoteResponse:
        snapshot = quote.pricing_snapshot
        now = self._clock()
        status = (
            "expired"
            if quote.status == "active" and _aware(quote.expires_at) <= now
            else quote.status
        )
        return QuoteResponse(
            id=quote.id,
            status=status,
            project_version_id=quote.project_version_id,
            configuration=ProjectConfiguration.model_validate(
                quote.configuration_snapshot
            ),
            created_at=_aware(quote.created_at),
            expires_at=_aware(quote.expires_at),
            can_checkout=status == "active",
            custom_asset=quote.asset_snapshot,
            model_label=str(snapshot["priceBookLabel"]),
            price_book_version=int(snapshot["priceBookVersion"]),
            currency="CAD",
            quantity=quote.quantity,
            unit_amount_minor=quote.unit_amount,
            subtotal_amount_minor=quote.subtotal_amount,
            subtotal_formatted=_money(quote.subtotal_amount).formatted,
            breakdown=[
                PricingComponentResponse.model_validate(item)
                for item in snapshot["breakdown"]
            ],
            tax_treatment=quote.tax_treatment,
            shipping_treatment=quote.shipping_treatment,
        )

    def _owned_quote(
        self, authenticated: AuthenticatedAccount, quote_id: str
    ) -> CommerceQuote:
        quote = self._session.scalar(
            select(CommerceQuote).where(
                CommerceQuote.id == quote_id,
                CommerceQuote.account_id == authenticated.account.id,
            )
        )
        if quote is None:
            raise _problem(
                404, "resource_not_found", "Quote resource not found.", "quote_id"
            )
        return quote

    def _expire_quotes(self, quotes: list[CommerceQuote]) -> None:
        expired = [
            item
            for item in quotes
            if item.status == "active" and _aware(item.expires_at) <= self._clock()
        ]
        if expired:
            with service_transaction(self._session):
                for item in expired:
                    item.status = "expired"

    def _revalidate_quote(
        self, authenticated: AuthenticatedAccount, quote: CommerceQuote
    ) -> None:
        if quote.project_version_id is None:
            raise _problem(
                409,
                "invalid_value",
                "The quote source version no longer exists.",
                "quote",
            )
        _version, configuration, asset = self._owned_pricable_version(
            authenticated, quote.project_version_id
        )
        if (
            configuration.model_dump(mode="json", by_alias=True)
            != quote.configuration_snapshot
            or asset != quote.asset_snapshot
        ):
            raise _problem(
                409,
                "invalid_value",
                "The quote configuration or production asset is no longer valid.",
                "quote",
            )

    def _cart(
        self, authenticated: AuthenticatedAccount, *, lock: bool = False
    ) -> ShoppingCart:
        self._expire_pending_attempts(authenticated.account.id)
        statement = select(ShoppingCart).where(
            ShoppingCart.account_id == authenticated.account.id
        )
        if lock:
            statement = statement.with_for_update()
        cart = self._session.scalar(statement)
        if cart is None:
            cart = ShoppingCart(
                id=self._new_id(),
                account_id=authenticated.account.id,
                state="active",
                created_at=self._clock(),
                updated_at=self._clock(),
            )
            with service_transaction(self._session):
                self._session.add(cart)
        elif cart.state == "closed":
            with service_transaction(self._session):
                self._session.execute(
                    delete(CartLine).where(CartLine.cart_id == cart.id)
                )
                cart.state = "active"
                cart.updated_at = self._clock()
        return cart

    def _expire_pending_attempts(self, account_id: str) -> None:
        attempts = self._session.scalars(
            select(PaymentAttempt)
            .join(CustomerOrder, CustomerOrder.id == PaymentAttempt.order_id)
            .where(
                CustomerOrder.account_id == account_id,
                PaymentAttempt.status == "pending",
                PaymentAttempt.expires_at <= self._clock(),
            )
        ).all()
        for attempt in attempts:
            order = self._session.get(CustomerOrder, attempt.order_id)
            if order is not None:
                self._cancel_attempt(
                    attempt, order, "checkout_expired", status="cancelled"
                )

    def _cart_rows(self, cart: ShoppingCart) -> list[tuple[CartLine, CommerceQuote]]:
        return list(
            self._session.execute(
                select(CartLine, CommerceQuote)
                .join(CommerceQuote, CommerceQuote.id == CartLine.quote_id)
                .where(CartLine.cart_id == cart.id)
                .order_by(CartLine.created_at, CartLine.id)
            ).all()
        )

    def _clean_cart(self, cart: ShoppingCart) -> list[str]:
        if cart.state != "active":
            return []
        notices: list[str] = []
        remove: list[str] = []
        for line, quote in self._cart_rows(cart):
            if (
                quote.status != "active"
                or _aware(quote.expires_at) <= self._clock()
                or line.quantity != quote.quantity
            ):
                remove.append(line.id)
                notices.append(
                    f"Quote {quote.id} was removed because it expired or became "
                    "invalid."
                )
        if remove:
            with service_transaction(self._session):
                self._session.execute(delete(CartLine).where(CartLine.id.in_(remove)))
                cart.updated_at = self._clock()
        return notices

    def _cart_response(self, cart: ShoppingCart, notices: list[str]) -> CartResponse:
        lines: list[CartLineResponse] = []
        total = 0
        for line, quote in self._cart_rows(cart):
            amount = quote.unit_amount * line.quantity
            total += amount
            lines.append(
                CartLineResponse(
                    id=line.id,
                    quote=self._quote_response(quote),
                    quantity=line.quantity,
                    extended_amount_minor=amount,
                )
            )
        return CartResponse(
            id=cart.id,
            state=cart.state,
            currency="CAD",
            lines=lines,
            subtotal_amount_minor=total,
            subtotal_formatted=_money(total).formatted,
            notices=notices,
        )

    def _owned_line(self, cart: ShoppingCart, line_id: str) -> CartLine:
        line = self._session.scalar(
            select(CartLine).where(CartLine.id == line_id, CartLine.cart_id == cart.id)
        )
        if line is None:
            raise _problem(404, "resource_not_found", "Cart line not found.", "line_id")
        return line

    def _order_line(
        self, index: int, line: CartLine, quote: CommerceQuote
    ) -> dict[str, object]:
        configuration = ProjectConfiguration.model_validate(
            quote.configuration_snapshot
        )
        return {
            "lineIndex": index,
            "quoteId": quote.id,
            "projectVersionId": quote.project_version_id,
            "quantity": line.quantity,
            "unitAmountMinor": quote.unit_amount,
            "extendedAmountMinor": quote.unit_amount * line.quantity,
            "currency": quote.currency,
            "configuration": quote.configuration_snapshot,
            "pricing": quote.pricing_snapshot,
            "productionSpecification": {
                "shape": configuration.shape,
                "measurements": {
                    "width": str(configuration.width),
                    "height": str(configuration.height),
                    "backWidth": str(configuration.back_width)
                    if configuration.back_width is not None
                    else None,
                    "thickness": str(configuration.thickness),
                    "unit": configuration.unit,
                },
                "material": configuration.material_id,
                "fit": configuration.fit_preference,
                "closureAccess": configuration.closure_type,
                "edgeFinish": configuration.seam_style,
                "pattern": configuration.pattern.model_dump(mode="json", by_alias=True),
                "patternScale": str(configuration.pattern_scale),
                "preview": (
                    "Configuration preview is rendered from this immutable "
                    "specification."
                ),
                "configurationVersionReference": quote.project_version_id,
                "quoteReference": quote.id,
                "customAsset": quote.asset_snapshot,
            },
        }

    def _checkout_response(
        self, order: CustomerOrder, attempt: PaymentAttempt
    ) -> CheckoutResponse:
        return CheckoutResponse(
            demonstration=self._provider.demonstration,
            order_id=order.id,
            order_reference=order.reference,
            checkout_url=attempt.checkout_url or "",
            expires_at=_aware(attempt.expires_at),
        )

    def _attempt_by_session(
        self, session_id: str
    ) -> tuple[PaymentAttempt, CustomerOrder]:
        attempt = self._session.scalar(
            select(PaymentAttempt).where(
                PaymentAttempt.provider_session_id == session_id
            )
        )
        if attempt is None:
            raise _problem(
                404, "resource_not_found", "Checkout session not found.", "session"
            )
        order = self._session.get(CustomerOrder, attempt.order_id)
        if order is None:
            raise _problem(
                404, "resource_not_found", "Checkout session not found.", "session"
            )
        return attempt, order

    def _reservations(self, attempt_id: str) -> list[ProductionAssetReservation]:
        return list(
            self._session.scalars(
                select(ProductionAssetReservation).where(
                    ProductionAssetReservation.attempt_id == attempt_id
                )
            ).all()
        )

    def _promote_assets(
        self, attempt: PaymentAttempt, order: CustomerOrder
    ) -> list[OrderProductionAsset]:
        promoted: list[OrderProductionAsset] = []
        for reservation in self._reservations(attempt.id):
            if reservation.status == "promoted":
                continue
            derivative = self._session.get(CustomDerivative, reservation.derivative_id)
            if (
                derivative is None
                or derivative.checksum != reservation.checksum
                or derivative.processing_version != reservation.processing_version
            ):
                raise ObjectStorageError("reserved production asset changed")
            data = self._storage.read(derivative.object_key)
            if hashlib.sha256(data).hexdigest() != reservation.checksum:
                raise ObjectStorageError("reserved production asset checksum mismatch")
            object_key = (
                f"orders/{order.id}/{reservation.line_index}-"
                f"{reservation.checksum[:16]}.bin"
            )
            self._storage.write(object_key, data, derivative.content_type)
            promoted.append(
                OrderProductionAsset(
                    id=self._new_id(),
                    order_id=order.id,
                    line_index=reservation.line_index,
                    object_key=object_key,
                    checksum=reservation.checksum,
                    processing_version=reservation.processing_version,
                    created_at=self._clock(),
                )
            )
        return promoted

    def _cancel_attempt(
        self,
        attempt: PaymentAttempt,
        order: CustomerOrder,
        action: str,
        *,
        status: str = "cancelled",
    ) -> None:
        if attempt.status != "pending":
            return
        previous = order.state
        with service_transaction(self._session):
            attempt.status = status
            order.payment_status = status
            order.state = "cancelled"
            order.completed_at = self._clock()
            for reservation in self._reservations(attempt.id):
                self._session.delete(reservation)
            cart = self._session.get(ShoppingCart, attempt.cart_id)
            if cart:
                cart.state = "active"
            self._history(order, None, action, previous, "cancelled", {})

    def _manual_review(
        self, order: CustomerOrder, attempt: PaymentAttempt, reason: str
    ) -> None:
        previous = order.state
        with service_transaction(self._session):
            order.state = "manual_review_required"
            order.payment_status = "manual_review"
            attempt.status = "manual_review"
            self._history(
                order,
                None,
                "manual_review_required",
                previous,
                order.state,
                {"code": reason},
            )

    def _record_event(
        self,
        attempt: PaymentAttempt,
        event_id: str,
        event_type: str,
        digest: str,
        outcome: str,
    ) -> WebhookResponse:
        with service_transaction(self._session):
            self._session.add(
                PaymentEvent(
                    attempt_id=attempt.id,
                    provider=self._provider.name,
                    provider_event_id=event_id,
                    event_type=event_type,
                    payload_digest=digest,
                    outcome=outcome,
                    received_at=self._clock(),
                )
            )
        return WebhookResponse(duplicate=False, outcome=outcome)

    def _apply_refund_event(self, attempt: PaymentAttempt, order: CustomerOrder) -> str:
        if order.payment_status == "refunded":
            return "out_of_order_ignored"
        if order.payment_status != "refund_pending":
            self._manual_review(order, attempt, "unexpected_refund_event")
            return "manual_review"
        previous = order.state
        with service_transaction(self._session):
            order.state = "refunded"
            order.payment_status = "refunded"
            order.completed_at = self._clock()
            attempt.status = "refunded"
            self._history(order, None, "refund_verified", previous, "refunded", {})
        return "refunded"

    def _order(self, order_id: str) -> CustomerOrder:
        order = self._session.get(CustomerOrder, order_id)
        if order is None:
            raise _problem(
                404, "resource_not_found", "Order resource not found.", "order_id"
            )
        return order

    def _order_response(
        self, order: CustomerOrder, *, include_shipping: bool
    ) -> OrderResponse:
        shipment = self._session.get(Shipment, order.id)
        shipping_address = None
        if (
            include_shipping
            and order.shipping_ciphertext
            and order.shipping_nonce
            and order.shipping_key_id
        ):
            shipping_address = self._cipher.decrypt(
                order.id,
                order.shipping_ciphertext,
                order.shipping_nonce,
                order.shipping_key_id,
            )
        history = self._session.scalars(
            select(OrderHistory)
            .where(OrderHistory.order_id == order.id)
            .order_by(OrderHistory.created_at, OrderHistory.id)
        ).all()
        return OrderResponse(
            id=order.id,
            reference=order.reference,
            demonstration=bool(order.snapshot.get("demonstration", False)),
            created_at=_aware(order.created_at),
            state=order.state,
            payment_status=order.payment_status,
            currency="CAD",
            subtotal_amount_minor=order.subtotal_amount,
            tax_amount_minor=order.tax_amount,
            shipping_amount_minor=order.shipping_amount,
            total_amount_minor=order.total_amount,
            total_formatted=_money(order.total_amount).formatted,
            lines=list(order.snapshot.get("lines", [])),
            shipment=self._shipment_response(shipment) if shipment else None,
            shipping_address=shipping_address,
            timeline=[
                TimelineEntryResponse(
                    action=item.action,
                    from_state=item.from_state,
                    to_state=item.to_state,
                    data=item.data,
                    created_at=_aware(item.created_at),
                )
                for item in history
            ],
        )

    def _shipment_response(self, shipment: Shipment) -> ShipmentResponse:
        template = TRACKING_TEMPLATES.get(shipment.carrier)
        safe_reference = shipment.tracking_reference.replace(" ", "")
        return ShipmentResponse(
            carrier=shipment.carrier,
            tracking_reference=shipment.tracking_reference,
            tracking_url=template.format(reference=safe_reference)
            if template
            else None,
            shipped_at=_aware(shipment.shipped_at),
            delivered_at=_aware(shipment.delivered_at)
            if shipment.delivered_at
            else None,
        )

    def _history(
        self,
        order: CustomerOrder,
        actor_id: str | None,
        action: str,
        from_state: str | None,
        to_state: str | None,
        data: dict[str, object],
    ) -> None:
        self._session.add(
            OrderHistory(
                order_id=order.id,
                actor_account_id=actor_id,
                action=action,
                from_state=from_state,
                to_state=to_state,
                data=data,
                created_at=self._clock(),
            )
        )

    def _audit(
        self,
        actor: AuthenticatedAccount,
        action: str,
        target_type: str,
        target_id: str,
        data: dict[str, object],
    ) -> None:
        self._session.add(
            AuditEvent(
                actor_account_id=actor.account.id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                data=data,
                created_at=self._clock(),
            )
        )

    @staticmethod
    def _require_admin(actor: AuthenticatedAccount) -> None:
        if actor.account.role != "administrator":
            raise _problem(
                403,
                "authentication_required",
                "Administrator authorization is required.",
                "Authorization",
            )

    def _book_response(self, book: PriceBook) -> PriceBookResponse:
        return PriceBookResponse(
            id=book.id,
            version=book.version,
            label=book.label,
            state=book.state,
            currency="CAD",
            configuration=PriceBookConfiguration.model_validate(book.configuration),
            effective_at=_aware(book.effective_at) if book.effective_at else None,
            created_at=_aware(book.created_at),
            published_at=_aware(book.published_at) if book.published_at else None,
        )

    def _new_id(self) -> str:
        for _ in range(8):
            value = self._id_generator()
            if len(value) == 22:
                return value
        raise _problem(
            503, "internal_error", "Unable to create a commerce resource.", "service"
        )
