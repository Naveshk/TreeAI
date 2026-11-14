"""Save and load trained model artifacts (joblib) with integrity checks and an LRU cache.

Only artifacts written by this server are ever loaded: the SHA-256 recorded in the DB at
save time is verified before `joblib.load`, and the scikit-learn version must match.
"""

import os
import tempfile
import threading
from collections import OrderedDict
from typing import Any

import joblib
import sklearn

from app.errors import ConflictError, InternalError
from app.storage.files import FileStore, sha256_file

ARTIFACT_FORMAT_VERSION = 1


class ModelStore:
    def __init__(self, files: FileStore, cache_size: int = 3) -> None:
        self._files = files
        self._cache: OrderedDict[str, dict[str, Any]] = OrderedDict()
        self._cache_size = cache_size
        self._lock = threading.Lock()

    def save(self, model_id: str, artifact: dict[str, Any]) -> tuple[str, str]:
        """Write atomically; return (relative path, sha256)."""
        path = self._files.model_artifact_path(model_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=".model.", suffix=".tmp")
        os.close(fd)
        try:
            joblib.dump({**artifact, "format_version": ARTIFACT_FORMAT_VERSION}, tmp_name)
            os.replace(tmp_name, path)
        except BaseException:
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)
            raise
        return self._files.relative(path), sha256_file(path)

    def load(self, model_id: str, sha256: str, sklearn_version: str) -> dict[str, Any]:
        with self._lock:
            if model_id in self._cache:
                self._cache.move_to_end(model_id)
                return self._cache[model_id]

        if sklearn_version != sklearn.__version__:
            raise ConflictError(
                "MODEL_INCOMPATIBLE",
                f"This model was trained with scikit-learn {sklearn_version}, but the server "
                f"runs {sklearn.__version__}. Please train the model again.",
                {"trained_with": sklearn_version, "server": sklearn.__version__},
            )
        path = self._files.model_artifact_path(model_id)
        if not path.is_file():
            raise InternalError(
                "MODEL_FILE_MISSING",
                "The saved model file is missing. Please delete the model and train it again.",
                {"model_id": model_id},
            )
        if sha256_file(path) != sha256:
            raise InternalError(
                "MODEL_INTEGRITY_FAILED",
                "The saved model file failed its integrity check. Please train it again.",
                {"model_id": model_id},
            )
        artifact = joblib.load(path)

        with self._lock:
            self._cache[model_id] = artifact
            self._cache.move_to_end(model_id)
            while len(self._cache) > self._cache_size:
                self._cache.popitem(last=False)
        return artifact

    def evict(self, model_id: str) -> None:
        with self._lock:
            self._cache.pop(model_id, None)
