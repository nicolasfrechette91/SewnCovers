"""The short temporary-directory choice that lets a plain pytest run on Windows."""

import os
import time
from pathlib import Path

import pytest

from tests import basetemp


def test_the_first_root_with_room_is_used_and_its_folder_created(
    tmp_path: Path,
) -> None:
    chosen = basetemp.choose_base([tmp_path], "1234")

    assert chosen == tmp_path / basetemp.DIRECTORY_NAME / "1234"
    assert chosen.parent.is_dir()
    # The run folder is left for pytest to create.
    assert not chosen.exists()


def test_a_root_that_is_too_long_is_skipped_for_the_next(tmp_path: Path) -> None:
    too_long = tmp_path / ("x" * basetemp.WINDOWS_PATH_LIMIT)
    roomy = tmp_path / "roomy"
    roomy.mkdir()

    chosen = basetemp.choose_base([too_long, roomy], "1")

    assert chosen == roomy / basetemp.DIRECTORY_NAME / "1"
    assert not too_long.exists()


def test_a_root_that_cannot_be_written_is_skipped_for_the_next(
    tmp_path: Path,
) -> None:
    not_a_folder = tmp_path / "file"
    not_a_folder.write_text("occupied", encoding="utf-8")
    roomy = tmp_path / "roomy"
    roomy.mkdir()

    chosen = basetemp.choose_base([not_a_folder, roomy], "1")

    assert chosen == roomy / basetemp.DIRECTORY_NAME / "1"


def test_nothing_is_chosen_when_no_root_has_room(tmp_path: Path) -> None:
    too_long = tmp_path / ("x" * basetemp.WINDOWS_PATH_LIMIT)

    assert basetemp.choose_base([too_long], "1") is None
    assert basetemp.choose_base([], "1") is None


def test_the_allowance_covers_the_deepest_file_the_tests_create() -> None:
    # The longest path any test writes (a derivative's content-type sidecar in
    # the upload tests), measured below pytest's base, with its leading
    # separator: 143 characters.
    deepest = (
        "/test_worker_claim_is_exclusive0/private-objects/processed/"
        + "a" * 32
        + "/"
        + "b" * 32
        + "-thumbnail.bin.type"
    )
    assert len(deepest) == 143
    assert len(deepest) <= basetemp.LONGEST_PATH_BELOW_BASE


def test_old_run_folders_are_removed_and_recent_ones_kept(tmp_path: Path) -> None:
    now = time.time()
    old = tmp_path / "111"
    recent = tmp_path / "222"
    for folder in (old, recent):
        (folder / "files").mkdir(parents=True)
        (folder / "files" / "left-behind.txt").write_text("x", encoding="utf-8")
    stray_file = tmp_path / "notes.txt"
    stray_file.write_text("not a run folder", encoding="utf-8")
    two_days_ago = now - 2 * basetemp.STALE_AFTER_SECONDS
    os.utime(old, (two_days_ago, two_days_ago))
    os.utime(stray_file, (two_days_ago, two_days_ago))

    basetemp.remove_stale_runs(tmp_path, now)

    assert not old.exists()
    assert recent.exists()
    assert stray_file.exists()


def test_a_missing_folder_is_not_an_error(tmp_path: Path) -> None:
    basetemp.remove_stale_runs(tmp_path / "absent", time.time())


def test_the_candidates_start_with_the_system_temporary_directory() -> None:
    first, second = basetemp.candidate_roots()

    assert first.is_dir()
    assert second == Path(first.anchor)


@pytest.mark.skipif(os.name != "nt", reason="the short base is chosen on Windows only")
def test_a_plain_run_keeps_every_test_path_within_the_windows_limit(
    tmp_path: Path, pytestconfig: pytest.Config
) -> None:
    given = Path(str(pytestconfig.option.basetemp))
    if given.parent.name != basetemp.DIRECTORY_NAME:
        pytest.skip("--basetemp was given, so that directory is used as it is")

    assert basetemp.fits(tmp_path)
