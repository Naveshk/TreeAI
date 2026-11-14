"""The JSON error envelope for every kind of failure."""

import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.error_handlers import INTERNAL_ERROR_MESSAGE, register_error_handlers
from app.errors import (
    AppError,
    BadRequestError,
    ConflictError,
    InternalError,
    NotFoundError,
    PayloadTooLargeError,
    UnprocessableError,
    UnsupportedMediaTypeError,
)

SECRET = "secret-detail /home/someone/private/path"


def _make_app() -> FastAPI:
    app = FastAPI()
    register_error_handlers(app)

    errors: dict[str, AppError] = {
        "bad": BadRequestError("PARSE_ERROR", "Bad CSV.", {"line": 3}),
        "missing": NotFoundError("DATASET_NOT_FOUND", "No such dataset."),
        "conflict": ConflictError("MODEL_NOT_READY", "Not ready."),
        "large": PayloadTooLargeError("FILE_TOO_LARGE", "Too big."),
        "media": UnsupportedMediaTypeError("INVALID_FILE_TYPE", "Not a CSV."),
        "unprocessable": UnprocessableError("INVALID_TARGET", "Bad target."),
        "internal": InternalError("DATASET_FILE_MISSING", "Files missing."),
    }

    @app.get("/raise/{name}")
    def raise_app_error(name: str) -> None:
        raise errors[name]

    @app.get("/items/{item_id}")
    def get_item(item_id: int) -> dict[str, int]:
        return {"item_id": item_id}

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError(SECRET)

    return app


@pytest.fixture
def client() -> TestClient:
    return TestClient(_make_app(), raise_server_exceptions=False)


@pytest.mark.parametrize(
    ("name", "status", "code", "message", "details"),
    [
        ("bad", 400, "PARSE_ERROR", "Bad CSV.", {"line": 3}),
        ("missing", 404, "DATASET_NOT_FOUND", "No such dataset.", {}),
        ("conflict", 409, "MODEL_NOT_READY", "Not ready.", {}),
        ("large", 413, "FILE_TOO_LARGE", "Too big.", {}),
        ("media", 415, "INVALID_FILE_TYPE", "Not a CSV.", {}),
        ("unprocessable", 422, "INVALID_TARGET", "Bad target.", {}),
        ("internal", 500, "DATASET_FILE_MISSING", "Files missing.", {}),
    ],
)
def test_app_errors_use_envelope(
    client: TestClient, name: str, status: int, code: str, message: str, details: dict
) -> None:
    response = client.get(f"/raise/{name}")

    assert response.status_code == status
    assert response.json() == {"error": {"code": code, "message": message, "details": details}}


def test_request_validation_error_envelope(client: TestClient) -> None:
    response = client.get("/items/not-a-number")

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["message"] == "Request validation failed."
    errors = body["error"]["details"]["errors"]
    assert len(errors) == 1
    assert set(errors[0]) == {"loc", "msg", "type"}
    assert errors[0]["loc"] == ["path", "item_id"]
    # Raw user input must not be echoed back.
    assert "not-a-number" not in response.text


def test_unknown_route_envelope(client: TestClient) -> None:
    response = client.get("/nope")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
    assert set(response.json()["error"]) == {"code", "message", "details"}


def test_method_not_allowed_envelope(client: TestClient) -> None:
    response = client.post("/boom")

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


def test_unhandled_exception_returns_generic_500_without_leaking(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR, logger="treeai.errors"):
        response = client.get("/boom")

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_ERROR", "message": INTERNAL_ERROR_MESSAGE, "details": {}}
    }
    assert "secret-detail" not in response.text
    assert "/home/someone" not in response.text
    assert "Traceback" not in response.text
    assert "RuntimeError" not in response.text
    # The full error is still logged server-side for debugging.
    assert any(SECRET in str(record.exc_info[1]) for record in caplog.records if record.exc_info)
