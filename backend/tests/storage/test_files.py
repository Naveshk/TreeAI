"""FileStore: layout, id validation, atomic writes, confined deletes, tmp cleanup."""

import hashlib
from pathlib import Path

import pytest

from app.storage.files import FileStore, is_valid_id, new_id, sha256_file


@pytest.fixture
def store(tmp_path: Path) -> FileStore:
    file_store = FileStore(tmp_path / "data")
    file_store.ensure_dirs()
    return file_store


def test_ensure_dirs_creates_layout(store: FileStore) -> None:
    for directory in (store.data_dir, store.datasets_dir, store.models_dir, store.tmp_dir):
        assert directory.is_dir()


def test_paths_follow_layout(store: FileStore) -> None:
    dataset_id = new_id()

    assert store.dataset_csv_path(dataset_id) == store.datasets_dir / dataset_id / "data.csv"
    assert store.dataset_profile_path(dataset_id).name == "profile.json"
    assert store.model_dir(dataset_id) == store.models_dir / dataset_id


def test_new_id_is_valid_and_unique() -> None:
    ids = {new_id() for _ in range(100)}
    assert len(ids) == 100
    assert all(is_valid_id(i) for i in ids)


@pytest.mark.parametrize(
    "bad_id",
    [
        "",
        "abc",
        "../etc",
        "../../etc/passwd",
        "11111111-1111-4111-8111-111111111111/../../x",
        "11111111-1111-4111-8111-11111111111",  # too short
        "11111111111141118111111111111111",  # not canonical (no dashes)
        "11111111-1111-4111-8111-11111111111A",  # uppercase is not canonical
        "/tmp",
    ],
)
def test_invalid_ids_are_rejected(store: FileStore, bad_id: str) -> None:
    assert not is_valid_id(bad_id)
    with pytest.raises(ValueError):
        store.dataset_dir(bad_id)
    with pytest.raises(ValueError):
        store.delete_dataset_files(bad_id)
    with pytest.raises(ValueError):
        store.model_dir(bad_id)


def test_relative_and_absolute_round_trip(store: FileStore) -> None:
    path = store.dataset_csv_path(new_id())
    relative = store.relative(path)

    assert not relative.startswith("/")
    assert relative.startswith("datasets/")
    assert store.absolute(relative) == path
    with pytest.raises(ValueError):
        store.absolute("../outside.csv")


def test_write_bytes_atomic_leaves_no_temp_files(store: FileStore) -> None:
    path = store.dataset_profile_path(new_id())

    store.write_bytes_atomic(path, b'{"a": 1}')
    store.write_bytes_atomic(path, b'{"a": 2}')

    assert path.read_bytes() == b'{"a": 2}'
    assert [p.name for p in path.parent.iterdir()] == ["profile.json"]


def test_write_bytes_atomic_cleans_up_on_failure(
    store: FileStore, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = store.dataset_profile_path(new_id())

    def failing_replace(*_args: object) -> None:
        raise OSError("disk full")

    monkeypatch.setattr("app.storage.files.os.replace", failing_replace)
    with pytest.raises(OSError, match="disk full"):
        store.write_bytes_atomic(path, b"data")

    assert not path.exists()
    assert list(path.parent.iterdir()) == []


def test_move_into_place(store: FileStore) -> None:
    tmp_file = store.new_tmp_file()
    tmp_file.write_bytes(b"a,b\n1,2\n")
    dest = store.dataset_csv_path(new_id())

    store.move_into_place(tmp_file, dest)

    assert dest.read_bytes() == b"a,b\n1,2\n"
    assert not tmp_file.exists()


def test_sha256_file_matches_hashlib(tmp_path: Path) -> None:
    path = tmp_path / "f.bin"
    data = b"x" * (3 * 1024 * 1024 + 7)  # spans several hash chunks
    path.write_bytes(data)

    assert sha256_file(path) == hashlib.sha256(data).hexdigest()


def test_delete_is_confined_to_one_dataset(store: FileStore) -> None:
    keep, remove = new_id(), new_id()
    for dataset_id in (keep, remove):
        store.write_bytes_atomic(store.dataset_csv_path(dataset_id), b"a,b\n1,2\n")

    store.delete_dataset_files(remove)
    store.delete_dataset_files(remove)  # deleting twice is harmless

    assert not store.dataset_dir(remove).exists()
    assert store.dataset_csv_path(keep).exists()


def test_clear_tmp_removes_leftovers_only(store: FileStore) -> None:
    leftover = store.new_tmp_file()
    (store.tmp_dir / "subdir").mkdir()
    (store.tmp_dir / "subdir" / "x").write_bytes(b"x")
    kept = store.dataset_csv_path(new_id())
    store.write_bytes_atomic(kept, b"a,b\n")

    store.clear_tmp()

    assert not leftover.exists()
    assert list(store.tmp_dir.iterdir()) == []
    assert kept.exists()
