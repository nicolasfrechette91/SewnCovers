"""Explicit local administrator bootstrap command."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime

from sqlalchemy import select

from app.persistence.database import Database, session_scope
from app.persistence.models import AuditEvent, CustomerAccount
from app.persistence.transactions import service_transaction


def promote_existing_account(email: str, database: Database | None = None) -> bool:
    normalized = email.strip().casefold()
    owner = database or Database()
    try:
        with session_scope(owner) as session:
            account = session.scalar(
                select(CustomerAccount).where(CustomerAccount.email == normalized)
            )
            if account is None:
                return False
            if account.role == "administrator":
                return True
            with service_transaction(session):
                account.role = "administrator"
                session.add(
                    AuditEvent(
                        actor_account_id=account.id,
                        action="account.promoted_by_cli",
                        target_type="account",
                        target_id=account.id,
                        data={"source": "explicit_cli"},
                        created_at=datetime.now(UTC),
                    )
                )
        return True
    finally:
        if database is None:
            owner.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Promote one existing SewnCovers account to administrator."
    )
    parser.add_argument("promote-admin", choices=["promote-admin"])
    parser.add_argument("--email", required=True)
    args = parser.parse_args()
    if not promote_existing_account(args.email):
        parser.error("No existing account matched the normalized email.")
    print("Existing account promoted to administrator.")


if __name__ == "__main__":
    main()
