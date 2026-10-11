"""`python -m app.assurance.cli readiness`: a read-only configuration report."""

import json
import runpy
import sys

import pytest

import app.assurance.cli as cli_module
from app.assurance.cli import main

SECRET = "hunter2-database-password"
READY_ENVIRONMENT = {
    "ENVIRONMENT": "production",
    "FRONTEND_ORIGIN": "https://nicolasfrechette91.github.io",
    "DATABASE_URL": f"postgresql://role:{SECRET}@db.example.invalid/app",
    "COMMERCE_ADMIN_CONTACT": "owner@example.com",
    "VULNERABILITY_REPORT_CONTACT": "security@example.com",
}


def configure_ready(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in READY_ENVIRONMENT.items():
        monkeypatch.setenv(name, value)


def test_a_local_configuration_is_not_ready_and_says_why(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = main(["readiness"])

    output = capsys.readouterr().out
    assert exit_code == 1
    lines = output.splitlines()
    assert lines[-1].startswith("Read-only configuration validation only")
    assert any(line.startswith("ERROR") and "environment:" in line for line in lines), (
        output
    )
    assert any(line.startswith("ERROR") and "database:" in line for line in lines)
    # Each report line is "LEVEL<padding> code: message".
    assert all(
        line.split()[0] in {"ERROR", "WARNING", "INFORMATION"} for line in lines[:-1]
    )


def test_a_production_configuration_is_ready_and_reports_no_errors(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    configure_ready(monkeypatch)

    exit_code = main(["readiness"])

    output = capsys.readouterr().out
    assert exit_code == 0
    assert "ERROR" not in output
    assert "WARNING" in output  # review items remain; they do not block
    # The report says a value is present, never what it is.
    assert SECRET not in output
    assert "owner@example.com" not in output
    assert "db.example.invalid" not in output


def test_json_output_is_one_sorted_document(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    configure_ready(monkeypatch)

    exit_code = main(["readiness", "--json"])

    raw = capsys.readouterr().out
    assert exit_code == 0
    report = json.loads(raw)
    assert raw.strip() == json.dumps(report, sort_keys=True)
    assert report["ready"] is True
    assert {check["level"] for check in report["checks"]} <= {
        "error",
        "warning",
        "information",
    }
    assert {check["code"] for check in report["checks"]} >= {
        "environment",
        "database",
        "migration",
        "contact",
    }
    assert SECRET not in raw


def test_json_output_for_a_local_configuration_is_not_ready(
    capsys: pytest.CaptureFixture[str],
) -> None:
    exit_code = main(["readiness", "--json"])

    report = json.loads(capsys.readouterr().out)
    assert exit_code == 1
    assert report["ready"] is False
    errors = {c["code"] for c in report["checks"] if c["level"] == "error"}
    assert {"environment", "database"} <= errors


@pytest.mark.parametrize("arguments", [[], ["audit"], ["readiness", "--xml"]])
def test_unknown_commands_and_options_are_refused(
    capsys: pytest.CaptureFixture[str], arguments: list[str]
) -> None:
    with pytest.raises(SystemExit) as refused:
        main(arguments)

    assert refused.value.code == 2
    assert "usage: python -m app.assurance.cli" in capsys.readouterr().err


def test_the_module_runs_as_a_command_and_exits_with_the_report_status(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(sys, "argv", ["app.assurance.cli", "readiness"])

    with pytest.raises(SystemExit) as finished:
        runpy.run_path(cli_module.__file__, run_name="__main__")

    assert finished.value.code == 1  # a local configuration is not ready
    assert "ERROR" in capsys.readouterr().out
