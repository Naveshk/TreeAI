"""SQLite initialization, pragmas, constraints and transaction-safe migrations."""

import sqlite3
from pathlib import Path

import pytest

from app.storage.database import connect, get_schema_version, init_db
from app.storage.schema import MIGRATIONS

NOW = "2026-11-15T00:00:00+00:00"


def _tables(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {row[0] for row in rows}


def _insert_dataset(conn: sqlite3.Connection, dataset_id: str = "d1") -> None:
    conn.execute(
        """INSERT INTO datasets (id, name, original_filename, source, file_path,
               file_size_bytes, sha256, n_rows, n_cols, duplicate_rows, total_missing,
               detected_encoding, detected_delimiter, created_at)
           VALUES (?, 'n', 'n.csv', 'upload', 'p', 1, 'h', 1, 2, 0, 0, 'utf-8', ',', ?)""",
        (dataset_id, NOW),
    )


def _insert_model(conn: sqlite3.Connection, model_id: str = "m1", dataset_id: str = "d1") -> None:
    conn.execute(
        """INSERT INTO models (id, dataset_id, name, task_type, target_column,
               feature_columns_json, column_types_json, hyperparameters_json, test_size,
               random_state, stratified, status, created_at)
           VALUES (?, ?, 'm', 'classification', 't', '[]', '{}', '{}', 0.2, 42, 1,
                   'training', ?)""",
        (model_id, dataset_id, NOW),
    )


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "nested" / "treeai.db"


def test_init_creates_schema_and_sets_version(db_path: Path) -> None:
    version = init_db(db_path)

    assert version == len(MIGRATIONS) == 1
    conn = connect(db_path)
    try:
        assert _tables(conn) == {"datasets", "dataset_columns", "models", "evaluations"}
        indexes = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")}
        assert "idx_models_dataset" in indexes
        assert get_schema_version(conn) == 1
    finally:
        conn.close()


def test_init_is_idempotent_and_keeps_data(db_path: Path) -> None:
    init_db(db_path)
    conn = connect(db_path)
    with conn:
        _insert_dataset(conn)
    conn.close()

    assert init_db(db_path) == 1

    conn = connect(db_path)
    try:
        assert conn.execute("SELECT COUNT(*) FROM datasets").fetchone()[0] == 1
    finally:
        conn.close()


def test_connections_enable_foreign_keys_and_wal(db_path: Path) -> None:
    init_db(db_path)
    conn = connect(db_path)
    try:
        assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 5000
    finally:
        conn.close()


def test_deleting_dataset_cascades_to_columns_models_and_evaluations(db_path: Path) -> None:
    init_db(db_path)
    conn = connect(db_path)
    try:
        with conn:
            _insert_dataset(conn)
            conn.execute(
                "INSERT INTO dataset_columns VALUES ('d1', 0, 'a', 'int64', 'numeric', 0, 1)"
            )
            _insert_model(conn)
            conn.execute(
                "INSERT INTO evaluations (model_id, n_samples, metrics_json, created_at) "
                "VALUES ('m1', 10, '{}', ?)",
                (NOW,),
            )
        with conn:
            conn.execute("DELETE FROM datasets WHERE id = 'd1'")

        for table in ("dataset_columns", "models", "evaluations"):
            assert conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0
    finally:
        conn.close()


def test_foreign_key_rejects_orphan_model(db_path: Path) -> None:
    init_db(db_path)
    conn = connect(db_path)
    try:
        with pytest.raises(sqlite3.IntegrityError), conn:
            _insert_model(conn, dataset_id="does-not-exist")
    finally:
        conn.close()


@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE models SET task_type = 'clustering' WHERE id = 'm1'",
        "UPDATE models SET status = 'done' WHERE id = 'm1'",
        "UPDATE datasets SET source = 'web' WHERE id = 'd1'",
    ],
)
def test_check_constraints(db_path: Path, sql: str) -> None:
    init_db(db_path)
    conn = connect(db_path)
    try:
        with conn:
            _insert_dataset(conn)
            _insert_model(conn)
        with pytest.raises(sqlite3.IntegrityError), conn:
            conn.execute(sql)
    finally:
        conn.close()


def _snapshot(db_path: Path) -> tuple[int, set[str], list[tuple]]:
    conn = connect(db_path)
    try:
        rows = [tuple(r) for r in conn.execute("SELECT * FROM datasets ORDER BY id")]
        return get_schema_version(conn), _tables(conn), rows
    finally:
        conn.close()


def test_failed_migration_rolls_back_completely(db_path: Path) -> None:
    init_db(db_path)
    conn = connect(db_path)
    with conn:
        _insert_dataset(conn)
    conn.close()
    before = _snapshot(db_path)

    broken = (
        MIGRATIONS[0],
        # The first statements succeed, the last one fails: everything must be undone.
        """
        CREATE TABLE partial_table (id INTEGER PRIMARY KEY);
        INSERT INTO partial_table VALUES (1);
        ALTER TABLE datasets ADD COLUMN extra TEXT;
        DELETE FROM datasets;
        INSERT INTO table_that_does_not_exist VALUES (1);
        """,
    )
    with pytest.raises(sqlite3.OperationalError, match="table_that_does_not_exist"):
        init_db(db_path, migrations=broken)

    after = _snapshot(db_path)
    assert after == before
    assert after[0] == 1
    assert "partial_table" not in after[1]
    assert len(after[2]) == 1  # the DELETE was rolled back
    conn = connect(db_path)
    try:
        columns = {r["name"] for r in conn.execute("PRAGMA table_info(datasets)")}
        assert "extra" not in columns
        assert not conn.in_transaction
    finally:
        conn.close()

    # The database is still usable and the fixed migration list still works.
    assert init_db(db_path) == 1


def test_failed_first_migration_leaves_empty_database(db_path: Path) -> None:
    broken = ("CREATE TABLE a (id INTEGER); CREATE TABLE a (id INTEGER);",)

    with pytest.raises(sqlite3.OperationalError, match="already exists"):
        init_db(db_path, migrations=broken)

    conn = connect(db_path)
    try:
        assert _tables(conn) == set()
        assert get_schema_version(conn) == 0
    finally:
        conn.close()


def test_newer_database_version_is_rejected(db_path: Path) -> None:
    init_db(db_path)
    with pytest.raises(RuntimeError, match="newer"):
        init_db(db_path, migrations=())
