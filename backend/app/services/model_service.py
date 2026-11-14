"""Model use cases: validate a training request, train, store, read and delete models."""

import sqlite3
from datetime import UTC, datetime
from typing import Any

from app.errors import AppError, ConflictError, InternalError, NotFoundError, UnprocessableError
from app.ml.csv_loader import CsvFormat, load_dataset_frame
from app.ml.preprocessing import FeatureSpec
from app.ml.training import TrainingConfig, train_random_forest
from app.schemas.model import (
    CLASSIFICATION_CRITERIA,
    REGRESSION_CRITERIA,
    EvaluationResponse,
    InputSchemaResponse,
    ModelDetail,
    ModelSummary,
    TrainRequest,
)
from app.storage.files import FileStore, is_valid_id, new_id
from app.storage.model_store import ModelStore
from app.storage.records import ColumnRecord, DatasetRecord, ModelRecord
from app.storage.repositories import DatasetRepository, ModelRepository

UNSUPPORTED_FEATURE_KINDS = {
    "id_like": "looks like an identifier",
    "constant": "has at most one distinct value",
    "datetime": "is a date/time column (not supported as a feature)",
    "text": "is free text with too many distinct values",
}
UNSUPPORTED_TARGET_KINDS = UNSUPPORTED_FEATURE_KINDS


def model_not_found(model_id: str) -> NotFoundError:
    return NotFoundError("MODEL_NOT_FOUND", "Model not found.", {"model_id": model_id})


def get_model_record(repo: ModelRepository, model_id: str) -> ModelRecord:
    if not is_valid_id(model_id):
        raise model_not_found(model_id)
    record = repo.get(model_id)
    if record is None:
        raise model_not_found(model_id)
    return record


def require_ready(record: ModelRecord) -> None:
    if record.status != "ready":
        raise ConflictError(
            "MODEL_NOT_READY",
            "This model is not ready (training failed or is still running).",
            {"model_id": record.id, "status": record.status},
        )


def to_summary(record: ModelRecord) -> ModelSummary:
    return ModelSummary(
        id=record.id,
        dataset_id=record.dataset_id,
        name=record.name,
        task_type=record.task_type,  # type: ignore[arg-type]
        target_column=record.target_column,
        feature_columns=record.feature_columns,
        status=record.status,  # type: ignore[arg-type]
        error_message=record.error_message,
        n_train=record.n_train,
        n_test=record.n_test,
        train_duration_ms=record.train_duration_ms,
        created_at=record.created_at,
    )


def to_detail(record: ModelRecord) -> ModelDetail:
    return ModelDetail(
        **to_summary(record).model_dump(),
        column_types=record.column_types,  # type: ignore[arg-type]
        hyperparameters=record.hyperparameters,
        test_size=record.test_size,
        random_state=record.random_state,
        stratified=record.stratified,
        classes=record.classes,
        rows_dropped_missing_target=record.rows_dropped_missing_target,
        sklearn_version=record.sklearn_version,
    )


def resolve_hyperparameters(request: TrainRequest) -> dict[str, Any]:
    hp = request.hyperparameters
    classification = request.task_type == "classification"
    allowed = CLASSIFICATION_CRITERIA if classification else REGRESSION_CRITERIA
    # Explicit None checks: only an omitted/null value means "use the default"; invalid
    # values such as "" or 0 must be rejected, not silently replaced.
    criterion = hp.criterion if hp.criterion is not None else allowed[0]
    if criterion not in allowed:
        raise UnprocessableError(
            "INVALID_HYPERPARAMETER",
            f"Criterion '{criterion}' is not valid for {request.task_type}. "
            f"Use one of: {', '.join(allowed)}.",
            {"parameter": "criterion", "allowed": list(allowed)},
        )
    max_features: str | float = (
        hp.max_features if hp.max_features is not None else ("sqrt" if classification else 1.0)
    )
    if isinstance(max_features, float) and not (0 < max_features <= 1):
        raise UnprocessableError(
            "INVALID_HYPERPARAMETER",
            "max_features must be 'sqrt', 'log2' or a fraction in (0, 1].",
            {"parameter": "max_features"},
        )
    return {
        "n_estimators": hp.n_estimators,
        "max_depth": hp.max_depth,
        "min_samples_split": hp.min_samples_split,
        "min_samples_leaf": hp.min_samples_leaf,
        "max_features": max_features,
        "bootstrap": hp.bootstrap,
        "criterion": criterion,
    }


def resolve_columns(
    request: TrainRequest, columns: dict[str, ColumnRecord]
) -> tuple[list[FeatureSpec], dict[str, str]]:
    """Validate target/features (leakage, kinds, overrides) and resolve feature kinds."""
    features = request.feature_columns
    if len(set(features)) != len(features):
        raise UnprocessableError("DUPLICATE_FEATURES", "Each feature may be selected only once.")
    missing = [c for c in [request.target_column, *features] if c not in columns]
    if missing:
        raise UnprocessableError(
            "UNKNOWN_COLUMN",
            f"Unknown column(s): {', '.join(missing)}.",
            {"columns": missing},
        )
    if request.target_column in features:
        raise UnprocessableError(
            "TARGET_IN_FEATURES",
            "The target column cannot also be a feature (that would leak the answer).",
            {"target": request.target_column},
        )
    extra = sorted(set(request.column_types) - set(features))
    if extra:
        raise UnprocessableError(
            "INVALID_COLUMN_TYPES",
            f"Type overrides given for non-feature column(s): {', '.join(extra)}.",
            {"columns": extra},
        )

    target_kind = columns[request.target_column].inferred_kind
    if target_kind in UNSUPPORTED_TARGET_KINDS:
        raise UnprocessableError(
            "INVALID_TARGET",
            f"'{request.target_column}' cannot be the target: it "
            f"{UNSUPPORTED_TARGET_KINDS[target_kind]}.",
            {"target": request.target_column, "kind": target_kind},
        )
    if request.task_type == "regression" and target_kind != "numeric":
        raise UnprocessableError(
            "REGRESSION_TARGET_NOT_NUMERIC",
            f"Regression needs a numeric target; '{request.target_column}' is {target_kind}.",
            {"target": request.target_column, "kind": target_kind},
        )

    specs: list[FeatureSpec] = []
    resolved: dict[str, str] = {}
    for name in features:
        inferred = columns[name].inferred_kind
        if inferred in UNSUPPORTED_FEATURE_KINDS:
            raise UnprocessableError(
                "FEATURE_NOT_SUPPORTED",
                f"'{name}' cannot be used as a feature: it {UNSUPPORTED_FEATURE_KINDS[inferred]}.",
                {"feature": name, "kind": inferred},
            )
        default = "numeric" if inferred == "numeric" else "categorical"
        kind = request.column_types.get(name, default)
        if kind == "numeric" and inferred != "numeric":
            raise UnprocessableError(
                "INVALID_COLUMN_TYPES",
                f"'{name}' is {inferred} and cannot be treated as numeric.",
                {"feature": name, "kind": inferred},
            )
        specs.append(FeatureSpec(name, kind))  # type: ignore[arg-type]
        resolved[name] = kind
    return specs, resolved


class ModelService:
    def __init__(self, conn: sqlite3.Connection, files: FileStore, store: ModelStore) -> None:
        self._models = ModelRepository(conn)
        self._datasets = DatasetRepository(conn)
        self._files = files
        self._store = store

    # ---- training ----------------------------------------------------------------------
    def train(self, request: TrainRequest) -> ModelDetail:
        dataset = self._get_dataset(request.dataset_id)
        columns = {c.name: c for c in self._datasets.get_columns(dataset.id)}
        specs, column_types = resolve_columns(request, columns)
        hyperparameters = resolve_hyperparameters(request)
        frame = self._load_frame(dataset)

        model_id = new_id()
        created_at = datetime.now(UTC).isoformat()
        stratified = request.task_type == "classification" and request.stratify
        self._models.create(
            ModelRecord(
                id=model_id,
                dataset_id=dataset.id,
                name=(request.name or "").strip() or f"{dataset.name} · Random Forest",
                task_type=request.task_type,
                target_column=request.target_column,
                feature_columns=list(request.feature_columns),
                column_types=column_types,
                hyperparameters=hyperparameters,
                test_size=request.test_size,
                random_state=request.random_state,
                stratified=stratified,
                status="training",
                created_at=created_at,
            )
        )
        try:
            trained = train_random_forest(
                frame,
                TrainingConfig(
                    task_type=request.task_type,
                    target=request.target_column,
                    features=specs,
                    test_size=request.test_size,
                    random_state=request.random_state,
                    stratify=stratified,
                    hyperparameters=hyperparameters,
                ),
            )
            artifact_path, sha256 = self._store.save(
                model_id,
                {
                    "pipeline": trained.pipeline,
                    "input_schema": trained.input_schema,
                    "task_type": request.task_type,
                    "classes": trained.classes,
                },
            )
            self._models.mark_ready(
                model_id,
                {
                    "classes": trained.classes,
                    "input_schema": trained.input_schema,
                    "n_train": trained.n_train,
                    "n_test": trained.n_test,
                    "rows_dropped_missing_target": trained.rows_dropped_missing_target,
                    "artifact_path": artifact_path,
                    "artifact_sha256": sha256,
                    "sklearn_version": trained.sklearn_version,
                    "train_duration_ms": trained.train_duration_ms,
                },
                trained.metrics,
                datetime.now(UTC).isoformat(),
            )
        except AppError:
            # A data problem (e.g. split impossible): nothing worth keeping.
            self._files.delete_model_files(model_id)
            self._models.delete(model_id)
            raise
        except Exception:
            self._files.delete_model_files(model_id)
            self._models.mark_failed(model_id, "Training failed unexpectedly.")
            raise
        return self.get_model(model_id)

    # ---- reads -------------------------------------------------------------------------
    def list_models(self, dataset_id: str | None) -> list[ModelSummary]:
        return [to_summary(r) for r in self._models.list_all(dataset_id)]

    def get_model(self, model_id: str) -> ModelDetail:
        return to_detail(get_model_record(self._models, model_id))

    def get_evaluation(self, model_id: str) -> EvaluationResponse:
        record = get_model_record(self._models, model_id)
        require_ready(record)
        metrics = self._models.get_evaluation(record.id)
        if metrics is None:
            raise InternalError("EVALUATION_MISSING", "The evaluation for this model is missing.")
        return EvaluationResponse(model_id=record.id, metrics=metrics)  # type: ignore[arg-type]

    def get_input_schema(self, model_id: str) -> InputSchemaResponse:
        record = get_model_record(self._models, model_id)
        require_ready(record)
        return InputSchemaResponse(
            model_id=record.id,
            task_type=record.task_type,  # type: ignore[arg-type]
            target_column=record.target_column,
            classes=record.classes,
            features=record.input_schema or [],  # type: ignore[arg-type]
        )

    # ---- delete ------------------------------------------------------------------------
    def delete_model(self, model_id: str) -> None:
        record = get_model_record(self._models, model_id)
        self._models.delete(record.id)
        self._files.delete_model_files(record.id)
        self._store.evict(record.id)

    # ---- helpers -----------------------------------------------------------------------
    def _get_dataset(self, dataset_id: str) -> DatasetRecord:
        record = self._datasets.get(dataset_id) if is_valid_id(dataset_id) else None
        if record is None:
            raise NotFoundError(
                "DATASET_NOT_FOUND", "Dataset not found.", {"dataset_id": dataset_id}
            )
        return record

    def _load_frame(self, dataset: DatasetRecord):  # noqa: ANN202 - pandas DataFrame
        path = self._files.absolute(dataset.file_path)
        if not path.is_file():
            raise InternalError(
                "DATASET_FILE_MISSING",
                "The files for this dataset are missing. Please delete it and upload it again.",
                {"dataset_id": dataset.id},
            )
        fmt = CsvFormat(encoding=dataset.detected_encoding, delimiter=dataset.detected_delimiter)
        return load_dataset_frame(path, fmt)
