"""Prediction, tree extraction and per-tree explanations using the SAVED pipeline."""

import sqlite3
from typing import Any

from app.errors import NotFoundError
from app.ml.forest import explain_prediction, extract_tree, tree_summaries
from app.ml.inputs import build_input_frame
from app.schemas.model import (
    ExplainResponse,
    PredictResponse,
    TreeListResponse,
    TreeStructure,
)
from app.services.model_service import get_model_record, require_ready
from app.storage.model_store import ModelStore
from app.storage.records import ModelRecord
from app.storage.repositories import ModelRepository


class InferenceService:
    def __init__(self, conn: sqlite3.Connection, store: ModelStore) -> None:
        self._models = ModelRepository(conn)
        self._store = store

    def _load(self, model_id: str) -> tuple[ModelRecord, dict[str, Any]]:
        record = get_model_record(self._models, model_id)
        require_ready(record)
        assert record.artifact_sha256 is not None and record.sklearn_version is not None
        artifact = self._store.load(record.id, record.artifact_sha256, record.sklearn_version)
        return record, artifact

    def predict(self, model_id: str, inputs: dict[str, Any]) -> PredictResponse:
        record, artifact = self._load(model_id)
        pipeline, schema = artifact["pipeline"], artifact["input_schema"]
        frame, _, imputed, warnings = build_input_frame(inputs, schema)

        if record.task_type == "classification":
            classes = artifact["classes"]
            prediction: str | float = str(pipeline.predict(frame)[0])
            proba = pipeline.predict_proba(frame)[0]
            probabilities = [
                {"label": c, "probability": float(p)} for c, p in zip(classes, proba, strict=True)
            ]
        else:
            prediction = float(pipeline.predict(frame)[0])
            probabilities = None

        return PredictResponse(
            model_id=record.id,
            task_type=record.task_type,  # type: ignore[arg-type]
            prediction=prediction,
            probabilities=probabilities,  # type: ignore[arg-type]
            imputed_features=imputed,  # type: ignore[arg-type]
            warnings=warnings,
        )

    def list_trees(self, model_id: str) -> TreeListResponse:
        record, artifact = self._load(model_id)
        trees = tree_summaries(artifact["pipeline"])
        return TreeListResponse(
            model_id=record.id,
            task_type=record.task_type,  # type: ignore[arg-type]
            n_trees=len(trees),
            trees=trees,  # type: ignore[arg-type]
        )

    def get_tree(self, model_id: str, tree_index: int) -> TreeStructure:
        record, artifact = self._load(model_id)
        n_trees = len(artifact["pipeline"].named_steps["forest"].estimators_)
        if not 0 <= tree_index < n_trees:
            raise NotFoundError(
                "TREE_INDEX_OUT_OF_RANGE",
                f"Tree {tree_index} does not exist; this forest has {n_trees} trees "
                f"(0–{n_trees - 1}).",
                {"tree_index": tree_index, "n_trees": n_trees},
            )
        tree = extract_tree(
            artifact["pipeline"],
            tree_index,
            artifact["input_schema"],
            record.task_type,
            artifact["classes"],
        )
        return TreeStructure(
            model_id=record.id,
            task_type=record.task_type,  # type: ignore[arg-type]
            criterion=str(record.hyperparameters.get("criterion")),
            classes=artifact["classes"],
            **tree,
        )

    def explain(self, model_id: str, inputs: dict[str, Any]) -> ExplainResponse:
        record, artifact = self._load(model_id)
        schema = artifact["input_schema"]
        frame, display, imputed, warnings = build_input_frame(inputs, schema)
        result = explain_prediction(
            artifact["pipeline"], frame, schema, record.task_type, artifact["classes"], display
        )
        return ExplainResponse(
            model_id=record.id,
            task_type=record.task_type,  # type: ignore[arg-type]
            imputed_features=imputed,  # type: ignore[arg-type]
            warnings=warnings,
            **result,
        )
