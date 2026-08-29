"""Add demonstration commerce, operations, and administration records.

Revision ID: 20260828_01
Revises: 20260818_02
Create Date: 2026-08-28 00:00:01

Money is stored as integer CAD minor units. Configuration, quote, and order
snapshots are JSON documents owned and validated by the application.
"""

import json
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision: str = "20260828_01"
down_revision: str | None = "20260818_02"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEMONSTRATION_PRICE_CONFIGURATION = {
    "model": "demonstration-price-v1",
    "rounding": "ROUND_HALF_UP",
    "quantityMinimum": 1,
    "quantityMaximum": 20,
    "shapeBaseMinor": {
        "square": 6000,
        "rectangle": 6500,
        "box": 8000,
        "round": 7000,
        "tapered": 8500,
    },
    "areaRateMinorPerSquareCm": "0.18",
    "dimensionRateMinorPerCm": "2.50",
    "materialAdjustmentMinor": {
        "cotton-canvas": 0,
        "linen-blend": 1200,
        "polyester-weave": 800,
    },
    "fitAdjustmentMinor": {"close": 600, "relaxed": 300, "standard": 0},
    "closureAdjustmentMinor": {"envelope": 0, "slip-on": -200, "zipper": 800},
    "edgeAdjustmentMinor": {"piped": 900, "plain": 0},
    "patternAdjustmentMinor": {"built-in": 0, "custom": 1500},
}


def upgrade() -> None:
    with op.batch_alter_table("customer_accounts") as batch:
        batch.add_column(
            sa.Column(
                "role",
                sa.String(length=20),
                nullable=False,
                server_default=sa.text("'customer'"),
            )
        )
        batch.create_check_constraint(
            "ck_customer_accounts_role_supported",
            "role IN ('customer', 'administrator')",
        )

    op.create_table(
        "price_books",
        sa.Column("id", sa.String(22), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("configuration", sa.JSON(), nullable=False),
        sa.Column("effective_at", sa.DateTime(timezone=True)),
        sa.Column("created_by", sa.String(22)),
        sa.Column("published_by", sa.String(22)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("length(id) = 22", name="ck_price_books_id_length"),
        sa.CheckConstraint(
            "state IN ('draft', 'published')", name="ck_price_books_state_supported"
        ),
        sa.CheckConstraint("currency = 'CAD'", name="ck_price_books_currency_cad"),
        sa.CheckConstraint("version >= 1", name="ck_price_books_version_positive"),
        sa.ForeignKeyConstraint(
            ["created_by"], ["customer_accounts.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["published_by"], ["customer_accounts.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_price_books"),
        sa.UniqueConstraint("version", name="uq_price_books_version"),
    )
    op.create_index(
        "ix_price_books_state_effective", "price_books", ["state", "effective_at"]
    )
    price_books = sa.table(
        "price_books",
        sa.column("id", sa.String),
        sa.column("version", sa.Integer),
        sa.column("label", sa.String),
        sa.column("state", sa.String),
        sa.column("currency", sa.String),
        sa.column("configuration", sa.JSON),
        sa.column("effective_at", sa.DateTime(timezone=True)),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("published_at", sa.DateTime(timezone=True)),
    )
    configuration_json = json.dumps(
        DEMONSTRATION_PRICE_CONFIGURATION, sort_keys=True, separators=(",", ":")
    )
    configuration_value: object = DEMONSTRATION_PRICE_CONFIGURATION
    if op.get_bind().dialect.name == "postgresql":
        configuration_value = sa.cast(sa.literal(configuration_json), sa.JSON())
    op.execute(
        price_books.insert().values(
            {
                "id": "DEMOPriceBook000000001",
                "version": 1,
                "label": "Demonstration CAD price model v1",
                "state": "published",
                "currency": "CAD",
                "configuration": configuration_value,
                "effective_at": datetime(2026, 8, 28, tzinfo=UTC),
                "created_at": datetime(2026, 8, 28, tzinfo=UTC),
                "published_at": datetime(2026, 8, 28, tzinfo=UTC),
            }
        )
    )

    op.create_table(
        "commerce_quotes",
        sa.Column("id", sa.String(22), nullable=False),
        sa.Column("account_id", sa.String(22), nullable=False),
        sa.Column("project_version_id", sa.String(22)),
        sa.Column("price_book_id", sa.String(22), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_amount", sa.Integer(), nullable=False),
        sa.Column("subtotal_amount", sa.Integer(), nullable=False),
        sa.Column("configuration_snapshot", sa.JSON(), nullable=False),
        sa.Column("pricing_snapshot", sa.JSON(), nullable=False),
        sa.Column("asset_snapshot", sa.JSON()),
        sa.Column("tax_treatment", sa.String(80), nullable=False),
        sa.Column("shipping_treatment", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(id) = 22", name="ck_commerce_quotes_id_length"),
        sa.CheckConstraint(
            "status IN ('active', 'expired', 'checked_out', 'cancelled')",
            name="ck_commerce_quotes_status_supported",
        ),
        sa.CheckConstraint("currency = 'CAD'", name="ck_commerce_quotes_currency_cad"),
        sa.CheckConstraint(
            "quantity BETWEEN 1 AND 20", name="ck_commerce_quotes_quantity_range"
        ),
        sa.CheckConstraint(
            "unit_amount >= 0 AND subtotal_amount >= 0",
            name="ck_commerce_quotes_amounts_nonnegative",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["customer_accounts.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["project_version_id"], ["project_versions.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["price_book_id"], ["price_books.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_commerce_quotes"),
    )
    op.create_index(
        "ix_commerce_quotes_account_created",
        "commerce_quotes",
        ["account_id", "created_at"],
    )
    op.create_index("ix_commerce_quotes_expires_at", "commerce_quotes", ["expires_at"])

    op.create_table(
        "shopping_carts",
        sa.Column("id", sa.String(22), nullable=False),
        sa.Column("account_id", sa.String(22), nullable=False),
        sa.Column("state", sa.String(24), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "state IN ('active', 'checkout_pending', 'closed')",
            name="ck_shopping_carts_state_supported",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["customer_accounts.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_shopping_carts"),
        sa.UniqueConstraint("account_id", name="uq_shopping_carts_account_id"),
    )
    op.create_table(
        "cart_lines",
        sa.Column("id", sa.String(22), nullable=False),
        sa.Column("cart_id", sa.String(22), nullable=False),
        sa.Column("quote_id", sa.String(22), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "quantity BETWEEN 1 AND 20", name="ck_cart_lines_quantity_range"
        ),
        sa.ForeignKeyConstraint(["cart_id"], ["shopping_carts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["quote_id"], ["commerce_quotes.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_cart_lines"),
        sa.UniqueConstraint("cart_id", "quote_id", name="uq_cart_lines_cart_quote"),
    )
    op.create_index("ix_cart_lines_cart_id", "cart_lines", ["cart_id"])

    op.create_table(
        "customer_orders",
        sa.Column("id", sa.String(22), nullable=False),
        sa.Column("reference", sa.String(24), nullable=False),
        sa.Column("account_id", sa.String(22)),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("payment_status", sa.String(24), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("subtotal_amount", sa.Integer(), nullable=False),
        sa.Column("tax_amount", sa.Integer(), nullable=False),
        sa.Column("shipping_amount", sa.Integer(), nullable=False),
        sa.Column("total_amount", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("shipping_ciphertext", sa.LargeBinary()),
        sa.Column("shipping_nonce", sa.LargeBinary()),
        sa.Column("shipping_key_id", sa.String(32)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "state IN ('payment_pending', 'paid', 'production_review', "
            "'approved_for_production', 'in_production', 'quality_check', "
            "'ready_to_ship', 'shipped', 'delivered', 'cancelled', "
            "'refund_pending', 'refunded', 'manual_review_required')",
            name="ck_customer_orders_state_supported",
        ),
        sa.CheckConstraint(
            "payment_status IN ('pending', 'paid', 'failed', 'cancelled', "
            "'refund_pending', 'refunded', 'manual_review')",
            name="ck_customer_orders_payment_supported",
        ),
        sa.CheckConstraint("currency = 'CAD'", name="ck_customer_orders_currency_cad"),
        sa.CheckConstraint(
            "subtotal_amount >= 0 AND tax_amount >= 0 AND "
            "shipping_amount >= 0 AND total_amount >= 0",
            name="ck_customer_orders_amounts_nonnegative",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["customer_accounts.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_customer_orders"),
        sa.UniqueConstraint("reference", name="uq_customer_orders_reference"),
    )
    op.create_index(
        "ix_customer_orders_account_created",
        "customer_orders",
        ["account_id", "created_at"],
    )
    op.create_index("ix_customer_orders_state", "customer_orders", ["state"])

    op.create_table(
        "payment_attempts",
        sa.Column("id", sa.String(22), nullable=False),
        sa.Column("order_id", sa.String(22), nullable=False),
        sa.Column("cart_id", sa.String(22), nullable=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("provider_session_id", sa.String(120)),
        sa.Column("provider_payment_id", sa.String(120)),
        sa.Column("idempotency_key", sa.String(64), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("expected_amount", sa.Integer(), nullable=False),
        sa.Column("expected_currency", sa.String(3), nullable=False),
        sa.Column("checkout_url", sa.String(800)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'paid', 'failed', 'cancelled', "
            "'refund_pending', 'refunded', 'manual_review')",
            name="ck_payment_attempts_status_supported",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["customer_orders.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["cart_id"], ["shopping_carts.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_payment_attempts"),
        sa.UniqueConstraint(
            "idempotency_key", name="uq_payment_attempts_idempotency_key"
        ),
        sa.UniqueConstraint(
            "provider_session_id", name="uq_payment_attempts_provider_session"
        ),
    )
    op.create_index("ix_payment_attempts_order_id", "payment_attempts", ["order_id"])
    op.create_table(
        "payment_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("attempt_id", sa.String(22)),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("provider_event_id", sa.String(120), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("payload_digest", sa.String(64), nullable=False),
        sa.Column("outcome", sa.String(40), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["attempt_id"], ["payment_attempts.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_payment_events"),
        sa.UniqueConstraint(
            "provider", "provider_event_id", name="uq_payment_events_provider_event"
        ),
    )
    op.create_index("ix_payment_events_attempt_id", "payment_events", ["attempt_id"])

    op.create_table(
        "production_asset_reservations",
        sa.Column("id", sa.String(22), nullable=False),
        sa.Column("attempt_id", sa.String(22), nullable=False),
        sa.Column("line_index", sa.Integer(), nullable=False),
        sa.Column("derivative_id", sa.String(22), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("processing_version", sa.String(32), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('reserved', 'promoted', 'released')",
            name="ck_asset_reservations_status_supported",
        ),
        sa.ForeignKeyConstraint(
            ["attempt_id"], ["payment_attempts.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["derivative_id"], ["custom_derivatives.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_production_asset_reservations"),
    )
    op.create_index(
        "ix_asset_reservations_derivative",
        "production_asset_reservations",
        ["derivative_id", "status"],
    )
    op.create_table(
        "order_production_assets",
        sa.Column("id", sa.String(22), nullable=False),
        sa.Column("order_id", sa.String(22), nullable=False),
        sa.Column("line_index", sa.Integer(), nullable=False),
        sa.Column("object_key", sa.String(180), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("processing_version", sa.String(32), nullable=False),
        sa.Column("access_token_hash", sa.String(64)),
        sa.Column("access_expires_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["order_id"], ["customer_orders.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_order_production_assets"),
        sa.UniqueConstraint(
            "order_id", "line_index", name="uq_order_production_assets_order_line"
        ),
        sa.UniqueConstraint("object_key", name="uq_order_production_assets_object_key"),
    )
    op.create_table(
        "shipments",
        sa.Column("order_id", sa.String(22), nullable=False),
        sa.Column("carrier", sa.String(24), nullable=False),
        sa.Column("tracking_reference", sa.String(40), nullable=False),
        sa.Column("shipped_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "carrier IN ('canada-post', 'ups', 'fedex', 'purolator')",
            name="ck_shipments_carrier_supported",
        ),
        sa.ForeignKeyConstraint(
            ["order_id"], ["customer_orders.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("order_id", name="pk_shipments"),
    )
    op.create_table(
        "order_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_id", sa.String(22), nullable=False),
        sa.Column("actor_account_id", sa.String(22)),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("from_state", sa.String(32)),
        sa.Column("to_state", sa.String(32)),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["order_id"], ["customer_orders.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["actor_account_id"], ["customer_accounts.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_order_history"),
    )
    op.create_index(
        "ix_order_history_order_created", "order_history", ["order_id", "created_at"]
    )
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("actor_account_id", sa.String(22)),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(40), nullable=False),
        sa.Column("target_id", sa.String(40), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_account_id"], ["customer_accounts.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_audit_events"),
    )
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_created_at", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_order_history_order_created", table_name="order_history")
    op.drop_table("order_history")
    op.drop_table("shipments")
    op.drop_table("order_production_assets")
    op.drop_index(
        "ix_asset_reservations_derivative", table_name="production_asset_reservations"
    )
    op.drop_table("production_asset_reservations")
    op.drop_index("ix_payment_events_attempt_id", table_name="payment_events")
    op.drop_table("payment_events")
    op.drop_index("ix_payment_attempts_order_id", table_name="payment_attempts")
    op.drop_table("payment_attempts")
    op.drop_index("ix_customer_orders_state", table_name="customer_orders")
    op.drop_index("ix_customer_orders_account_created", table_name="customer_orders")
    op.drop_table("customer_orders")
    op.drop_index("ix_cart_lines_cart_id", table_name="cart_lines")
    op.drop_table("cart_lines")
    op.drop_table("shopping_carts")
    op.drop_index("ix_commerce_quotes_expires_at", table_name="commerce_quotes")
    op.drop_index("ix_commerce_quotes_account_created", table_name="commerce_quotes")
    op.drop_table("commerce_quotes")
    op.drop_index("ix_price_books_state_effective", table_name="price_books")
    op.drop_table("price_books")
    with op.batch_alter_table("customer_accounts") as batch:
        batch.drop_constraint("ck_customer_accounts_role_supported", type_="check")
        batch.drop_column("role")
