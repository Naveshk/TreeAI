"""Dataset API: upload pipeline, reads, preview, profile, delete, limits and cleanup."""

import sqlite3
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import APP_NAME, APP_VERSION, Settings
from app.main import create_app
from app.services.dataset_service import DatasetService
from app.storage.database import connect
from app.storage.repositories import DatasetRepository

CSV = b"age,sex,city,survived\n22,male,A,0\n38,female,B,1\n,female,C,1\n35,male,A,0\n35,male,A,0\n"


def upload(client: TestClient, data: bytes = CSV, filename: str = "titanic-mini.csv"):
    return client.post("/api/datasets", files={"file": (filename, data, "text/csv")})


def leftovers(settings: Settings) -> tuple[list[Path], list[Path]]:
    tmp = sorted(settings.tmp_dir.iterdir()) if settings.tmp_dir.exists() else []
    datasets = sorted(settings.datasets_dir.iterdir()) if settings.datasets_dir.exists() else []
    return tmp, datasets


def assert_no_leftovers(settings: Settings) -> None:
    assert leftovers(settings) == ([], [])
    conn = connect(settings.db_path)
    try:
        assert conn.execute("SELECT COUNT(*) FROM datasets").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM dataset_columns").fetchone()[0] == 0
    finally:
        conn.close()


@pytest.fixture
def small_settings(tmp_path: Path) -> Settings:
    return Settings(
        app_name=APP_NAME,
        app_version=APP_VERSION,
        data_dir=tmp_path / "data",
        max_upload_bytes=2048,
        max_rows=5,
        max_columns=4,
    )


@pytest.fixture
def small_client(small_settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(small_settings), raise_server_exceptions=False) as client:
        yield client


# ---- happy path --------------------------------------------------------------------------
def test_upload_returns_detail(client: TestClient, settings: Settings) -> None:
    response = upload(client)

    assert response.status_code == 201
    body = response.json()
    assert uuid.UUID(body["id"])
    assert body["name"] == "titanic-mini"
    assert body["original_filename"] == "titanic-mini.csv"
    assert body["source"] == "upload"
    assert body["file_size_bytes"] == len(CSV)
    assert (body["n_rows"], body["n_cols"]) == (5, 4)
    assert body["duplicate_rows"] == 1
    assert body["total_missing"] == 1
    assert body["detected_encoding"] == "utf-8-sig"
    assert body["detected_delimiter"] == ","
    assert [c["name"] for c in body["columns"]] == ["age", "sex", "city", "survived"]
    assert [c["inferred_kind"] for c in body["columns"]] == [
        "numeric",
        "categorical",
        "categorical",
        "numeric",
    ]
    assert any(w["code"] == "DUPLICATE_ROWS" for w in body["warnings"])

    # The original bytes are stored unchanged, and nothing is left in tmp/.
    stored = settings.datasets_dir / body["id"] / "data.csv"
    assert stored.read_bytes() == CSV
    assert (settings.datasets_dir / body["id"] / "profile.json").is_file()
    assert list(settings.tmp_dir.iterdir()) == []


def test_list_and_get(client: TestClient) -> None:
    first = upload(client, filename="one.csv").json()
    second = upload(client, filename="two.csv").json()

    listed = client.get("/api/datasets").json()
    assert [d["id"] for d in listed] == [second["id"], first["id"]]
    assert "columns" not in listed[0]

    detail = client.get(f"/api/datasets/{first['id']}")
    assert detail.status_code == 200
    assert detail.json() == first


def test_filename_directories_are_stripped(client: TestClient) -> None:
    body = upload(client, filename="C:\\Users\\me\\..\\data.CSV").json()
    assert body["original_filename"] == "data.CSV"
    assert body["name"] == "data"


def test_preview(client: TestClient) -> None:
    dataset_id = upload(client).json()["id"]

    page = client.get(f"/api/datasets/{dataset_id}/preview", params={"limit": 2}).json()
    assert page == {
        "dataset_id": dataset_id,
        "columns": ["age", "sex", "city", "survived"],
        "rows": [["22", "male", "A", "0"], ["38", "female", "B", "1"]],
        "offset": 0,
        "limit": 2,
        "total_rows": 5,
    }

    page = client.get(f"/api/datasets/{dataset_id}/preview?offset=2&limit=2").json()
    assert page["rows"] == [[None, "female", "C", "1"], ["35", "male", "A", "0"]]

    beyond = client.get(f"/api/datasets/{dataset_id}/preview?offset=50").json()
    assert beyond["rows"] == []
    assert beyond["columns"] == ["age", "sex", "city", "survived"]


def test_preview_with_blank_lines_returns_exact_rows(client: TestClient) -> None:
    data = b"id,v\n1,a\n\n2,b\n\n\n3,c\n4,d\n"
    dataset_id = upload(client, data).json()["id"]

    page = client.get(f"/api/datasets/{dataset_id}/preview?offset=1&limit=2").json()

    assert page["rows"] == [["2", "b"], ["3", "c"]]
    assert page["total_rows"] == 4


@pytest.mark.parametrize("query", ["limit=0", "limit=101", "offset=-1", "limit=abc"])
def test_preview_rejects_bad_parameters(client: TestClient, query: str) -> None:
    dataset_id = upload(client).json()["id"]
    response = client.get(f"/api/datasets/{dataset_id}/preview?{query}")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_profile(client: TestClient) -> None:
    dataset_id = upload(client).json()["id"]
    profile = client.get(f"/api/datasets/{dataset_id}/profile").json()

    assert profile["dataset_id"] == dataset_id
    assert profile["n_rows"] == 5
    age = profile["columns"][0]
    assert age["missing_count"] == 1
    assert age["numeric_stats"]["mean"] == pytest.approx((22 + 38 + 35 + 35) / 4)
    survived = profile["columns"][3]
    assert survived["target"]["suggested_task"] == "classification"
    sex = profile["columns"][1]
    assert sex["top_values"] == [
        {"value": "male", "count": 3},
        {"value": "female", "count": 2},
    ]


# ---- not found ----------------------------------------------------------------------------
@pytest.mark.parametrize(
    "path",
    ["", "/preview", "/profile"],
)
@pytest.mark.parametrize(
    "dataset_id",
    ["not-a-uuid", str(uuid.uuid4()).upper(), str(uuid.uuid4())],
)
def test_unknown_or_malformed_id_is_404(client: TestClient, dataset_id: str, path: str) -> None:
    response = client.get(f"/api/datasets/{dataset_id}{path}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "DATASET_NOT_FOUND"


@pytest.mark.parametrize("path", ["", "/preview", "/profile"])
def test_encoded_path_traversal_never_reaches_handler(client: TestClient, path: str) -> None:
    # %2F decodes to "/", so the path no longer matches /datasets/{dataset_id}:
    # the router itself answers with its generic 404 envelope.
    response = client.get(f"/api/datasets/..%2F..%2Fetc{path}")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "NOT_FOUND", "message": "Not Found", "details": {}}
    }


def test_delete_unknown_is_404(client: TestClient) -> None:
    response = client.delete(f"/api/datasets/{uuid.uuid4()}")
    assert response.status_code == 404


# ---- delete -------------------------------------------------------------------------------
def test_delete_removes_rows_files_and_model_files(client: TestClient, settings: Settings) -> None:
    keep = upload(client, filename="keep.csv").json()["id"]
    remove = upload(client, filename="remove.csv").json()["id"]

    # Simulate a model trained on the dataset (model code arrives in M4).
    model_id = str(uuid.uuid4())
    conn = connect(settings.db_path)
    with conn:
        conn.execute(
            """INSERT INTO models (id, dataset_id, name, task_type, target_column,
                   feature_columns_json, column_types_json, hyperparameters_json, test_size,
                   random_state, stratified, status, created_at)
               VALUES (?, ?, 'm', 'classification', 'survived', '[]', '{}', '{}', 0.2, 42, 1,
                       'ready', '2026-11-15T00:00:00+00:00')""",
            (model_id, remove),
        )
    conn.close()
    model_dir = settings.models_dir / model_id
    model_dir.mkdir(parents=True)
    (model_dir / "model.joblib").write_bytes(b"fake")

    response = client.delete(f"/api/datasets/{remove}")

    assert response.status_code == 204
    assert response.content == b""
    assert client.get(f"/api/datasets/{remove}").status_code == 404
    assert not (settings.datasets_dir / remove).exists()
    assert not model_dir.exists()
    conn = connect(settings.db_path)
    try:
        assert conn.execute("SELECT COUNT(*) FROM models").fetchone()[0] == 0
    finally:
        conn.close()
    assert client.get(f"/api/datasets/{keep}").status_code == 200
    assert (settings.datasets_dir / keep / "data.csv").is_file()


# ---- file/database consistency --------------------------------------------------------------
def test_missing_csv_file_is_reported(client: TestClient, settings: Settings) -> None:
    dataset_id = upload(client).json()["id"]
    (settings.datasets_dir / dataset_id / "data.csv").unlink()

    response = client.get(f"/api/datasets/{dataset_id}/preview")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "DATASET_FILE_MISSING"


def test_missing_profile_file_is_reported(client: TestClient, settings: Settings) -> None:
    dataset_id = upload(client).json()["id"]
    (settings.datasets_dir / dataset_id / "profile.json").unlink()

    for path in ("", "/profile"):
        response = client.get(f"/api/datasets/{dataset_id}{path}")
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "DATASET_FILE_MISSING"

    # The broken dataset can still be deleted.
    assert client.delete(f"/api/datasets/{dataset_id}").status_code == 204


def test_orphan_directories_are_invisible(client: TestClient, settings: Settings) -> None:
    (settings.datasets_dir / str(uuid.uuid4())).mkdir()
    assert client.get("/api/datasets").json() == []


# ---- upload validation errors (and temp cleanup after each) ----------------------------------
@pytest.mark.parametrize(
    ("data", "filename", "status", "code"),
    [
        (CSV, "data.txt", 415, "INVALID_FILE_TYPE"),
        (CSV, ".csv", 415, "INVALID_FILE_TYPE"),
        (b"", "data.csv", 400, "EMPTY_FILE"),
        (b"a,b\n", "data.csv", 400, "HEADER_ONLY"),
        (b"\x00\x01binary", "data.csv", 415, "INVALID_FILE_TYPE"),
        (b"a,a\n1,2\n", "data.csv", 400, "DUPLICATE_COLUMNS"),
        (b"a,,c\n1,2,3\n", "data.csv", 400, "BLANK_COLUMN_NAME"),
        (b"only\n1\n", "data.csv", 400, "TOO_FEW_COLUMNS"),
        (b"a,b\n1,2\n3,4,5\n", "data.csv", 400, "PARSE_ERROR"),
    ],
)
def test_upload_validation_errors_leave_nothing_behind(
    client: TestClient, settings: Settings, data: bytes, filename: str, status: int, code: str
) -> None:
    response = upload(client, data, filename)

    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert_no_leftovers(settings)


def test_missing_file_field_is_validation_error(client: TestClient) -> None:
    response = client.post("/api/datasets", data={"not_file": "x"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


# ---- limits ----------------------------------------------------------------------------------
def test_too_many_rows(small_client: TestClient, small_settings: Settings) -> None:
    response = upload(small_client, b"a,b\n" + b"1,2\n" * 6)

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "TOO_MANY_ROWS"
    assert_no_leftovers(small_settings)


def test_too_many_columns(small_client: TestClient, small_settings: Settings) -> None:
    response = upload(small_client, b"a,b,c,d,e\n1,2,3,4,5\n")

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "TOO_MANY_COLUMNS"
    assert_no_leftovers(small_settings)


def test_file_exactly_at_size_limit_is_accepted(small_client: TestClient) -> None:
    data = b"a,b\n" + b"x" * 2041 + b",1\n"
    assert len(data) == 2048

    assert upload(small_client, data).status_code == 201


def test_file_over_limit_rejected_by_actual_byte_count(
    small_client: TestClient, small_settings: Settings
) -> None:
    # 2049 bytes: the multipart Content-Length is below limit + overhead allowance,
    # so the middleware lets it through and the service's byte count rejects it.
    data = b"a,b\n" + b"x" * 2042 + b",1\n"
    assert len(data) == 2049

    response = upload(small_client, data)

    assert response.status_code == 413
    assert response.json()["error"] == {
        "code": "FILE_TOO_LARGE",
        "message": "The file exceeds the upload limit of 2048 bytes.",
        "details": {"max_bytes": 2048},
    }
    assert_no_leftovers(small_settings)


def test_huge_content_length_rejected_before_parsing(
    small_client: TestClient, small_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    def must_not_run(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("upload should have been rejected by the middleware")

    monkeypatch.setattr(DatasetService, "create_from_upload", must_not_run)

    response = upload(small_client, b"a,b\n" + b"1,2\n" * 50_000)  # ~200 KB > 2 KB + 64 KB

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "FILE_TOO_LARGE"
    assert_no_leftovers(small_settings)


def test_oversized_chunked_upload_without_content_length_is_rejected(
    small_client: TestClient, small_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    def must_not_run(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("oversized chunked upload reached the service")

    monkeypatch.setattr(DatasetService, "create_from_upload", must_not_run)
    boundary = "XyZ"
    body = (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="f.csv"\r\n'
            "Content-Type: text/csv\r\n\r\n"
        ).encode()
        + b"a,b\n"
        + b"1,2\n" * 50_000
        + f"\r\n--{boundary}--\r\n".encode()
    )
    # Note: TestClient buffers the iterable before calling the app, so this test checks the
    # rejection itself; early stopping on a real server is verified manually (see README).

    def chunks():
        for i in range(0, len(body), 8192):
            yield body[i : i + 8192]

    response = small_client.post(
        "/api/datasets",
        content=chunks(),
        headers={"content-type": f"multipart/form-data; boundary={boundary}"},
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "FILE_TOO_LARGE"
    assert_no_leftovers(small_settings)


def test_small_chunked_upload_still_works(small_client: TestClient) -> None:
    boundary = "XyZ"
    body = (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="f.csv"\r\n'
            "Content-Type: text/csv\r\n\r\n"
        ).encode()
        + b"a,b\n1,2\n"
        + f"\r\n--{boundary}--\r\n".encode()
    )

    response = small_client.post(
        "/api/datasets",
        content=iter([body[:20], body[20:]]),
        headers={"content-type": f"multipart/form-data; boundary={boundary}"},
    )

    assert response.status_code == 201, response.text


# ---- failures after validation (cleanup of tmp and dataset files) -----------------------------
def test_database_failure_cleans_up_files(
    small_client: TestClient, small_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    def failing_create(*_args: object, **_kwargs: object) -> None:
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(DatasetRepository, "create", failing_create)

    response = upload(small_client, b"a,b\n1,2\n")

    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred.",
            "details": {},
        }
    }
    assert "locked" not in response.text
    assert_no_leftovers(small_settings)


def test_unexpected_profiling_failure_cleans_up(
    small_client: TestClient, small_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken_profile(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("profiling bug")

    monkeypatch.setattr("app.services.dataset_service.profile_dataframe", broken_profile)

    response = upload(small_client, b"a,b\n1,2\n")

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert_no_leftovers(small_settings)


def test_failure_writing_profile_cleans_up(
    small_client: TestClient, small_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    def failing_write(*_args: object, **_kwargs: object) -> None:
        raise OSError("disk full")

    monkeypatch.setattr("app.storage.files.FileStore.write_bytes_atomic", failing_write)

    response = upload(small_client, b"a,b\n1,2\n")

    assert response.status_code == 500
    assert_no_leftovers(small_settings)
