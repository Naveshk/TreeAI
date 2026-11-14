"""DatasetRepository behaviour against a real SQLite database."""

import sqlite3
from collections.abc import Iterator
from dataclasses import replace
from pathlib import Path

import pytest

from app.storage.database import connect, init_db
from app.storage.records import ColumnRecord, DatasetRecord
from app.storage.repositories import DatasetRepository


@pytest.fixture
def conn(tmp_path: Path) -> Iterator[sqlite3.Connection]:
    db_path = tmp_path / "treeai.db"
    init_db(db_path)
    connection = connect(db_path)
    yield connection
    connection.close()


@pytest.fixture
def repo(conn: sqlite3.Connection) -> DatasetRepository:
    return DatasetRepository(conn)


def make_dataset(dataset_id: str = "11111111-1111-4111-8111-111111111111", **overrides):
    values = dict(
        id=dataset_id,
        name="iris",
        original_filename="iris.csv",
        source="upload",
        file_path=f"datasets/{dataset_id}/data.csv",
        file_size_bytes=4551,
        sha256="ab" * 32,
        n_rows=150,
        n_cols=2,
        duplicate_rows=1,
        total_missing=0,
        detected_encoding="utf-8-sig",
        detected_delimiter=",",
        created_at="2026-11-15T10:00:00+00:00",
    )
    values.update(overrides)
    return DatasetRecord(**values)


COLUMNS = [
    ColumnRecord(
        position=0,
        name="sepal_length",
        dtype="float64",
        inferred_kind="numeric",
        missing_count=0,
        unique_count=35,
    ),
    ColumnRecord(
        position=1,
        name="species",
        dtype="str",
        inferred_kind="categorical",
        missing_count=2,
        unique_count=3,
    ),
]


def test_create_and_get_round_trip(repo: DatasetRepository) -> None:
    dataset = make_dataset()
    repo.create(dataset, COLUMNS)

    assert repo.get(dataset.id) == dataset
    assert repo.get_columns(dataset.id) == COLUMNS


def test_columns_are_returned_in_position_order(repo: DatasetRepository) -> None:
    dataset = make_dataset()
    repo.create(dataset, list(reversed(COLUMNS)))

    assert [c.position for c in repo.get_columns(dataset.id)] == [0, 1]


def test_get_missing_returns_none(repo: DatasetRepository) -> None:
    assert repo.get("does-not-exist") is None
    assert repo.get_columns("does-not-exist") == []


def test_list_newest_first(repo: DatasetRepository) -> None:
    older = make_dataset(
        "11111111-1111-4111-8111-111111111111", created_at="2026-11-15T09:00:00+00:00"
    )
    newer = make_dataset(
        "22222222-2222-4222-8222-222222222222", created_at="2026-11-15T11:00:00+00:00"
    )
    repo.create(older, COLUMNS)
    repo.create(newer, COLUMNS)

    assert [d.id for d in repo.list_all()] == [newer.id, older.id]


def test_delete_returns_whether_a_row_was_removed(
    repo: DatasetRepository, conn: sqlite3.Connection
) -> None:
    dataset = make_dataset()
    repo.create(dataset, COLUMNS)

    assert repo.delete(dataset.id) is True
    assert repo.get(dataset.id) is None
    assert conn.execute("SELECT COUNT(*) FROM dataset_columns").fetchone()[0] == 0
    assert repo.delete(dataset.id) is False


def test_duplicate_column_names_rejected_and_nothing_inserted(
    repo: DatasetRepository, conn: sqlite3.Connection
) -> None:
    dataset = make_dataset()
    duplicate = [COLUMNS[0], replace(COLUMNS[1], name=COLUMNS[0].name)]

    with pytest.raises(sqlite3.IntegrityError):
        repo.create(dataset, duplicate)

    # The dataset row inserted earlier in the same transaction was rolled back.
    assert repo.get(dataset.id) is None
    assert conn.execute("SELECT COUNT(*) FROM dataset_columns").fetchone()[0] == 0
    assert not conn.in_transaction


def test_duplicate_dataset_id_rejected(repo: DatasetRepository) -> None:
    dataset = make_dataset()
    repo.create(dataset, COLUMNS)

    with pytest.raises(sqlite3.IntegrityError):
        repo.create(dataset, COLUMNS)
    assert len(repo.get_columns(dataset.id)) == 2


def test_get_model_ids(repo: DatasetRepository, conn: sqlite3.Connection) -> None:
    dataset = make_dataset()
    repo.create(dataset, COLUMNS)
    assert repo.get_model_ids(dataset.id) == []

    with conn:
        conn.execute(
            """INSERT INTO models (id, dataset_id, name, task_type, target_column,
                   feature_columns_json, column_types_json, hyperparameters_json, test_size,
                   random_state, stratified, status, created_at)
               VALUES ('m1', ?, 'm', 'classification', 'species', '[]', '{}', '{}', 0.2,
                       42, 1, 'ready', '2026-11-15T10:00:00+00:00')""",
            (dataset.id,),
        )
    assert repo.get_model_ids(dataset.id) == ["m1"]


def test_values_are_bound_not_interpolated(repo: DatasetRepository) -> None:
    hostile = make_dataset(name="x'); DROP TABLE datasets; --")
    repo.create(hostile, COLUMNS)

    assert repo.get(hostile.id).name == "x'); DROP TABLE datasets; --"
    assert len(repo.list_all()) == 1
