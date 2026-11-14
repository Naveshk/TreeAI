"""SQL access for table rows. Parameterized queries only.

Repositories receive an open connection and never open or close it themselves.
Model and evaluation repositories are added in M4 together with the code that uses them.
"""

import sqlite3
from collections.abc import Sequence
from dataclasses import astuple, fields

from app.storage.records import ColumnRecord, DatasetRecord

_DATASET_FIELDS = [f.name for f in fields(DatasetRecord)]
_COLUMN_FIELDS = [f.name for f in fields(ColumnRecord)]


class DatasetRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def create(self, dataset: DatasetRecord, columns: Sequence[ColumnRecord]) -> None:
        """Insert a dataset and its columns atomically (all or nothing)."""
        dataset_sql = (
            f"INSERT INTO datasets ({', '.join(_DATASET_FIELDS)}) "
            f"VALUES ({', '.join('?' for _ in _DATASET_FIELDS)})"
        )
        column_sql = (
            f"INSERT INTO dataset_columns (dataset_id, {', '.join(_COLUMN_FIELDS)}) "
            f"VALUES (?, {', '.join('?' for _ in _COLUMN_FIELDS)})"
        )
        with self._conn:  # commits on success, rolls back on any exception
            self._conn.execute(dataset_sql, astuple(dataset))
            self._conn.executemany(
                column_sql, [(dataset.id, *astuple(column)) for column in columns]
            )

    def get(self, dataset_id: str) -> DatasetRecord | None:
        row = self._conn.execute(
            f"SELECT {', '.join(_DATASET_FIELDS)} FROM datasets WHERE id = ?", (dataset_id,)
        ).fetchone()
        return DatasetRecord(**dict(row)) if row else None

    def list_all(self) -> list[DatasetRecord]:
        rows = self._conn.execute(
            f"SELECT {', '.join(_DATASET_FIELDS)} FROM datasets ORDER BY created_at DESC, id"
        ).fetchall()
        return [DatasetRecord(**dict(row)) for row in rows]

    def get_columns(self, dataset_id: str) -> list[ColumnRecord]:
        rows = self._conn.execute(
            f"SELECT {', '.join(_COLUMN_FIELDS)} FROM dataset_columns "
            "WHERE dataset_id = ? ORDER BY position",
            (dataset_id,),
        ).fetchall()
        return [ColumnRecord(**dict(row)) for row in rows]

    def get_model_ids(self, dataset_id: str) -> list[str]:
        """IDs of models trained on this dataset (needed to delete their files)."""
        rows = self._conn.execute(
            "SELECT id FROM models WHERE dataset_id = ?", (dataset_id,)
        ).fetchall()
        return [row["id"] for row in rows]

    def delete(self, dataset_id: str) -> bool:
        """Delete the dataset row; columns, models and evaluations cascade."""
        with self._conn:
            cursor = self._conn.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
        return cursor.rowcount > 0
