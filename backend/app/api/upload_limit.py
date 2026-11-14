"""Conservative early rejection of oversized uploads.

FastAPI/Starlette read the whole multipart body before any endpoint or dependency runs,
so this check must happen in middleware. The multipart Content-Length covers the entire
request body (boundaries, part headers, other fields), not just the CSV, so it is only
compared against the file limit PLUS an overhead allowance. The real limit is enforced
on the uploaded file's own byte count in DatasetService.
"""

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response

from app.api.error_handlers import error_response
from app.services.dataset_service import file_too_large

MULTIPART_OVERHEAD_BYTES = 64 * 1024
UPLOAD_PATHS = frozenset({"/api/datasets"})


def register_upload_limit(app: FastAPI, max_upload_bytes: int) -> None:
    threshold = max_upload_bytes + MULTIPART_OVERHEAD_BYTES

    @app.middleware("http")
    async def reject_oversized_uploads(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.method == "POST" and request.url.path in UPLOAD_PATHS:
            raw = request.headers.get("content-length", "")
            if raw.isdigit() and int(raw) > threshold:
                exc = file_too_large(max_upload_bytes)
                return error_response(exc.status_code, exc.code, exc.message, exc.details)
        return await call_next(request)
