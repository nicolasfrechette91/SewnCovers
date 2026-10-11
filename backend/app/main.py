"""The SewnCovers API application: settings, middleware and the routers."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.accounts.routes import router as accounts_router
from app.assurance.routes import register_assurance_routes
from app.body_limits import BodyLimit, BodySizeLimitMiddleware
from app.client_ip import ClientAddressMiddleware
from app.commerce.routes import register_commerce_routes
from app.designs.routes import router as designs_router
from app.errors import UnhandledErrorMiddleware, register_error_handlers
from app.observability import (
    RequestContextMiddleware,
    configure_application_logging,
)
from app.patterns.routes import router as patterns_router
from app.persistence.database import dispose_application_database
from app.projects.routes import router as projects_router
from app.rate_limits import RateLimitPolicy
from app.service_routes import router as service_router
from app.settings import Settings, get_settings
from app.uploads.processing import MAX_ENCODED_BYTES
from app.uploads.routes import router as uploads_router

HSTS_HEADER = "max-age=63072000; includeSubDomains"
WEBHOOK_BODY_LIMIT = 64_000
BODY_LIMITS = (
    BodyLimit("PUT", "/uploads/direct/", MAX_ENCODED_BYTES),
    BodyLimit("POST", "/commerce/webhooks/", WEBHOOK_BODY_LIMIT),
)

OPENAPI_TAGS = [
    {
        "name": "Service",
        "description": "Service verification and on-request health reporting.",
    },
    {
        "name": "Patterns",
        "description": "Read the active public pattern catalogue.",
    },
    {
        "name": "Designs",
        "description": "Create and retrieve immutable designs by opaque public ID.",
    },
    {
        "name": "Accounts",
        "description": "Register and manage expiring bearer sessions and account data.",
    },
    {
        "name": "Projects",
        "description": "Manage private owned projects and immutable version history.",
    },
    {
        "name": "Project shares",
        "description": (
            "Create, revoke, and anonymously restore read-only bearer shares."
        ),
    },
    {
        "name": "Custom uploads",
        "description": "Upload, process, moderate, and access private pattern assets.",
    },
    {
        "name": "Commerce",
        "description": (
            "Server-priced CAD demonstration quotes, cart, checkout, and "
            "customer orders."
        ),
    },
    {
        "name": "Payment webhooks",
        "description": "Raw-body verified, idempotent payment-provider events.",
    },
    {
        "name": "Sandbox checkout",
        "description": "Unmistakably fictional local hosted-checkout simulation.",
    },
    {
        "name": "Administration",
        "description": (
            "Role-protected pricing, manufacturing, fulfilment, refunds, and "
            "audit controls."
        ),
    },
    {
        "name": "Legal",
        "description": (
            "Versioned review-required information and account acknowledgements."
        ),
    },
    {
        "name": "Production operations",
        "description": (
            "Paid-order-derived work, checklist, issues, quality control, and packets."
        ),
    },
    {
        "name": "Trust",
        "description": (
            "Evidence-bounded public metadata and read-only readiness checks."
        ),
    },
]


@asynccontextmanager
async def application_lifespan(application: FastAPI) -> AsyncIterator[None]:
    """Configure logging, then dispose the lazy engine if it was initialized."""
    configure_application_logging(application.state.settings)
    yield
    dispose_application_database()


def create_application(
    settings: Settings | None = None,
    *,
    rate_limits: RateLimitPolicy | None = None,
) -> FastAPI:
    """Build an application with its own CORS policy and rate-limit state."""
    settings = settings or get_settings()
    cors = settings.cors
    production = settings.environment == "production"
    application = FastAPI(
        title="SewnCovers API",
        summary="Public and account-backed API for the SewnCovers configurator.",
        description=(
            "Browse active patterns, keep legacy anonymous immutable designs, and "
            "manage private account-owned project versions. Authentication uses "
            "expiring opaque bearer tokens. API failures "
            "use the documented field-aware `APIErrorResponse` contract; `/health` "
            "uses its dedicated health-state response."
        ),
        version="0.4.0",
        docs_url="/docs",
        openapi_url="/openapi.json",
        redoc_url="/redoc",
        openapi_tags=OPENAPI_TAGS,
        lifespan=application_lifespan,
    )
    application.state.settings = settings
    application.state.rate_limits = rate_limits or RateLimitPolicy()
    register_error_handlers(application)
    # Each add_middleware call wraps the previous ones, so this reads from the
    # innermost layer out. Outermost: the client address is resolved first,
    # then the request id is assigned, so every later layer and log line sees
    # both; errors and size limits sit inside CORS so browsers can read them.
    application.add_middleware(UnhandledErrorMiddleware)
    application.add_middleware(BodySizeLimitMiddleware, limits=BODY_LIMITS)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=cors.allowed_origins,
        allow_credentials=cors.allow_credentials,
        allow_methods=cors.allowed_methods,
        allow_headers=cors.allowed_headers,
        expose_headers=cors.exposed_headers,
        max_age=cors.preflight_max_age_seconds,
    )

    @application.middleware("http")
    async def security_response_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        )
        response.headers["X-Frame-Options"] = "DENY"
        if production:
            # Render terminates TLS; browsers only honour this over HTTPS.
            response.headers["Strict-Transport-Security"] = HSTS_HEADER
        if request.url.path not in {"/docs", "/redoc", "/openapi.json"}:
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; frame-ancestors 'none'"
            )
        if (
            request.headers.get("authorization")
            or request.url.path.startswith(
                ("/account", "/admin", "/assets", "/production-assets")
            )
            or request.url.path in {"/health", "/readiness"}
        ):
            response.headers["Cache-Control"] = "private, no-store, max-age=0"
            response.headers["Pragma"] = "no-cache"
        return response

    application.add_middleware(RequestContextMiddleware)
    application.add_middleware(
        ClientAddressMiddleware,
        header=settings.resolved_client_ip_header,
        index=settings.resolved_client_ip_index,
    )

    # The order is the order the routes were declared in, which is the order the
    # router tries them in; commerce and assurance still register their own tables.
    for router in (
        service_router,
        patterns_router,
        designs_router,
        accounts_router,
        projects_router,
        uploads_router,
    ):
        application.include_router(router)
    register_commerce_routes(application)
    register_assurance_routes(application)
    return application


app = create_application()
