"""FastAPI dependencies: settings, per-request DB connection, file store."""

import sqlite3
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request

from app.config import Settings
from app.services.dataset_service import DatasetService
from app.storage.database import connect
from app.storage.files import FileStore


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def get_file_store(request: Request) -> FileStore:
    return request.app.state.file_store


def get_db(
    settings: Annotated[Settings, Depends(get_settings_dep)],
) -> Iterator[sqlite3.Connection]:
    """One connection per request, always closed afterwards."""
    conn = connect(settings.db_path)
    try:
        yield conn
    finally:
        conn.close()


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
FileStoreDep = Annotated[FileStore, Depends(get_file_store)]
DbDep = Annotated[sqlite3.Connection, Depends(get_db)]


def get_dataset_service(conn: DbDep, files: FileStoreDep, settings: SettingsDep) -> DatasetService:
    return DatasetService(conn, files, settings)


DatasetServiceDep = Annotated[DatasetService, Depends(get_dataset_service)]
