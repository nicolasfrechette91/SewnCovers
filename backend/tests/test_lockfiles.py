"""The hashed requirements files agree with pyproject.toml and with each other.

CI also re-runs ``tools/compile_requirements.py`` to catch a transitive pin that
changed; these checks need no network, so they fail locally first.
"""

import re
import tomllib
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
OPTIONAL_PACKAGES = {"boto3", "pillow", "stripe"}
# What the optional packages pull in that nothing else in the runtime needs.
OPTIONAL_CLOSURE = OPTIONAL_PACKAGES | {"botocore", "s3transfer", "jmespath"}

PIN_LINE = re.compile(r"^(?P<name>[A-Za-z0-9][A-Za-z0-9._-]*)==(?P<version>[^\s;\\]+)")
HASH_LINE = re.compile(r"^--hash=sha256:[0-9a-f]{64}(?: \\)?$")
REQUIREMENT = re.compile(
    r"^(?P<name>[A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]+\])?(?:==(?P<version>\S+))?$"
)


def normalize(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def read_lock(filename: str) -> dict[str, tuple[str, int]]:
    """Return {package: (version, hash count)}; fail on any unexpected line."""
    pins: dict[str, tuple[str, int]] = {}
    current: str | None = None
    for line in (BACKEND_ROOT / filename).read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if not line.startswith(" "):
            match = PIN_LINE.match(line)
            assert match, f"{filename}: not a pinned requirement: {line!r}"
            current = normalize(match["name"])
            assert current not in pins, f"{filename}: {current} is pinned twice"
            pins[current] = (match["version"], 0)
        else:
            assert HASH_LINE.match(stripped), f"{filename}: unexpected {line!r}"
            assert current is not None
            version, count = pins[current]
            pins[current] = (version, count + 1)
    return pins


def declared(requirements: list[str]) -> dict[str, str | None]:
    result: dict[str, str | None] = {}
    for requirement in requirements:
        match = REQUIREMENT.match(requirement)
        assert match, f"cannot read requirement {requirement!r}"
        result[normalize(match["name"])] = match["version"]
    return result


@pytest.fixture(scope="module")
def project() -> dict:
    with (BACKEND_ROOT / "pyproject.toml").open("rb") as project_file:
        return tomllib.load(project_file)["project"]


@pytest.fixture(scope="module")
def locks() -> dict[str, dict[str, tuple[str, int]]]:
    return {
        name: read_lock(name)
        for name in (
            "requirements.txt",
            "requirements-features.txt",
            "requirements-dev.txt",
        )
    }


def test_every_locked_package_is_pinned_with_hashes(locks) -> None:
    for filename, pins in locks.items():
        assert pins, filename
        unhashed = [name for name, (_version, count) in pins.items() if count == 0]
        assert not unhashed, f"{filename}: no hashes for {unhashed}"


def test_extras_are_split_so_production_installs_none_of_them(project) -> None:
    base = declared(project["dependencies"])
    extras = project["optional-dependencies"]

    assert set(extras) == {"uploads", "commerce", "dev"}
    assert not OPTIONAL_PACKAGES & set(base)
    assert set(declared(extras["uploads"])) == {"boto3", "pillow"}
    assert set(declared(extras["commerce"])) == {"stripe"}
    # The dev extra stays a superset so `pip install -e ".[dev]"` still runs
    # the whole suite.
    assert {"sewncovers-api"} <= set(declared(extras["dev"]))
    assert "[commerce,uploads]" in "".join(extras["dev"]).replace(" ", "")


def test_locks_pin_exactly_what_pyproject_declares(project, locks) -> None:
    extras = project["optional-dependencies"]
    expectations = {
        "requirements.txt": declared(project["dependencies"]),
        "requirements-features.txt": {
            **declared(project["dependencies"]),
            **declared(extras["uploads"]),
            **declared(extras["commerce"]),
        },
        "requirements-dev.txt": {
            **declared(project["dependencies"]),
            **declared(extras["uploads"]),
            **declared(extras["commerce"]),
            **{
                name: version
                for name, version in declared(extras["dev"]).items()
                if name != "sewncovers-api"
            },
        },
    }
    for filename, direct in expectations.items():
        for name, version in direct.items():
            assert name in locks[filename], f"{filename} is missing {name}"
            assert locks[filename][name][0] == version, f"{filename}: {name}"


def test_runtime_lock_leaves_out_the_optional_packages_and_their_dependencies(
    locks,
) -> None:
    runtime = set(locks["requirements.txt"])
    assert not OPTIONAL_CLOSURE & runtime
    assert OPTIONAL_CLOSURE <= set(locks["requirements-features.txt"])
    assert OPTIONAL_CLOSURE <= set(locks["requirements-dev.txt"])


def test_the_three_locks_agree_on_every_shared_version(locks) -> None:
    runtime, features, dev = (
        locks["requirements.txt"],
        locks["requirements-features.txt"],
        locks["requirements-dev.txt"],
    )
    assert set(runtime) < set(features) < set(dev)
    for smaller, larger in ((runtime, features), (features, dev)):
        different = {
            name: (version, larger[name][0])
            for name, (version, _count) in smaller.items()
            if larger[name][0] != version
        }
        assert not different, different
