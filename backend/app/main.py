"""FastAPI application factory.

Run locally with:  uv run uvicorn app.main:app --reload --port 8000
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.error_handlers import register_error_handlers
from app.api.routes import datasets, health, samples
from app.api.upload_limit import register_upload_limit
from app.config import Settings, get_settings
from app.storage.database import init_db
from app.storage.files import FileStore

API_PREFIX = "/api"


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the app. Creating it touches no files; disk setup happens at startup."""
    settings = settings or get_settings()
    file_store = FileStore(settings.data_dir)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        file_store.ensure_dirs()
        file_store.clear_tmp()
        init_db(settings.db_path)
        yield

    app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)
    app.state.settings = settings
    app.state.file_store = file_store

    register_error_handlers(app)
    register_upload_limit(app, settings.max_upload_bytes)
    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(datasets.router, prefix=API_PREFIX)
    app.include_router(samples.router, prefix=API_PREFIX)
    return app


app = create_app()
