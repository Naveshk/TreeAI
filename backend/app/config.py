"""Application settings, read from environment variables with safe defaults."""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

APP_NAME = "TreeAI"
APP_VERSION = "0.1.0"

# backend/app/config.py -> repository root is two levels above backend/
_REPO_ROOT = Path(__file__).resolve().parents[2]

DEFAULT_MAX_UPLOAD_MB = 50
DEFAULT_MAX_ROWS = 200_000
DEFAULT_MAX_COLUMNS = 500


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_version: str
    data_dir: Path
    max_upload_bytes: int = DEFAULT_MAX_UPLOAD_MB * 1024 * 1024
    max_rows: int = DEFAULT_MAX_ROWS
    max_columns: int = DEFAULT_MAX_COLUMNS

    @property
    def db_path(self) -> Path:
        return self.data_dir / "treeai.db"

    @property
    def datasets_dir(self) -> Path:
        return self.data_dir / "datasets"

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def tmp_dir(self) -> Path:
        return self.data_dir / "tmp"


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    value = int(raw)
    if value <= 0:
        raise ValueError(f"{name} must be a positive integer, got {raw!r}")
    return value


@lru_cache
def get_settings() -> Settings:
    """Return process-wide settings. Cached so env vars are read once."""
    return Settings(
        app_name=APP_NAME,
        app_version=APP_VERSION,
        data_dir=Path(os.environ.get("TREEAI_DATA_DIR", _REPO_ROOT / "data")).resolve(),
        max_upload_bytes=_env_int("TREEAI_MAX_UPLOAD_MB", DEFAULT_MAX_UPLOAD_MB) * 1024 * 1024,
        max_rows=_env_int("TREEAI_MAX_ROWS", DEFAULT_MAX_ROWS),
        max_columns=_env_int("TREEAI_MAX_COLUMNS", DEFAULT_MAX_COLUMNS),
    )
