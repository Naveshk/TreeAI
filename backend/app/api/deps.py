"""FastAPI dependencies: settings, per-request DB connection, file store."""

import sqlite3
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Request

from app.config import Settings
from app.services.dataset_service import DatasetService
from app.services.inference_service import InferenceService
from app.services.model_service import ModelService
from app.storage.database import connect
from app.storage.files import FileStore
from app.storage.model_store import ModelStore


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


def get_model_store(request: Request) -> ModelStore:
    return request.app.state.model_store


ModelStoreDep = Annotated[ModelStore, Depends(get_model_store)]


def get_model_service(conn: DbDep, files: FileStoreDep, store: ModelStoreDep) -> ModelService:
    return ModelService(conn, files, store)


def get_inference_service(conn: DbDep, store: ModelStoreDep) -> InferenceService:
    return InferenceService(conn, store)


ModelServiceDep = Annotated[ModelService, Depends(get_model_service)]
InferenceServiceDep = Annotated[InferenceService, Depends(get_inference_service)]
