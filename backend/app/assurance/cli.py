"""Read-only Task 10.5 production-readiness validation command."""

from __future__ import annotations

import argparse
import json

from sqlalchemy.orm import Session

from app.assurance.service import AssuranceService
from app.settings import Settings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m app.assurance.cli",
        description=(
            "Read-only SewnCovers configuration validation (not an audit or approval)."
        ),
    )
    parser.add_argument("command", choices=("readiness",))
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args(argv)
    report = AssuranceService(Session(), Settings()).readiness()
    if args.as_json:
        print(json.dumps(report.model_dump(mode="json", by_alias=True), sort_keys=True))
    else:
        for check in report.checks:
            print(f"{check.level.upper():11} {check.code}: {check.message}")
        print(report.disclaimer)
    return 0 if report.ready else 1


if __name__ == "__main__":
    raise SystemExit(main())
