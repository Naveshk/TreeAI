"""Model API: train, evaluate, input schema, predict, trees, explain, errors, delete."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import Settings

IRIS_FEATURES = ["sepal_length_cm", "sepal_width_cm", "petal_length_cm", "petal_width_cm"]
SMALL_HP = {"n_estimators": 12, "max_depth": 5}


def load_sample(client: TestClient, sample_id: str) -> str:
    response = client.post(f"/api/samples/{sample_id}/load")
    assert response.status_code == 201
    return response.json()["id"]


def train(client: TestClient, **body):
    return client.post("/api/models", json=body)


@pytest.fixture
def iris_model(client: TestClient) -> dict:
    dataset_id = load_sample(client, "iris")
    response = train(
        client,
        dataset_id=dataset_id,
        task_type="classification",
        target_column="species",
        feature_columns=IRIS_FEATURES,
        hyperparameters=SMALL_HP,
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def diabetes_model(client: TestClient) -> dict:
    dataset_id = load_sample(client, "diabetes")
    response = train(
        client,
        dataset_id=dataset_id,
        task_type="regression",
        target_column="disease_progression",
        feature_columns=["age", "sex", "bmi", "bp", "s5"],
        column_types={"sex": "categorical"},
        hyperparameters=SMALL_HP,
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_train_classification_returns_detail(iris_model: dict) -> None:
    assert iris_model["status"] == "ready"
    assert iris_model["task_type"] == "classification"
    assert iris_model["classes"] == ["setosa", "versicolor", "virginica"]
    assert iris_model["n_train"] + iris_model["n_test"] == 150
    assert iris_model["n_test"] == 30
    assert iris_model["stratified"] is True
    assert iris_model["hyperparameters"]["criterion"] == "gini"
    assert iris_model["hyperparameters"]["max_features"] == "sqrt"
    assert iris_model["column_types"] == dict.fromkeys(IRIS_FEATURES, "numeric")
    assert iris_model["name"] == "Iris · Random Forest"


def test_classification_evaluation(client: TestClient, iris_model: dict) -> None:
    body = client.get(f"/api/models/{iris_model['id']}/evaluation").json()
    metrics = body["metrics"]

    assert body["split"] == "test"
    assert metrics["task_type"] == "classification"
    assert metrics["n_samples"] == 30
    assert 0 <= metrics["accuracy"] <= 1
    matrix = metrics["confusion_matrix"]["matrix"]
    assert sum(map(sum, matrix)) == 30
    correct = sum(matrix[i][i] for i in range(3))
    assert metrics["accuracy"] == pytest.approx(correct / 30)
    assert [c["support"] for c in metrics["per_class"]] == [10, 10, 10]  # stratified


def test_regression_training_and_evaluation(client: TestClient, diabetes_model: dict) -> None:
    assert diabetes_model["column_types"]["sex"] == "categorical"
    assert diabetes_model["hyperparameters"]["criterion"] == "squared_error"
    assert diabetes_model["hyperparameters"]["max_features"] == 1.0
    assert diabetes_model["classes"] is None
    assert diabetes_model["stratified"] is False

    metrics = client.get(f"/api/models/{diabetes_model['id']}/evaluation").json()["metrics"]
    assert metrics["task_type"] == "regression"
    assert metrics["rmse"] == pytest.approx(metrics["mse"] ** 0.5)
    assert metrics["mae"] > 0


def test_input_schema(client: TestClient, diabetes_model: dict) -> None:
    schema = client.get(f"/api/models/{diabetes_model['id']}/input-schema").json()
    by_name = {f["name"]: f for f in schema["features"]}

    assert schema["target_column"] == "disease_progression"
    assert by_name["sex"]["kind"] == "categorical"
    assert by_name["sex"]["categories"] == ["1", "2"]
    assert by_name["bmi"]["kind"] == "numeric"
    assert (
        by_name["bmi"]["train_min"] <= by_name["bmi"]["train_median"] <= by_name["bmi"]["train_max"]
    )


def test_predict_classification(client: TestClient, iris_model: dict) -> None:
    response = client.post(
        f"/api/models/{iris_model['id']}/predict",
        json={
            "inputs": {
                "sepal_length_cm": 5.1,
                "sepal_width_cm": 3.5,
                "petal_length_cm": 1.4,
                "petal_width_cm": 0.2,
            }
        },
    )
    body = response.json()

    assert response.status_code == 200
    assert body["prediction"] == "setosa"
    assert [p["label"] for p in body["probabilities"]] == ["setosa", "versicolor", "virginica"]
    assert sum(p["probability"] for p in body["probabilities"]) == pytest.approx(1.0)
    assert body["imputed_features"] == []


def test_predict_regression_with_imputation(client: TestClient, diabetes_model: dict) -> None:
    body = client.post(
        f"/api/models/{diabetes_model['id']}/predict",
        json={"inputs": {"age": 50, "sex": 2, "bmi": "", "bp": 90, "s5": 4.5}},
    ).json()

    assert isinstance(body["prediction"], float)
    assert body["probabilities"] is None
    assert body["imputed_features"][0]["feature"] == "bmi"


def test_explain_matches_predict(client: TestClient, iris_model: dict) -> None:
    inputs = {
        "sepal_length_cm": 6.3,
        "sepal_width_cm": 2.8,
        "petal_length_cm": 4.9,
        "petal_width_cm": 1.6,
    }
    predicted = client.post(f"/api/models/{iris_model['id']}/predict", json={"inputs": inputs})
    explained = client.post(f"/api/models/{iris_model['id']}/explain", json={"inputs": inputs})
    p, e = predicted.json(), explained.json()

    assert explained.status_code == 200
    assert e["prediction"] == p["prediction"]
    assert [x["probability"] for x in e["probabilities"]] == pytest.approx(
        [x["probability"] for x in p["probabilities"]]
    )
    assert e["consistent"] is True
    assert len(e["trees"]) == 12
    assert sum(v["count"] for v in e["vote_tally"]) == 12
    first = e["trees"][0]
    assert first["path"][0] == 0 and first["path"][-1] == first["leaf_id"]
    assert len(first["steps"]) == len(first["path"]) - 1
    assert first["steps"][0]["input_value"] is not None


def test_trees_listing_and_structure(client: TestClient, iris_model: dict) -> None:
    listing = client.get(f"/api/models/{iris_model['id']}/trees").json()
    assert listing["n_trees"] == 12
    assert [t["index"] for t in listing["trees"]] == list(range(12))

    tree = client.get(f"/api/models/{iris_model['id']}/trees/3").json()
    assert tree["tree_index"] == 3
    assert tree["criterion"] == "gini"
    assert tree["n_nodes"] == listing["trees"][3]["n_nodes"] == len(tree["nodes"])
    root = tree["nodes"][0]
    assert root["depth"] == 0 and not root["is_leaf"]
    assert root["left_rule"].startswith(root["feature"])

    missing = client.get(f"/api/models/{iris_model['id']}/trees/12")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "TREE_INDEX_OUT_OF_RANGE"


def test_list_and_get_models(client: TestClient, iris_model: dict) -> None:
    listed = client.get("/api/models", params={"dataset_id": iris_model["dataset_id"]}).json()
    assert [m["id"] for m in listed] == [iris_model["id"]]
    assert client.get("/api/models", params={"dataset_id": str(uuid.uuid4())}).json() == []
    assert client.get(f"/api/models/{iris_model['id']}").json() == iris_model


@pytest.mark.parametrize(
    ("override", "code", "status"),
    [
        ({"target_column": "petal_width_cm"}, "TARGET_IN_FEATURES", 422),
        ({"feature_columns": ["nope"]}, "UNKNOWN_COLUMN", 422),
        ({"feature_columns": ["sepal_length_cm", "sepal_length_cm"]}, "DUPLICATE_FEATURES", 422),
        ({"column_types": {"species": "categorical"}}, "INVALID_COLUMN_TYPES", 422),
        ({"task_type": "regression"}, "REGRESSION_TARGET_NOT_NUMERIC", 422),
        ({"hyperparameters": {"criterion": "squared_error"}}, "INVALID_HYPERPARAMETER", 422),
        ({"hyperparameters": {"max_features": 1.5}}, "INVALID_HYPERPARAMETER", 422),
        # Regression: falsy values must be rejected, not replaced by the defaults.
        ({"hyperparameters": {"criterion": ""}}, "INVALID_HYPERPARAMETER", 422),
        ({"hyperparameters": {"max_features": 0}}, "INVALID_HYPERPARAMETER", 422),
        ({"hyperparameters": {"max_features": 0.0}}, "INVALID_HYPERPARAMETER", 422),
        (
            {
                "task_type": "regression",
                "target_column": "petal_width_cm",
                "feature_columns": IRIS_FEATURES[:3],
                "hyperparameters": {"criterion": ""},
            },
            "INVALID_HYPERPARAMETER",
            422,
        ),
        ({"hyperparameters": {"n_estimators": 501}}, "VALIDATION_ERROR", 422),
        ({"test_size": 0.9}, "VALIDATION_ERROR", 422),
        ({"feature_columns": []}, "VALIDATION_ERROR", 422),
        ({"dataset_id": str(uuid.uuid4())}, "DATASET_NOT_FOUND", 404),
    ],
)
def test_training_validation_errors(
    client: TestClient, override: dict, code: str, status: int
) -> None:
    body = {
        "dataset_id": load_sample(client, "iris"),
        "task_type": "classification",
        "target_column": "species",
        "feature_columns": IRIS_FEATURES,
        "hyperparameters": SMALL_HP,
    }
    body.update(override)
    response = train(client, **body)

    assert response.status_code == status, response.text
    assert response.json()["error"]["code"] == code
    assert client.get("/api/models").json() == []  # nothing persisted


def test_unsupported_feature_and_target_kinds(client: TestClient) -> None:
    csv = "id,when,y,x\n" + "".join(
        f"{i},2026-01-{(i % 28) + 1:02d},{i % 2},{i * 0.5}\n" for i in range(1, 41)
    )
    dataset_id = client.post(
        "/api/datasets", files={"file": ("d.csv", csv.encode(), "text/csv")}
    ).json()["id"]
    base = {"dataset_id": dataset_id, "task_type": "classification", "hyperparameters": SMALL_HP}

    r = train(client, **base, target_column="y", feature_columns=["x", "id"])
    assert r.json()["error"]["code"] == "FEATURE_NOT_SUPPORTED"
    r = train(client, **base, target_column="y", feature_columns=["when"])
    assert r.json()["error"]["code"] == "FEATURE_NOT_SUPPORTED"
    r = train(client, **base, target_column="id", feature_columns=["x"])
    assert r.json()["error"]["code"] == "INVALID_TARGET"


def test_prediction_input_errors(client: TestClient, iris_model: dict) -> None:
    url = f"/api/models/{iris_model['id']}/predict"
    r = client.post(url, json={"inputs": {"color": "red"}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNKNOWN_FEATURE"
    r = client.post(url, json={"inputs": {"sepal_length_cm": "tall"}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_NUMBER"
    r = client.post(url, json={"inputs": {"sepal_length_cm": [1]}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"


def test_unknown_category_lists_allowed_values(client: TestClient, diabetes_model: dict) -> None:
    r = client.post(f"/api/models/{diabetes_model['id']}/explain", json={"inputs": {"sex": "3"}})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "UNKNOWN_CATEGORY"
    assert r.json()["error"]["details"]["allowed"] == ["1", "2"]


@pytest.mark.parametrize("path", ["", "/evaluation", "/input-schema", "/trees", "/trees/0"])
def test_unknown_model_is_404(client: TestClient, path: str) -> None:
    for model_id in ("nope", str(uuid.uuid4())):
        r = client.get(f"/api/models/{model_id}{path}")
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "MODEL_NOT_FOUND"


def test_delete_model(client: TestClient, settings: Settings, iris_model: dict) -> None:
    model_dir = settings.models_dir / iris_model["id"]
    assert (model_dir / "model.joblib").is_file()

    assert client.delete(f"/api/models/{iris_model['id']}").status_code == 204
    assert not model_dir.exists()
    assert client.get(f"/api/models/{iris_model['id']}").status_code == 404
    assert client.delete(f"/api/models/{iris_model['id']}").status_code == 404


def test_deleting_dataset_removes_its_models(
    client: TestClient, settings: Settings, iris_model: dict
) -> None:
    assert client.delete(f"/api/datasets/{iris_model['dataset_id']}").status_code == 204
    assert client.get(f"/api/models/{iris_model['id']}").status_code == 404
    assert not (settings.models_dir / iris_model["id"]).exists()


def test_tampered_artifact_is_rejected(
    client: TestClient, settings: Settings, iris_model: dict
) -> None:
    client.app.state.model_store.evict(iris_model["id"])
    path = settings.models_dir / iris_model["id"] / "model.joblib"
    path.write_bytes(path.read_bytes() + b"tampered")

    r = client.get(f"/api/models/{iris_model['id']}/trees")
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "MODEL_INTEGRITY_FAILED"


def test_failed_model_is_not_ready(client: TestClient, iris_model: dict) -> None:
    from app.storage.database import connect

    conn = connect(client.app.state.settings.db_path)
    with conn:
        conn.execute("UPDATE models SET status = 'failed' WHERE id = ?", (iris_model["id"],))
    conn.close()

    r = client.post(f"/api/models/{iris_model['id']}/predict", json={"inputs": {}})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "MODEL_NOT_READY"
