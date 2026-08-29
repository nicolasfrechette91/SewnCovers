"""Public commerce and administrator API contracts."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.projects.schema import ProjectConfiguration

ResourceId = Annotated[
    str, StringConstraints(min_length=22, max_length=22, pattern=r"^[A-Za-z0-9_-]{22}$")
]
Currency = Literal["CAD"]
Quantity = Annotated[int, Field(ge=1, le=20, strict=True)]
QuoteStatus = Literal["active", "expired", "checked_out", "cancelled"]
OrderState = Literal[
    "payment_pending",
    "paid",
    "production_review",
    "approved_for_production",
    "in_production",
    "quality_check",
    "ready_to_ship",
    "shipped",
    "delivered",
    "cancelled",
    "refund_pending",
    "refunded",
    "manual_review_required",
]
PaymentStatus = Literal[
    "pending",
    "paid",
    "failed",
    "cancelled",
    "refund_pending",
    "refunded",
    "manual_review",
]


class CommerceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class VersionQuantityRequest(CommerceRequest):
    project_version_id: ResourceId = Field(alias="projectVersionId")
    quantity: Quantity


class MoneyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    currency: Currency
    amount_minor: int = Field(alias="amountMinor", ge=0)
    formatted: str


class PricingComponentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    code: str
    label: str
    amount_minor: int = Field(alias="amountMinor")
    basis: str


class PricingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    demonstration: Literal[True] = True
    model_label: str = Field(alias="modelLabel")
    price_book_version: int = Field(alias="priceBookVersion", ge=1)
    currency: Currency
    quantity: int
    unit_amount_minor: int = Field(alias="unitAmountMinor", ge=0)
    subtotal_amount_minor: int = Field(alias="subtotalAmountMinor", ge=0)
    subtotal_formatted: str = Field(alias="subtotalFormatted")
    breakdown: list[PricingComponentResponse]
    tax_treatment: str = Field(alias="taxTreatment")
    shipping_treatment: str = Field(alias="shippingTreatment")


class QuoteResponse(PricingResponse):
    id: str
    status: QuoteStatus
    project_version_id: str | None = Field(alias="projectVersionId")
    configuration: ProjectConfiguration
    created_at: datetime = Field(alias="createdAt")
    expires_at: datetime = Field(alias="expiresAt")
    can_checkout: bool = Field(alias="canCheckout")
    custom_asset: dict[str, object] | None = Field(alias="customAsset")


class RepriceQuoteRequest(CommerceRequest):
    quantity: Quantity | None = None


class AddCartLineRequest(CommerceRequest):
    quote_id: ResourceId = Field(alias="quoteId")


class ChangeCartLineRequest(CommerceRequest):
    quantity: Quantity


class CartLineResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str
    quote: QuoteResponse
    quantity: int
    extended_amount_minor: int = Field(alias="extendedAmountMinor", ge=0)


class CartResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str
    demonstration: Literal[True] = True
    state: Literal["active", "checkout_pending", "closed"]
    currency: Currency
    lines: list[CartLineResponse]
    subtotal_amount_minor: int = Field(alias="subtotalAmountMinor", ge=0)
    subtotal_formatted: str = Field(alias="subtotalFormatted")
    notices: list[str]


class CheckoutRequest(CommerceRequest):
    idempotency_key: str = Field(
        alias="idempotencyKey",
        min_length=16,
        max_length=64,
        pattern=r"^[A-Za-z0-9_-]+$",
    )


class CheckoutResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    demonstration: bool
    order_id: str = Field(alias="orderId")
    order_reference: str = Field(alias="orderReference")
    checkout_url: str = Field(alias="checkoutUrl")
    expires_at: datetime = Field(alias="expiresAt")


class TimelineEntryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    action: str
    from_state: str | None = Field(alias="fromState")
    to_state: str | None = Field(alias="toState")
    data: dict[str, object]
    created_at: datetime = Field(alias="createdAt")


class ShipmentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    carrier: Literal["canada-post", "ups", "fedex", "purolator"]
    tracking_reference: str = Field(alias="trackingReference")
    tracking_url: str | None = Field(alias="trackingUrl")
    shipped_at: datetime = Field(alias="shippedAt")
    delivered_at: datetime | None = Field(alias="deliveredAt")


class OrderResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str
    reference: str
    demonstration: bool
    created_at: datetime = Field(alias="createdAt")
    state: OrderState
    payment_status: PaymentStatus = Field(alias="paymentStatus")
    currency: Currency
    subtotal_amount_minor: int = Field(alias="subtotalAmountMinor")
    tax_amount_minor: int = Field(alias="taxAmountMinor")
    shipping_amount_minor: int = Field(alias="shippingAmountMinor")
    total_amount_minor: int = Field(alias="totalAmountMinor")
    total_formatted: str = Field(alias="totalFormatted")
    lines: list[dict[str, object]]
    shipment: ShipmentResponse | None
    shipping_address: dict[str, object] | None = Field(alias="shippingAddress")
    timeline: list[TimelineEntryResponse]


class ShippingAddressRequest(CommerceRequest):
    name: str = Field(min_length=1, max_length=120)
    line1: str = Field(min_length=1, max_length=160)
    line2: str | None = Field(default=None, max_length=160)
    city: str = Field(min_length=1, max_length=120)
    region: str = Field(min_length=1, max_length=80)
    postal_code: str = Field(
        alias="postalCode", min_length=3, max_length=12, pattern=r"^[A-Za-z0-9 -]+$"
    )
    country: Literal["CA"] = "CA"


class SandboxCheckoutResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    demonstration: Literal[True] = True
    session_id: str = Field(alias="sessionId")
    order_reference: str = Field(alias="orderReference")
    amount_minor: int = Field(alias="amountMinor")
    currency: Currency
    status: PaymentStatus
    expires_at: datetime = Field(alias="expiresAt")


class CompleteSandboxCheckoutRequest(CommerceRequest):
    shipping: ShippingAddressRequest
    outcome: Literal["success", "failure", "cancel"] = "success"


class WebhookResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    received: Literal[True] = True
    duplicate: bool
    outcome: str


class PriceBookConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    model: Literal["demonstration-price-v1"] = "demonstration-price-v1"
    rounding: Literal["ROUND_HALF_UP"] = "ROUND_HALF_UP"
    quantity_minimum: int = Field(alias="quantityMinimum", ge=1, le=20)
    quantity_maximum: int = Field(alias="quantityMaximum", ge=1, le=20)
    shape_base_minor: dict[str, int] = Field(alias="shapeBaseMinor")
    area_rate_minor_per_square_cm: Decimal = Field(
        alias="areaRateMinorPerSquareCm", ge=0, decimal_places=4
    )
    dimension_rate_minor_per_cm: Decimal = Field(
        alias="dimensionRateMinorPerCm", ge=0, decimal_places=4
    )
    material_adjustment_minor: dict[str, int] = Field(alias="materialAdjustmentMinor")
    fit_adjustment_minor: dict[str, int] = Field(alias="fitAdjustmentMinor")
    closure_adjustment_minor: dict[str, int] = Field(alias="closureAdjustmentMinor")
    edge_adjustment_minor: dict[str, int] = Field(alias="edgeAdjustmentMinor")
    pattern_adjustment_minor: dict[str, int] = Field(alias="patternAdjustmentMinor")

    @model_validator(mode="after")
    def validate_exact_keys(self) -> "PriceBookConfiguration":
        expected = {
            "shape_base_minor": {"box", "rectangle", "round", "square", "tapered"},
            "material_adjustment_minor": {
                "cotton-canvas",
                "linen-blend",
                "polyester-weave",
            },
            "fit_adjustment_minor": {"close", "relaxed", "standard"},
            "closure_adjustment_minor": {"envelope", "slip-on", "zipper"},
            "edge_adjustment_minor": {"piped", "plain"},
            "pattern_adjustment_minor": {"built-in", "custom"},
        }
        for field_name, keys in expected.items():
            values = getattr(self, field_name)
            if set(values) != keys or any(
                abs(value) > 10_000_000 for value in values.values()
            ):
                raise ValueError(
                    f"{field_name} must contain the exact supported keys and "
                    "bounded values"
                )
        if self.quantity_minimum > self.quantity_maximum:
            raise ValueError("quantityMinimum cannot exceed quantityMaximum")
        return self


class PriceBookRequest(CommerceRequest):
    label: str = Field(min_length=1, max_length=120)
    configuration: PriceBookConfiguration


class PriceBookResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: str
    version: int
    label: str
    state: Literal["draft", "published"]
    currency: Currency
    configuration: PriceBookConfiguration
    effective_at: datetime | None = Field(alias="effectiveAt")
    created_at: datetime = Field(alias="createdAt")
    published_at: datetime | None = Field(alias="publishedAt")


class PublishPriceBookRequest(CommerceRequest):
    confirm: Literal[True]
    effective_at: datetime | None = Field(default=None, alias="effectiveAt")


class IssueReason(CommerceRequest):
    code: Literal[
        "none", "asset", "measurement", "payment", "quality", "shipping", "other"
    ] = "none"
    message: str = Field(default="", max_length=240)


class TransitionOrderRequest(CommerceRequest):
    target_state: OrderState = Field(alias="targetState")
    reason: IssueReason = Field(default_factory=IssueReason)


class ShipmentRequest(CommerceRequest):
    carrier: Literal["canada-post", "ups", "fedex", "purolator"]
    tracking_reference: str = Field(
        alias="trackingReference",
        min_length=6,
        max_length=40,
        pattern=r"^[A-Za-z0-9 -]+$",
    )
    shipped_at: datetime = Field(alias="shippedAt")
    delivered_at: datetime | None = Field(default=None, alias="deliveredAt")


class RefundRequest(CommerceRequest):
    confirm: Literal[True]


class AuditResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    id: int
    actor_account_id: str | None = Field(alias="actorAccountId")
    action: str
    target_type: str = Field(alias="targetType")
    target_id: str = Field(alias="targetId")
    data: dict[str, object]
    created_at: datetime = Field(alias="createdAt")


class ProductionAssetAccessResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    url: str
    expires_at: datetime = Field(alias="expiresAt")
    checksum: str
    processing_version: str = Field(alias="processingVersion")
