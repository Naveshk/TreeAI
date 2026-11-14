"""Application startup: storage initialization and dependency behaviour."""

import sqlite3
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import deps
from app.api.deps import DbDep
from app.config import Settings
from app.main import create_app
from app.storage.database import connect, get_schema_version
from app.storage.schema import MIGRATIONS

BACKEND_DIR = Path(__file__).resolve().parents[2]


def test_creating_app_touches_no_files(settings: Settings) -> None:
    create_app(settings)

    assert not settings.data_dir.exists()


def test_importing_main_does_not_create_data_dir(tmp_path: Path) -> None:
    data_dir = tmp_path / "should-not-exist"
    code = "import app.main"
    env = {"TREEAI_DATA_DIR": str(data_dir), "PATH": ""}
    subprocess.run([sys.executable, "-c", code], cwd=BACKEND_DIR, env=env, check=True)

    assert not data_dir.exists()


def test_startup_creates_storage(settings: Settings) -> None:
    with TestClient(create_app(settings)):
        pass

    for directory in (settings.datasets_dir, settings.models_dir, settings.tmp_dir):
        assert directory.is_dir()
    conn = connect(settings.db_path)
    try:
        assert get_schema_version(conn) == len(MIGRATIONS)
    finally:
        conn.close()


def test_startup_clears_leftover_tmp_files(settings: Settings) -> None:
    settings.tmp_dir.mkdir(parents=True)
    leftover = settings.tmp_dir / "interrupted.part"
    leftover.write_bytes(b"partial upload")

    with TestClient(create_app(settings)):
        assert not leftover.exists()


def test_get_db_closes_connection_after_request(
    app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    opened: list[sqlite3.Connection] = []
    real_connect = deps.connect

    def tracking_connect(*args: Any, **kwargs: Any) -> sqlite3.Connection:
        conn = real_connect(*args, **kwargs)
        opened.append(conn)
        return conn

    monkeypatch.setattr(deps, "connect", tracking_connect)

    @app.get("/test-only/db")
    def uses_db(conn: DbDep) -> dict[str, int]:
        return {"fk": conn.execute("PRAGMA foreign_keys").fetchone()[0]}

    with TestClient(app) as client:
        response = client.get("/test-only/db")

    assert response.json() == {"fk": 1}
    assert len(opened) == 1
    with pytest.raises(sqlite3.ProgrammingError, match="closed"):
        opened[0].execute("SELECT 1")
