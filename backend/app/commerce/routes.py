"""Commerce route registration kept separate from application assembly."""

from fastapi import FastAPI, Response

from app.commerce.api import (
    add_cart_line,
    admin_asset_access,
    admin_audit,
    admin_create_price_book,
    admin_get_order,
    admin_list_orders,
    admin_list_price_books,
    admin_publish_price_book,
    admin_refund,
    admin_transition_order,
    admin_update_price_book,
    admin_update_shipment,
    change_cart_line,
    complete_sandbox_checkout,
    create_checkout,
    create_quote,
    empty_cart,
    get_cart,
    get_order,
    get_quote,
    list_orders,
    list_quotes,
    payment_webhook,
    pricing_preview,
    read_production_asset,
    read_sandbox_checkout,
    remove_cart_line,
    reprice_quote,
)
from app.commerce.schema import (
    AuditResponse,
    CartResponse,
    CheckoutResponse,
    OrderResponse,
    PriceBookResponse,
    PricingResponse,
    ProductionAssetAccessResponse,
    QuoteResponse,
    SandboxCheckoutResponse,
    WebhookResponse,
)
from app.errors import APIErrorResponse


def register_commerce_routes(application: FastAPI) -> None:
    private = {
        401: {"description": "Authentication is required", "model": APIErrorResponse},
        404: {"description": "Resource absent or not owned", "model": APIErrorResponse},
        409: {"description": "Lifecycle conflict", "model": APIErrorResponse},
        422: {"description": "Invalid bounded input", "model": APIErrorResponse},
        503: {
            "description": "Commerce or storage unavailable",
            "model": APIErrorResponse,
        },
    }
    admin = {
        **private,
        403: {"description": "Administrator role required", "model": APIErrorResponse},
    }
    routes = [
        (
            "/commerce/pricing/preview",
            pricing_preview,
            ["POST"],
            PricingResponse,
            200,
            "Preview server-calculated demonstration pricing",
            "Prices one owned immutable version. The request contains no amount "
            "or currency.",
        ),
        (
            "/commerce/quotes",
            create_quote,
            ["POST"],
            QuoteResponse,
            201,
            "Create an immutable quote",
            "Snapshots the complete owned configuration, approved custom asset "
            "identity, published price book, and estimated subtotal.",
        ),
        (
            "/commerce/quotes",
            list_quotes,
            ["GET"],
            list[QuoteResponse],
            200,
            "List owned quote history",
            "Includes readable expired immutable quotes.",
        ),
        (
            "/commerce/quotes/{quote_id}",
            get_quote,
            ["GET"],
            QuoteResponse,
            200,
            "Read one owned quote",
            "Never exposes another account's quote.",
        ),
        (
            "/commerce/quotes/{quote_id}/reprice",
            reprice_quote,
            ["POST"],
            QuoteResponse,
            201,
            "Reprice into a new quote",
            "Leaves the source quote unchanged.",
        ),
        (
            "/commerce/cart",
            get_cart,
            ["GET"],
            CartResponse,
            200,
            "Read the active cart",
            "Removes expired or invalid lines and reports why.",
        ),
        (
            "/commerce/cart/lines",
            add_cart_line,
            ["POST"],
            CartResponse,
            200,
            "Add an owned active quote",
            "Amounts, descriptions, and currency come only from the quote snapshot.",
        ),
        (
            "/commerce/cart/lines/{line_id}",
            change_cart_line,
            ["PATCH"],
            CartResponse,
            200,
            "Change quantity with a replacement quote",
            "Creates a new immutable quote at the server-selected published "
            "price book.",
        ),
        (
            "/commerce/cart/lines/{line_id}",
            remove_cart_line,
            ["DELETE"],
            CartResponse,
            200,
            "Remove one cart line",
            "Owner scoped.",
        ),
        (
            "/commerce/cart/lines",
            empty_cart,
            ["DELETE"],
            CartResponse,
            200,
            "Empty the active cart",
            "Rejected while checkout creation is pending.",
        ),
        (
            "/commerce/checkout",
            create_checkout,
            ["POST"],
            CheckoutResponse,
            201,
            "Create one idempotent hosted checkout",
            "Transactionally freezes an order and returns only the provider-hosted "
            "checkout URL. Redirects never mark payment successful.",
        ),
        (
            "/commerce/orders",
            list_orders,
            ["GET"],
            list[OrderResponse],
            200,
            "List owned orders",
            "List responses omit decrypted shipping details.",
        ),
        (
            "/commerce/orders/{order_id}",
            get_order,
            ["GET"],
            OrderResponse,
            200,
            "Read an owned order",
            "Returns the immutable financial/configuration snapshot and "
            "authoritative timeline.",
        ),
    ]
    for path, endpoint, methods, model, status, summary, description in routes:
        application.add_api_route(
            path,
            endpoint,
            methods=methods,
            response_model=model,
            status_code=status,
            tags=["Commerce"],
            summary=summary,
            description=description,
            responses=private,
        )

    application.add_api_route(
        "/commerce/webhooks/{provider_name}",
        payment_webhook,
        methods=["POST"],
        response_model=WebhookResponse,
        tags=["Payment webhooks"],
        summary="Verify and process a raw provider event",
        description=(
            "Verifies the raw-body signature, unique event identity, checkout/order "
            "mapping, amount, currency, and state before any payment transition."
        ),
        responses={
            400: {
                "description": "Signature or event invalid",
                "model": APIErrorResponse,
            },
            422: {
                "description": "Provider path invalid",
                "model": APIErrorResponse,
            },
        },
    )
    application.add_api_route(
        "/commerce/sandbox/checkouts/{session_id}",
        read_sandbox_checkout,
        methods=["GET"],
        response_model=SandboxCheckoutResponse,
        tags=["Sandbox checkout"],
        summary="Read fictional hosted checkout state",
        description=(
            "Demonstration provider only; contains no card or credential fields."
        ),
        responses=private,
    )
    application.add_api_route(
        "/commerce/sandbox/checkouts/{session_id}/complete",
        complete_sandbox_checkout,
        methods=["POST"],
        response_model=WebhookResponse,
        tags=["Sandbox checkout"],
        summary="Complete a fictional sandbox checkout",
        description=(
            "Creates an internally signed deterministic provider event; the "
            "redirect remains informational."
        ),
        responses=private,
    )

    admin_routes = [
        (
            "/admin/price-books",
            admin_list_price_books,
            ["GET"],
            list[PriceBookResponse],
            200,
            "List price-book versions",
        ),
        (
            "/admin/price-books",
            admin_create_price_book,
            ["POST"],
            PriceBookResponse,
            201,
            "Draft a new price book",
        ),
        (
            "/admin/price-books/{book_id}",
            admin_update_price_book,
            ["PATCH"],
            PriceBookResponse,
            200,
            "Edit a draft price book",
        ),
        (
            "/admin/price-books/{book_id}/publish",
            admin_publish_price_book,
            ["POST"],
            PriceBookResponse,
            200,
            "Publish an immutable price book",
        ),
        (
            "/admin/orders",
            admin_list_orders,
            ["GET"],
            list[OrderResponse],
            200,
            "List operational paid orders",
        ),
        (
            "/admin/orders/{order_id}",
            admin_get_order,
            ["GET"],
            OrderResponse,
            200,
            "Read production specification",
        ),
        (
            "/admin/orders/{order_id}/transition",
            admin_transition_order,
            ["POST"],
            OrderResponse,
            200,
            "Apply a valid manufacturing transition",
        ),
        (
            "/admin/orders/{order_id}/shipment",
            admin_update_shipment,
            ["PUT"],
            OrderResponse,
            200,
            "Record allowlisted fulfilment data",
        ),
        (
            "/admin/orders/{order_id}/refund",
            admin_refund,
            ["POST"],
            OrderResponse,
            200,
            "Initiate a confirmed full refund",
        ),
        (
            "/admin/audit",
            admin_audit,
            ["GET"],
            list[AuditResponse],
            200,
            "Read append-only sensitive-action audit history",
        ),
        (
            "/admin/orders/{order_id}/lines/{line_index}/asset-access",
            admin_asset_access,
            ["POST"],
            ProductionAssetAccessResponse,
            200,
            "Create short-lived production-asset access",
        ),
    ]
    for path, endpoint, methods, model, status, summary in admin_routes:
        application.add_api_route(
            path,
            endpoint,
            methods=methods,
            response_model=model,
            status_code=status,
            tags=["Administration"],
            summary=summary,
            description=(
                "Requires a server-assigned administrator role; no credential "
                "or secret fields are returned."
            ),
            responses=admin,
        )

    application.add_api_route(
        "/production-assets/{token}",
        read_production_asset,
        methods=["GET"],
        response_class=Response,
        tags=["Administration"],
        summary="Use one short-lived production-asset grant",
        include_in_schema=True,
        responses={
            404: {
                "description": "Unknown or expired grant",
                "model": APIErrorResponse,
            },
            422: {"description": "Malformed grant", "model": APIErrorResponse},
        },
    )
