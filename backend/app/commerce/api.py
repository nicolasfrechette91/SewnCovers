"""FastAPI dependencies and routes for commerce and administration."""

from typing import Annotated

from fastapi import Depends, Header, Path, Request, Response

from app.accounts.api import AuthenticatedDependency
from app.commerce.providers import get_payment_provider
from app.commerce.schema import (
    AddCartLineRequest,
    AuditResponse,
    CartResponse,
    ChangeCartLineRequest,
    CheckoutRequest,
    CheckoutResponse,
    CompleteSandboxCheckoutRequest,
    OrderResponse,
    PriceBookRequest,
    PriceBookResponse,
    PricingResponse,
    ProductionAssetAccessResponse,
    PublishPriceBookRequest,
    QuoteResponse,
    RefundRequest,
    RepriceQuoteRequest,
    SandboxCheckoutResponse,
    ShipmentRequest,
    TransitionOrderRequest,
    VersionQuantityRequest,
    WebhookResponse,
)
from app.commerce.service import CommerceService
from app.errors import APIProblem
from app.persistence.database import DatabaseSession
from app.settings import get_settings
from app.uploads.storage import get_object_storage

ResourcePath = Annotated[
    str, Path(min_length=22, max_length=22, pattern=r"^[A-Za-z0-9_-]{22}$")
]
SessionPath = Annotated[
    str, Path(min_length=20, max_length=140, pattern=r"^[A-Za-z0-9_-]+$")
]


def get_commerce_service(session: DatabaseSession) -> CommerceService:
    settings = get_settings()
    if not settings.commerce_enabled:
        raise APIProblem(
            503,
            "storage_unavailable",
            "Demonstration commerce is not enabled in this environment.",
            ("service", "commerce"),
        )
    return CommerceService(
        session, settings, get_payment_provider(settings), get_object_storage()
    )


CommerceDependency = Annotated[CommerceService, Depends(get_commerce_service)]


def pricing_preview(
    request: VersionQuantityRequest,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> PricingResponse:
    return service.preview(authenticated, request)


def create_quote(
    request: VersionQuantityRequest,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> QuoteResponse:
    return service.create_quote(authenticated, request)


def list_quotes(
    authenticated: AuthenticatedDependency, service: CommerceDependency
) -> list[QuoteResponse]:
    return service.list_quotes(authenticated)


def get_quote(
    quote_id: ResourcePath,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> QuoteResponse:
    return service.get_quote(authenticated, quote_id)


def reprice_quote(
    quote_id: ResourcePath,
    request: RepriceQuoteRequest,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> QuoteResponse:
    return service.reprice_quote(authenticated, quote_id, request)


def get_cart(
    authenticated: AuthenticatedDependency, service: CommerceDependency
) -> CartResponse:
    return service.get_cart(authenticated)


def add_cart_line(
    request: AddCartLineRequest,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> CartResponse:
    return service.add_to_cart(authenticated, request.quote_id)


def change_cart_line(
    line_id: ResourcePath,
    request: ChangeCartLineRequest,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> CartResponse:
    return service.change_cart_line(authenticated, line_id, request.quantity)


def remove_cart_line(
    line_id: ResourcePath,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> CartResponse:
    return service.remove_cart_line(authenticated, line_id)


def empty_cart(
    authenticated: AuthenticatedDependency, service: CommerceDependency
) -> CartResponse:
    return service.empty_cart(authenticated)


def create_checkout(
    request: CheckoutRequest,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> CheckoutResponse:
    return service.create_checkout(authenticated, request.idempotency_key)


async def payment_webhook(
    provider_name: Annotated[str, Path(pattern=r"^(sandbox|stripe)$")],
    request: Request,
    service: CommerceDependency,
    stripe_signature: Annotated[str | None, Header(alias="Stripe-Signature")] = None,
    sandbox_signature: Annotated[
        str | None, Header(alias="SewnCovers-Signature")
    ] = None,
) -> WebhookResponse:
    expected = "sandbox" if get_settings().commerce_mode == "sandbox" else "stripe"
    if provider_name != expected:
        raise APIProblem(
            404,
            "resource_not_found",
            "Payment provider endpoint not found.",
            ("path", "provider_name"),
        )
    raw_body = await request.body()
    return service.process_webhook(raw_body, stripe_signature or sandbox_signature)


def read_sandbox_checkout(
    session_id: SessionPath, service: CommerceDependency
) -> SandboxCheckoutResponse:
    return service.sandbox_checkout(session_id)


def complete_sandbox_checkout(
    session_id: SessionPath,
    request: CompleteSandboxCheckoutRequest,
    service: CommerceDependency,
) -> WebhookResponse:
    return service.complete_sandbox_checkout(session_id, request)


def list_orders(
    authenticated: AuthenticatedDependency, service: CommerceDependency
) -> list[OrderResponse]:
    return service.list_orders(authenticated)


def get_order(
    order_id: ResourcePath,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> OrderResponse:
    return service.get_order(authenticated, order_id)


def admin_list_price_books(
    authenticated: AuthenticatedDependency, service: CommerceDependency
) -> list[PriceBookResponse]:
    return service.list_price_books(authenticated)


def admin_create_price_book(
    request: PriceBookRequest,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> PriceBookResponse:
    return service.create_price_book(authenticated, request)


def admin_update_price_book(
    book_id: ResourcePath,
    request: PriceBookRequest,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> PriceBookResponse:
    return service.update_price_book(authenticated, book_id, request)


def admin_publish_price_book(
    book_id: ResourcePath,
    request: PublishPriceBookRequest,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> PriceBookResponse:
    return service.publish_price_book(authenticated, book_id, request.effective_at)


def admin_list_orders(
    authenticated: AuthenticatedDependency, service: CommerceDependency
) -> list[OrderResponse]:
    return service.list_admin_orders(authenticated)


def admin_get_order(
    order_id: ResourcePath,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> OrderResponse:
    return service.get_admin_order(authenticated, order_id)


def admin_transition_order(
    order_id: ResourcePath,
    request: TransitionOrderRequest,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> OrderResponse:
    return service.transition_order(authenticated, order_id, request)


def admin_update_shipment(
    order_id: ResourcePath,
    request: ShipmentRequest,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> OrderResponse:
    return service.update_shipment(authenticated, order_id, request)


def admin_refund(
    order_id: ResourcePath,
    _request: RefundRequest,
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> OrderResponse:
    return service.refund(authenticated, order_id)


def admin_audit(
    authenticated: AuthenticatedDependency, service: CommerceDependency
) -> list[AuditResponse]:
    return service.audit_history(authenticated)


def admin_asset_access(
    order_id: ResourcePath,
    line_index: Annotated[int, Path(ge=0, le=99)],
    authenticated: AuthenticatedDependency,
    service: CommerceDependency,
) -> ProductionAssetAccessResponse:
    return service.production_asset_access(authenticated, order_id, line_index)


def read_production_asset(
    token: Annotated[
        str, Path(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]{43}$")
    ],
    service: CommerceDependency,
) -> Response:
    return Response(
        service.read_production_asset(token),
        media_type="image/png",
        headers={
            "Cache-Control": "private, no-store, max-age=0",
            "Content-Disposition": 'inline; filename="production-pattern.png"',
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "X-Content-Type-Options": "nosniff",
        },
    )
