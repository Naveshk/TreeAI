from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import APP_NAME, APP_VERSION, Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Settings pointing at an isolated temporary data directory (never the real data/)."""
    return Settings(app_name=APP_NAME, app_version=APP_VERSION, data_dir=tmp_path / "data")


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    # Using the client as a context manager runs the lifespan (dirs + DB init).
    with TestClient(app) as test_client:
        yield test_client
