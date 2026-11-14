"""FastAPI application factory.

Run locally with:  uv run uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI

from app.api.routes import health
from app.config import get_settings

API_PREFIX = "/api"


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=settings.app_version)
    app.include_router(health.router, prefix=API_PREFIX)
    return app


app = create_app()
