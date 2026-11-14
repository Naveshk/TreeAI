"""Domain exceptions shared by services, ml and storage layers.

This module deliberately has no FastAPI imports so any layer may raise these errors.
`app.api.error_handlers` converts them into the JSON error envelope:

    {"error": {"code": "...", "message": "...", "details": {...}}}
"""

from typing import Any


class AppError(Exception):
    """Base class for expected, client-facing errors."""

    status_code: int = 400

    def __init__(
        self,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
        *,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}
        if status_code is not None:
            self.status_code = status_code


class BadRequestError(AppError):
    status_code = 400


class NotFoundError(AppError):
    status_code = 404


class ConflictError(AppError):
    status_code = 409


class PayloadTooLargeError(AppError):
    status_code = 413


class UnsupportedMediaTypeError(AppError):
    status_code = 415


class UnprocessableError(AppError):
    status_code = 422


class InternalError(AppError):
    """An expected server-side failure with a safe, specific message."""

    status_code = 500
