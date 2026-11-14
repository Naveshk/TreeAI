"""On-disk layout for datasets and model artifacts.

    <data_dir>/
        treeai.db
        tmp/                         in-progress uploads (cleared at startup)
        datasets/<uuid>/data.csv     original uploaded bytes
        datasets/<uuid>/profile.json
        models/<uuid>/model.joblib   (M4)

Every path is built from a validated UUID and checked to stay inside the data directory;
user-supplied filenames are never used in paths.

File/database consistency (no recovery system, by design):
- Create: files are written first (atomically), then the DB rows in one transaction.
  If the DB insert fails, the service deletes the files again.
- Delete: the DB row is deleted first, then the files.
- A crash between those two steps can leave an orphaned directory. Orphans are invisible
  to the API (listings come from the DB) and harmless. A DB row whose files are missing is
  reported as DATASET_FILE_MISSING instead of crashing.
"""

import hashlib
import os
import shutil
import tempfile
import uuid
from pathlib import Path

DATASET_CSV = "data.csv"
DATASET_PROFILE = "profile.json"
MODEL_ARTIFACT = "model.joblib"
_HASH_CHUNK = 1024 * 1024


def new_id() -> str:
    return str(uuid.uuid4())


def is_valid_id(value: str) -> bool:
    """True only for canonical, lowercase UUID strings (e.g. from `new_id`)."""
    try:
        return str(uuid.UUID(value)) == value
    except (ValueError, AttributeError, TypeError):
        return False


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(_HASH_CHUNK), b""):
            digest.update(chunk)
    return digest.hexdigest()


class FileStore:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir.resolve()
        self.datasets_dir = self.data_dir / "datasets"
        self.models_dir = self.data_dir / "models"
        self.tmp_dir = self.data_dir / "tmp"

    # ---- setup -----------------------------------------------------------------------
    def ensure_dirs(self) -> None:
        for directory in (self.data_dir, self.datasets_dir, self.models_dir, self.tmp_dir):
            directory.mkdir(parents=True, exist_ok=True)

    def clear_tmp(self) -> None:
        """Remove leftovers of interrupted uploads. Called at startup."""
        if not self.tmp_dir.exists():
            return
        for entry in self.tmp_dir.iterdir():
            if entry.is_dir() and not entry.is_symlink():
                shutil.rmtree(entry)
            else:
                entry.unlink(missing_ok=True)

    # ---- paths -----------------------------------------------------------------------
    def _inside(self, base: Path, item_id: str) -> Path:
        if not is_valid_id(item_id):
            raise ValueError(f"Invalid id: {item_id!r}")
        path = (base / item_id).resolve()
        if not path.is_relative_to(base.resolve()):
            raise ValueError(f"Path escapes storage directory: {item_id!r}")
        return path

    def dataset_dir(self, dataset_id: str) -> Path:
        return self._inside(self.datasets_dir, dataset_id)

    def dataset_csv_path(self, dataset_id: str) -> Path:
        return self.dataset_dir(dataset_id) / DATASET_CSV

    def dataset_profile_path(self, dataset_id: str) -> Path:
        return self.dataset_dir(dataset_id) / DATASET_PROFILE

    def model_dir(self, model_id: str) -> Path:
        return self._inside(self.models_dir, model_id)

    def model_artifact_path(self, model_id: str) -> Path:
        return self.model_dir(model_id) / MODEL_ARTIFACT

    def relative(self, path: Path) -> str:
        """Path as stored in the database: relative to the data directory, POSIX style."""
        return path.resolve().relative_to(self.data_dir).as_posix()

    def absolute(self, relative_path: str) -> Path:
        path = (self.data_dir / relative_path).resolve()
        if not path.is_relative_to(self.data_dir):
            raise ValueError(f"Path escapes data directory: {relative_path!r}")
        return path

    # ---- temp files ------------------------------------------------------------------
    def new_tmp_file(self, suffix: str = ".part") -> Path:
        """Create an empty, uniquely named file in tmp/ and return its path."""
        self.tmp_dir.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(dir=self.tmp_dir, suffix=suffix)
        os.close(fd)
        return Path(name)

    # ---- writes ----------------------------------------------------------------------
    def write_bytes_atomic(self, path: Path, data: bytes) -> None:
        """Write via a temp file in the same directory + os.replace (never half-written)."""
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_name, path)
        except BaseException:
            Path(tmp_name).unlink(missing_ok=True)
            raise

    def move_into_place(self, src: Path, dest: Path) -> None:
        """Atomically move a finished temp file to its final location."""
        dest.parent.mkdir(parents=True, exist_ok=True)
        os.replace(src, dest)

    # ---- deletes ---------------------------------------------------------------------
    def delete_dataset_files(self, dataset_id: str) -> None:
        shutil.rmtree(self.dataset_dir(dataset_id), ignore_errors=True)

    def delete_model_files(self, model_id: str) -> None:
        shutil.rmtree(self.model_dir(model_id), ignore_errors=True)
