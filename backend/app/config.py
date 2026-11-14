"""Application settings, read from environment variables with safe defaults."""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

APP_NAME = "TreeAI"
APP_VERSION = "0.1.0"

# backend/app/config.py -> repository root is two levels above backend/
_REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_version: str
    data_dir: Path


@lru_cache
def get_settings() -> Settings:
    """Return process-wide settings. Cached so env vars are read once."""
    return Settings(
        app_name=APP_NAME,
        app_version=APP_VERSION,
        data_dir=Path(os.environ.get("TREEAI_DATA_DIR", _REPO_ROOT / "data")).resolve(),
    )
