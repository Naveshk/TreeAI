"""SQLite connection handling and transaction-safe schema migrations."""

import sqlite3
from collections.abc import Sequence
from pathlib import Path

from app.storage.schema import MIGRATIONS

BUSY_TIMEOUT_MS = 5000


def connect(db_path: Path) -> sqlite3.Connection:
    """Open a connection with the pragmas every TreeAI connection needs.

    `check_same_thread=False` is required because FastAPI may run a dependency's setup
    and teardown on different threadpool threads. Each connection is still used by a
    single request only and must be closed by the caller.
    """
    conn = sqlite3.connect(db_path, timeout=BUSY_TIMEOUT_MS / 1000, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Foreign keys are OFF by default in SQLite and the setting is per connection.
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(f"PRAGMA busy_timeout = {BUSY_TIMEOUT_MS}")
    return conn


def get_schema_version(conn: sqlite3.Connection) -> int:
    return int(conn.execute("PRAGMA user_version").fetchone()[0])


def init_db(db_path: Path, migrations: Sequence[str] = MIGRATIONS) -> int:
    """Create or upgrade the database schema. Safe to call repeatedly.

    Returns the schema version after initialization.

    Transaction safety: `sqlite3.Connection.executescript()` first COMMITs any pending
    transaction and never rolls back on failure. Therefore each migration is executed as
    ONE script that contains its own `BEGIN IMMEDIATE ... COMMIT`, including the
    `user_version` bump (which SQLite applies transactionally). If any statement fails,
    the still-open transaction is rolled back explicitly, leaving schema, data and
    version exactly as they were before that migration.
    """
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(db_path)
    try:
        # Must run outside a transaction (it is a no-op / error inside one).
        conn.execute("PRAGMA journal_mode = WAL")

        current = get_schema_version(conn)
        if current > len(migrations):
            raise RuntimeError(
                f"Database schema version {current} is newer than this application "
                f"supports ({len(migrations)})."
            )

        for version in range(current + 1, len(migrations) + 1):
            script = (
                "BEGIN IMMEDIATE;\n"
                f"{migrations[version - 1]}\n"
                f"PRAGMA user_version = {version};\n"
                "COMMIT;\n"
            )
            try:
                conn.executescript(script)
            except Exception:
                if conn.in_transaction:
                    conn.execute("ROLLBACK")
                raise
        return get_schema_version(conn)
    finally:
        conn.close()
