"""Authoritative demonstration-commerce security and lifecycle coverage."""

import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from importlib import import_module
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import Session, sessionmaker

from app.commerce import cli as commerce_cli
from app.commerce.cli import promote_existing_account
from app.commerce.encryption import ShippingCipher, ShippingEncryptionError
from app.commerce.providers import sandbox_signature
from app.commerce.service import calculate_demonstration_pricing
from app.main import create_application
from app.persistence.database import Database, get_session
from app.persistence.models import (
    AuditEvent,
    CommerceQuote,
    CustomerAccount,
    CustomerOrder,
    PaymentAttempt,
    PaymentEvent,
    PriceBook,
)
from app.projects.schema import ProjectConfiguration
from app.settings import Settings, reset_settings_cache

CONFIGURATION = {
    "shape": "tapered",
    "width": 73.25,
    "height": 49.75,
    "backWidth": 61.5,
    "thickness": 13.5,
    "unit": "cm",
    "pattern": {"kind": "built-in", "patternId": "terrace-wave"},
    "patternScale": 1.6,
    "materialId": "linen-blend",
    "fitPreference": "relaxed",
    "closureType": "envelope",
    "seamStyle": "piped",
}
FICTIONAL_SHIPPING = {
    "name": "Avery Example",
    "line1": "100 Demonstration Way",
    "line2": "Studio 4",
    "city": "Ottawa",
    "region": "ON",
    "postalCode": "K1A 0B1",
    "country": "CA",
}


def test_public_pricing_examples_match_authoritative_price_book() -> None:
    examples_path = (
        Path(__file__).parents[2] / "frontend" / "data" / "public-pricing-examples.json"
    )
    public_data = json.loads(examples_path.read_text(encoding="utf-8"))
    migration_module = import_module(
        "migrations.versions.20260828_01_add_demonstration_commerce"
    )
    pattern_migration = import_module(
        "migrations.versions.20260729_01_seed_canonical_patterns"
    )
    active_pattern_ids = {
        item["id"] for item in pattern_migration.PATTERN_ROWS if item["is_active"]
    }
    book = PriceBook(
        id="DEMOPriceBook000000001",
        version=1,
        label="Demonstration CAD price model v1",
        state="published",
        currency="CAD",
        configuration=migration_module.DEMONSTRATION_PRICE_CONFIGURATION,
    )

    assert public_data["schemaVersion"] == 1
    assert public_data["priceBookVersion"] == book.version
    assert public_data["currency"] == book.currency == "CAD"
    assert public_data["quantity"] == 1
    assert len(public_data["examples"]) >= 3
    assert len({item["id"] for item in public_data["examples"]}) == len(
        public_data["examples"]
    )

    for example in public_data["examples"]:
        configuration = ProjectConfiguration.model_validate(example["configuration"])
        if configuration.pattern.kind == "built-in":
            assert configuration.pattern.pattern_id in active_pattern_ids
        calculated = calculate_demonstration_pricing(
            book, configuration, public_data["quantity"]
        )
        assert example["amountMinor"] == calculated["subtotal_amount"], example["id"]

    patterned = ProjectConfiguration.model_validate(CONFIGURATION)
    solid = ProjectConfiguration.model_validate(
        {**CONFIGURATION, "pattern": {"kind": "solid", "color": "#243447"}}
    )
    patterned_price = calculate_demonstration_pricing(book, patterned, 1)
    solid_price = calculate_demonstration_pricing(book, solid, 1)
    assert solid_price["subtotal_amount"] == patterned_price["subtotal_amount"]
    assert (
        next(
            item
            for item in solid_price["snapshot"]["breakdown"]
            if item["code"] == "pattern"
        )["amountMinor"]
        == 0
    )


@pytest.fixture
def commerce_client(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> Iterator[tuple[TestClient, sessionmaker[Session], str]]:
    database_url = f"sqlite:///{(tmp_path / 'commerce.sqlite3').as_posix()}"
    storage_root = str(tmp_path / "commerce-assets")
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("COMMERCE_ENABLED", "true")
    monkeypatch.setenv("COMMERCE_MODE", "sandbox")
    monkeypatch.setenv("OBJECT_STORAGE_ROOT", storage_root)
    reset_settings_cache()
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    application = create_application(
        Settings(
            _env_file=None,
            environment="test",
            database_url=database_url,
            commerce_enabled=True,
            commerce_mode="sandbox",
            object_storage_root=Path(storage_root),
        )
    )

    def provide_session() -> Iterator[Session]:
        session = factory()
        try:
            yield session
        finally:
            session.close()

    application.dependency_overrides[get_session] = provide_session
    with TestClient(application) as client:
        yield client, factory, database_url
    engine.dispose()
    reset_settings_cache()


def register(client: TestClient, email: str) -> str:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "correct horse battery staple"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["account"]["role"] == "customer"
    return str(response.json()["token"])


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def project_version(
    client: TestClient,
    token: str,
    configuration: dict[str, object] | None = None,
) -> str:
    response = client.post(
        "/projects",
        headers=auth(token),
        json={
            "name": "Fictional patio sample",
            "configuration": configuration or CONFIGURATION,
        },
    )
    assert response.status_code == 201, response.text
    return str(response.json()["currentVersion"]["id"])


def test_solid_fabric_persists_through_quote_and_cart_without_a_surcharge(
    commerce_client: tuple[TestClient, sessionmaker[Session], str],
) -> None:
    client, _factory, _database_url = commerce_client
    customer = register(client, "solid-cart@example.invalid")
    solid_configuration = {
        **CONFIGURATION,
        "pattern": {"kind": "solid", "color": "#F5F2EB"},
    }
    version_id = project_version(client, customer, solid_configuration)

    quote = client.post(
        "/commerce/quotes",
        headers=auth(customer),
        json={"projectVersionId": version_id, "quantity": 1},
    )

    assert quote.status_code == 201, quote.text
    assert quote.json()["configuration"] == solid_configuration
    pattern_charge = next(
        item for item in quote.json()["breakdown"] if item["code"] == "pattern"
    )
    assert pattern_charge == {
        "code": "pattern",
        "label": "Pattern adjustment",
        "amountMinor": 0,
        "basis": "solid",
    }
    cart = client.post(
        "/commerce/cart/lines",
        headers=auth(customer),
        json={"quoteId": quote.json()["id"]},
    )
    assert cart.status_code == 200, cart.text
    assert cart.json()["lines"][0]["quote"]["configuration"] == solid_configuration


def test_quote_cart_checkout_webhook_order_and_admin_workflow(
    commerce_client: tuple[TestClient, sessionmaker[Session], str],
) -> None:
    client, factory, _database_url = commerce_client
    customer = register(client, "customer-one@example.invalid")
    other = register(client, "customer-two@example.invalid")
    administrator = register(client, "operations@example.invalid")
    with factory() as session:
        account = session.scalar(
            select(CustomerAccount).where(
                CustomerAccount.email == "operations@example.invalid"
            )
        )
        assert account is not None
        account.role = "administrator"
        session.commit()

    version_id = project_version(client, customer)
    preview = client.post(
        "/commerce/pricing/preview",
        headers=auth(customer),
        json={"projectVersionId": version_id, "quantity": 2},
    )
    assert preview.status_code == 200, preview.text
    price = preview.json()
    assert price["demonstration"] is True
    assert price["currency"] == "CAD"
    assert price["priceBookVersion"] == 1
    assert price["subtotalAmountMinor"] == price["unitAmountMinor"] * 2
    assert {item["code"] for item in price["breakdown"]} >= {
        "shape-base",
        "area",
        "dimensions",
        "material",
    }

    manipulated = client.post(
        "/commerce/pricing/preview",
        headers=auth(customer),
        json={
            "projectVersionId": version_id,
            "quantity": 2,
            "amountMinor": 1,
            "currency": "USD",
        },
    )
    assert manipulated.status_code == 422
    assert {error["code"] for error in manipulated.json()["errors"]} == {
        "unknown_field"
    }

    quote_response = client.post(
        "/commerce/quotes",
        headers=auth(customer),
        json={"projectVersionId": version_id, "quantity": 2},
    )
    assert quote_response.status_code == 201, quote_response.text
    quote = quote_response.json()
    assert quote["subtotalAmountMinor"] == price["subtotalAmountMinor"]
    assert quote["canCheckout"] is True
    assert (
        client.get(f"/commerce/quotes/{quote['id']}", headers=auth(other)).status_code
        == 404
    )

    cart_response = client.post(
        "/commerce/cart/lines",
        headers=auth(customer),
        json={"quoteId": quote["id"]},
    )
    assert cart_response.status_code == 200, cart_response.text
    cart = cart_response.json()
    assert cart["subtotalAmountMinor"] == quote["subtotalAmountMinor"]
    assert (
        client.post(
            "/commerce/cart/lines",
            headers=auth(other),
            json={"quoteId": quote["id"]},
        ).status_code
        == 404
    )

    checkout_request = {"idempotencyKey": "checkout_demo_000000000001"}
    checkout_response = client.post(
        "/commerce/checkout", headers=auth(customer), json=checkout_request
    )
    assert checkout_response.status_code == 201, checkout_response.text
    checkout = checkout_response.json()
    duplicate_checkout = client.post(
        "/commerce/checkout", headers=auth(customer), json=checkout_request
    )
    assert duplicate_checkout.status_code == 201
    assert duplicate_checkout.json() == checkout
    order_id = checkout["orderId"]
    session_id = parse_qs(urlsplit(checkout["checkoutUrl"]).query)["session"][0]
    assert (
        client.get(f"/commerce/orders/{order_id}", headers=auth(customer)).json()[
            "paymentStatus"
        ]
        == "pending"
    )
    assert (
        client.get(f"/commerce/orders/{order_id}", headers=auth(other)).status_code
        == 404
    )

    forged = client.post(
        "/commerce/webhooks/sandbox",
        content=b'{"id":"evt_forged"}',
        headers={"SewnCovers-Signature": "t=1,v1=not-valid"},
    )
    assert forged.status_code == 400
    assert "not-valid" not in forged.text

    completed = client.post(
        f"/commerce/sandbox/checkouts/{session_id}/complete",
        json={"shipping": FICTIONAL_SHIPPING, "outcome": "success"},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json() == {
        "received": True,
        "duplicate": False,
        "outcome": "paid",
    }
    replay = client.post(
        f"/commerce/sandbox/checkouts/{session_id}/complete",
        json={"shipping": FICTIONAL_SHIPPING, "outcome": "success"},
    )
    assert replay.json()["duplicate"] is True

    order = client.get(f"/commerce/orders/{order_id}", headers=auth(customer)).json()
    assert order["state"] == "paid"
    assert order["shippingAddress"] == FICTIONAL_SHIPPING
    assert order["totalAmountMinor"] > order["subtotalAmountMinor"]
    list_body = client.get("/commerce/orders", headers=auth(customer)).text
    assert "100 Demonstration Way" not in list_body
    with factory() as session:
        stored = session.get(CustomerOrder, order_id)
        assert stored is not None and stored.shipping_ciphertext is not None
        assert b"Demonstration Way" not in stored.shipping_ciphertext

    assert client.get("/admin/orders", headers=auth(customer)).status_code == 403
    admin_order = client.get(f"/admin/orders/{order_id}", headers=auth(administrator))
    assert admin_order.status_code == 200
    assert "password" not in admin_order.text.casefold()

    for state in (
        "production_review",
        "approved_for_production",
        "in_production",
        "quality_check",
        "ready_to_ship",
    ):
        transition = client.post(
            f"/admin/orders/{order_id}/transition",
            headers=auth(administrator),
            json={"targetState": state},
        )
        assert transition.status_code == 200, transition.text
    invalid_skip = client.post(
        f"/admin/orders/{order_id}/transition",
        headers=auth(administrator),
        json={"targetState": "delivered"},
    )
    assert invalid_skip.status_code == 409

    shipped_at = "2026-08-28T15:00:00Z"
    delivered_at = "2026-08-29T15:00:00Z"
    shipment = client.put(
        f"/admin/orders/{order_id}/shipment",
        headers=auth(administrator),
        json={
            "carrier": "canada-post",
            "trackingReference": "DEMO TRACK 10001",
            "shippedAt": shipped_at,
            "deliveredAt": delivered_at,
        },
    )
    assert shipment.status_code == 200, shipment.text
    assert shipment.json()["state"] == "delivered"
    assert shipment.json()["shipment"]["trackingUrl"].startswith(
        "https://www.canadapost-postescanada.ca/"
    )

    refund = client.post(
        f"/admin/orders/{order_id}/refund",
        headers=auth(administrator),
        json={"confirm": True},
    )
    assert refund.status_code == 200, refund.text
    assert refund.json()["paymentStatus"] == "refunded"
    assert (
        client.post(
            f"/admin/orders/{order_id}/refund",
            headers=auth(administrator),
            json={"confirm": True},
        ).json()["paymentStatus"]
        == "refunded"
    )
    audit = client.get("/admin/audit", headers=auth(administrator))
    assert audit.status_code == 200
    assert {entry["action"] for entry in audit.json()} >= {
        "order.transition",
        "order.fulfilment",
        "refund.requested",
    }
    with factory() as session:
        events = session.scalars(select(PaymentEvent)).all()
        assert {event.outcome for event in events} >= {"paid", "refunded"}


def test_price_book_immutability_expiration_and_manual_review_mismatch(
    commerce_client: tuple[TestClient, sessionmaker[Session], str],
) -> None:
    client, factory, _database_url = commerce_client
    customer = register(client, "quote-owner@example.invalid")
    administrator = register(client, "pricing-admin@example.invalid")
    with factory() as session:
        admin = session.scalar(
            select(CustomerAccount).where(
                CustomerAccount.email == "pricing-admin@example.invalid"
            )
        )
        assert admin is not None
        admin.role = "administrator"
        session.commit()
    version_id = project_version(client, customer)
    quote = client.post(
        "/commerce/quotes",
        headers=auth(customer),
        json={"projectVersionId": version_id, "quantity": 1},
    ).json()
    with factory() as session:
        stored = session.get(PriceBook, "DEMOPriceBook000000001")
        assert stored is not None
        stored.label = "Mutated"
        with pytest.raises(RuntimeError, match="immutable"):
            session.commit()
        session.rollback()
        quote_row = session.execute(
            select(CustomerOrder).where(CustomerOrder.id == "missing")
        ).scalar_one_or_none()
        assert quote_row is None

    with factory() as session:
        session.execute(
            update(CommerceQuote)
            .where(CommerceQuote.id == quote["id"])
            .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        session.commit()
    expired_response = client.get(
        f"/commerce/quotes/{quote['id']}", headers=auth(customer)
    )
    assert expired_response.json()["status"] == "expired"
    assert expired_response.json()["canCheckout"] is False
    assert (
        client.post(
            "/commerce/cart/lines",
            headers=auth(customer),
            json={"quoteId": quote["id"]},
        ).status_code
        == 409
    )

    books = client.get("/admin/price-books", headers=auth(administrator))
    assert books.status_code == 200
    configuration = books.json()[0]["configuration"]
    drafted = client.post(
        "/admin/price-books",
        headers=auth(administrator),
        json={
            "label": "Demonstration CAD price model v2",
            "configuration": configuration,
        },
    )
    assert drafted.status_code == 201, drafted.text
    book_id = drafted.json()["id"]
    updated = client.patch(
        f"/admin/price-books/{book_id}",
        headers=auth(administrator),
        json={
            "label": "Demonstration CAD price model v2 reviewed",
            "configuration": configuration,
        },
    )
    assert updated.status_code == 200, updated.text
    published = client.post(
        f"/admin/price-books/{book_id}/publish",
        headers=auth(administrator),
        json={"confirm": True},
    )
    assert published.status_code == 200, published.text
    assert published.json()["state"] == "published"
    assert (
        client.patch(
            f"/admin/price-books/{book_id}",
            headers=auth(administrator),
            json={"label": "Forbidden edit", "configuration": configuration},
        ).status_code
        == 409
    )
    old = client.get(f"/commerce/quotes/{quote['id']}", headers=auth(customer)).json()
    assert old["priceBookVersion"] == 1
    repriced = client.post(
        f"/commerce/quotes/{quote['id']}/reprice",
        headers=auth(customer),
        json={"quantity": 1},
    ).json()
    assert repriced["id"] != quote["id"]
    assert repriced["priceBookVersion"] == 2


def test_settings_encryption_cli_and_account_deletion_boundaries(
    commerce_client: tuple[TestClient, sessionmaker[Session], str],
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    client, factory, database_url = commerce_client
    token = register(client, "bootstrap@example.invalid")
    database = Database(
        settings_provider=lambda: Settings(
            _env_file=None, environment="test", database_url=database_url
        )
    )
    assert promote_existing_account(" BOOTSTRAP@example.invalid ", database) is True
    assert promote_existing_account("missing@example.invalid", database) is False
    database.dispose()
    assert client.get("/account", headers=auth(token)).json()["role"] == "administrator"
    monkeypatch.setattr(
        "sys.argv",
        [
            "app.commerce.cli",
            "promote-admin",
            "--email",
            "bootstrap@example.invalid",
        ],
    )
    commerce_cli.main()
    assert capsys.readouterr().out.strip() == (
        "Existing account promoted to administrator."
    )
    with factory() as session:
        assert (
            session.scalar(
                select(AuditEvent).where(AuditEvent.action == "account.promoted_by_cli")
            )
            is not None
        )

    settings = Settings(_env_file=None, environment="test", commerce_mode="sandbox")
    cipher = ShippingCipher(settings)
    encrypted = cipher.encrypt("OrderExample0000000001", FICTIONAL_SHIPPING)
    assert (
        cipher.decrypt(
            "OrderExample0000000001",
            encrypted.ciphertext,
            encrypted.nonce,
            encrypted.key_id,
        )
        == FICTIONAL_SHIPPING
    )
    with pytest.raises(ShippingEncryptionError):
        cipher.decrypt(
            "DifferentOrder00000001",
            encrypted.ciphertext,
            encrypted.nonce,
            encrypted.key_id,
        )
    with pytest.raises(ValueError, match="COMMERCE_MODE=production"):
        Settings(
            _env_file=None,
            environment="test",
            commerce_enabled=True,
            commerce_mode="production",
        )
    with pytest.raises(ValueError, match="Production commerce requires"):
        Settings(
            _env_file=None,
            environment="production",
            frontend_origin="https://nicolasfrechette91.github.io",
            commerce_enabled=True,
            commerce_mode="sandbox",
        )


def test_account_deletion_is_blocked_during_paid_fulfilment(
    commerce_client: tuple[TestClient, sessionmaker[Session], str],
) -> None:
    client, _factory, _database_url = commerce_client
    customer = register(client, "deletion-owner@example.invalid")
    version_id = project_version(client, customer)
    quote = client.post(
        "/commerce/quotes",
        headers=auth(customer),
        json={"projectVersionId": version_id, "quantity": 1},
    ).json()
    client.post(
        "/commerce/cart/lines",
        headers=auth(customer),
        json={"quoteId": quote["id"]},
    )
    checkout = client.post(
        "/commerce/checkout",
        headers=auth(customer),
        json={"idempotencyKey": "checkout_delete_boundary_01"},
    ).json()
    session_id = parse_qs(urlsplit(checkout["checkoutUrl"]).query)["session"][0]
    client.post(
        f"/commerce/sandbox/checkouts/{session_id}/complete",
        json={"shipping": FICTIONAL_SHIPPING, "outcome": "success"},
    )
    blocked = client.post(
        "/account/delete",
        headers=auth(customer),
        json={"password": "correct horse battery staple"},
    )
    assert blocked.status_code == 409
    assert "fulfilment" in blocked.text
    assert "Demonstration Way" not in blocked.text


def test_amount_mismatch_delayed_success_and_out_of_order_failure_are_safe(
    commerce_client: tuple[TestClient, sessionmaker[Session], str],
) -> None:
    client, factory, _database_url = commerce_client
    customer = register(client, "event-ordering@example.invalid")
    version_id = project_version(client, customer)
    quote = client.post(
        "/commerce/quotes",
        headers=auth(customer),
        json={"projectVersionId": version_id, "quantity": 1},
    ).json()
    client.post(
        "/commerce/cart/lines",
        headers=auth(customer),
        json={"quoteId": quote["id"]},
    )
    checkout = client.post(
        "/commerce/checkout",
        headers=auth(customer),
        json={"idempotencyKey": "webhook_ordering_demo_00001"},
    ).json()
    session_id = parse_qs(urlsplit(checkout["checkoutUrl"]).query)["session"][0]
    with factory() as session:
        attempt = session.scalar(
            select(PaymentAttempt).where(
                PaymentAttempt.provider_session_id == session_id
            )
        )
        assert attempt is not None
        expected = attempt.expected_amount

    def event(event_id: str, event_type: str, amount: int) -> bytes:
        return json.dumps(
            {
                "id": event_id,
                "type": event_type,
                "data": {
                    "session_id": session_id,
                    "order_id": checkout["orderId"],
                    "amount_minor": amount,
                    "tax_minor": 0,
                    "shipping_minor": 0,
                    "currency": "CAD",
                    "payment_id": "pay_demo_ordering_00001",
                    "shipping": FICTIONAL_SHIPPING,
                },
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode()

    mismatch = event(
        "evt_demo_mismatch_ordering_01", "sandbox.checkout.completed", expected + 1
    )
    response = client.post(
        "/commerce/webhooks/sandbox",
        content=mismatch,
        headers={"SewnCovers-Signature": sandbox_signature(mismatch)},
    )
    assert response.json()["outcome"] == "manual_review"
    assert (
        client.get(
            f"/commerce/orders/{checkout['orderId']}", headers=auth(customer)
        ).json()["paymentStatus"]
        == "manual_review"
    )

    delayed = event(
        "evt_demo_delayed_success_001", "sandbox.checkout.completed", expected
    )
    assert (
        client.post(
            "/commerce/webhooks/sandbox",
            content=delayed,
            headers={"SewnCovers-Signature": sandbox_signature(delayed)},
        ).json()["outcome"]
        == "paid"
    )
    failure = event("evt_demo_late_failure_0001", "sandbox.checkout.failed", expected)
    late = client.post(
        "/commerce/webhooks/sandbox",
        content=failure,
        headers={"SewnCovers-Signature": sandbox_signature(failure)},
    )
    assert late.json()["outcome"] == "out_of_order_ignored"
    final = client.get(
        f"/commerce/orders/{checkout['orderId']}", headers=auth(customer)
    ).json()
    assert final["paymentStatus"] == "paid"
    assert final["state"] == "paid"


def test_abandoned_checkout_expires_and_releases_the_cart(
    commerce_client: tuple[TestClient, sessionmaker[Session], str],
) -> None:
    client, factory, _database_url = commerce_client
    customer = register(client, "abandoned-checkout@example.invalid")
    version_id = project_version(client, customer)
    quote = client.post(
        "/commerce/quotes",
        headers=auth(customer),
        json={"projectVersionId": version_id, "quantity": 1},
    ).json()
    client.post(
        "/commerce/cart/lines",
        headers=auth(customer),
        json={"quoteId": quote["id"]},
    )
    checkout = client.post(
        "/commerce/checkout",
        headers=auth(customer),
        json={"idempotencyKey": "abandoned_checkout_demo_0001"},
    ).json()
    with factory() as session:
        session.execute(
            update(PaymentAttempt)
            .where(PaymentAttempt.order_id == checkout["orderId"])
            .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
        )
        session.commit()
    cart = client.get("/commerce/cart", headers=auth(customer)).json()
    assert cart["state"] == "active"
    assert cart["lines"] == []
    assert cart["notices"]
    order = client.get(
        f"/commerce/orders/{checkout['orderId']}", headers=auth(customer)
    ).json()
    assert order["state"] == "cancelled"
    assert order["paymentStatus"] == "cancelled"
