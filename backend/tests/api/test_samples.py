"""Sample datasets: listing, loading through the shared ingestion pipeline."""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.services.dataset_service import DatasetService

EXPECTED = {
    "iris": {"rows": 150, "cols": 5, "target": "species", "task": "classification"},
    "wine": {"rows": 178, "cols": 14, "target": "wine_class", "task": "classification"},
    "diabetes": {"rows": 442, "cols": 11, "target": "disease_progression", "task": "regression"},
}


def test_list_samples(client: TestClient) -> None:
    samples = client.get("/api/samples").json()

    assert [s["id"] for s in samples] == ["iris", "wine", "diabetes"]
    for sample in samples:
        assert set(sample) == {"id", "name", "description", "task_type", "target_column"}
        assert sample["task_type"] == EXPECTED[sample["id"]]["task"]
        assert sample["target_column"] == EXPECTED[sample["id"]]["target"]


@pytest.mark.parametrize("sample_id", ["iris", "wine", "diabetes"])
def test_load_sample(client: TestClient, settings: Settings, sample_id: str) -> None:
    expected = EXPECTED[sample_id]

    response = client.post(f"/api/samples/{sample_id}/load")

    assert response.status_code == 201
    body = response.json()
    assert body["source"] == "sample"
    assert body["original_filename"] == f"{sample_id}.csv"
    assert (body["n_rows"], body["n_cols"]) == (expected["rows"], expected["cols"])
    assert list(settings.tmp_dir.iterdir()) == []

    profile = client.get(f"/api/datasets/{body['id']}/profile").json()
    target = next(c for c in profile["columns"] if c["name"] == expected["target"])
    assert target["target"]["suggested_task"] == expected["task"]
    features = [c for c in profile["columns"] if c["name"] != expected["target"]]
    assert all(c["inferred_kind"] == "numeric" for c in features)
    assert profile["total_missing"] == 0


def test_loading_a_sample_twice_creates_two_datasets(client: TestClient) -> None:
    first = client.post("/api/samples/iris/load").json()["id"]
    second = client.post("/api/samples/iris/load").json()["id"]

    assert first != second
    assert len(client.get("/api/datasets").json()) == 2


def test_unknown_sample_is_404(client: TestClient, settings: Settings) -> None:
    response = client.post("/api/samples/titanic/load")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "SAMPLE_NOT_FOUND"
    assert list(settings.tmp_dir.iterdir()) == []


def test_samples_and_uploads_share_one_ingestion_pipeline(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[tuple[str, str]] = []
    real_ingest = DatasetService._ingest_tmp_file

    def spy(self: DatasetService, tmp_path: Path, original: str, name: str, source: str) -> Any:
        calls.append((original, source))
        return real_ingest(self, tmp_path, original, name, source)

    monkeypatch.setattr(DatasetService, "_ingest_tmp_file", spy)

    client.post("/api/samples/wine/load")
    client.post("/api/datasets", files={"file": ("mine.csv", b"a,b\n1,2\n", "text/csv")})

    assert calls == [("wine.csv", "sample"), ("mine.csv", "upload")]


def test_failed_sample_ingestion_cleans_up(
    client: TestClient, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "app.services.dataset_service.profile_dataframe",
        lambda *_: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    with pytest.raises(RuntimeError, match="boom"):
        client.post("/api/samples/iris/load")

    assert list(settings.tmp_dir.iterdir()) == []
    assert list(settings.datasets_dir.iterdir()) == []
