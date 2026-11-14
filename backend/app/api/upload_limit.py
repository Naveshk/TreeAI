"""Reject oversized upload request bodies while they stream in.

FastAPI/Starlette read the whole multipart body before an endpoint runs, so the limit is
enforced here, at the ASGI level, for POST /api/datasets:

1. Conservative early check: a `Content-Length` larger than the file limit plus an
   allowance for multipart overhead (boundaries, part headers) is rejected immediately.
2. Streaming check: body bytes are counted as they arrive (this also covers chunked
   uploads without `Content-Length`). Once the count exceeds the same threshold, no more
   data is read, the app is told the client disconnected, and a 413 envelope is returned.

The exact per-file limit is still enforced on the uploaded file's own byte count in
DatasetService (the multipart body is always slightly larger than the file).
"""

from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.error_handlers import error_response
from app.services.dataset_service import file_too_large

MULTIPART_OVERHEAD_BYTES = 64 * 1024
UPLOAD_PATHS = frozenset({"/api/datasets"})


class UploadLimitMiddleware:
    def __init__(self, app: ASGIApp, max_upload_bytes: int) -> None:
        self.app = app
        self.max_upload_bytes = max_upload_bytes
        self.threshold = max_upload_bytes + MULTIPART_OVERHEAD_BYTES

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        exc = file_too_large(self.max_upload_bytes)
        response = error_response(exc.status_code, exc.code, exc.message, exc.details)
        await response(scope, receive, send)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if (
            scope["type"] != "http"
            or scope["method"] != "POST"
            or scope["path"] not in UPLOAD_PATHS
        ):
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        declared = headers.get("content-length", "")
        if declared.isdigit() and int(declared) > self.threshold:
            await self._reject(scope, receive, send)
            return

        state: dict[str, Any] = {"received": 0, "exceeded": False, "responded": False}

        async def guarded_receive() -> Message:
            if state["exceeded"]:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                state["received"] += len(message.get("body", b""))
                if state["received"] > self.threshold:
                    state["exceeded"] = True
                    return {"type": "http.disconnect"}
            return message

        async def guarded_send(message: Message) -> None:
            if state["exceeded"]:
                return  # the app's reaction to the "disconnect" is replaced by our 413
            state["responded"] = True
            await send(message)

        try:
            await self.app(scope, guarded_receive, guarded_send)
        except Exception:
            if not state["exceeded"]:
                raise
        if state["exceeded"] and not state["responded"]:
            await self._reject(scope, receive, send)
