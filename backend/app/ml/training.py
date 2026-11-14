"""Random Forest training with a leakage-free preprocessing pipeline.

Order of operations (see CLAUDE.md ML rules):
  1. drop rows whose TARGET is missing (the target is never imputed)
  2. train_test_split FIRST (stratified for classification when requested)
  3. fit Pipeline(preprocess, forest) on the training split only
  4. evaluate on the held-out test split only
Only RandomForestClassifier / RandomForestRegressor are ever trained.
"""

import time
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal

import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from app.errors import UnprocessableError
from app.ml.evaluation import evaluate_classification, evaluate_regression
from app.ml.preprocessing import (
    FeatureSpec,
    build_preprocessor,
    input_schema_from_pipeline,
    prepare_features,
    to_category_value,
)

TaskType = Literal["classification", "regression"]
MAX_CLASSES = 50
MIN_TRAIN_ROWS = 2


@dataclass(frozen=True)
class TrainingConfig:
    task_type: TaskType
    target: str
    features: Sequence[FeatureSpec]
    test_size: float
    random_state: int
    stratify: bool
    hyperparameters: dict[str, Any]


@dataclass
class TrainedModel:
    pipeline: Pipeline
    input_schema: list[dict[str, Any]]
    classes: list[str] | None
    metrics: dict[str, Any]
    n_train: int
    n_test: int
    rows_dropped_missing_target: int
    train_duration_ms: int
    sklearn_version: str


def prepare_target(series: pd.Series, task_type: TaskType) -> pd.Series:
    if task_type == "classification":
        return series.map(to_category_value).astype(object)
    if not pd.api.types.is_numeric_dtype(series) or pd.api.types.is_bool_dtype(series):
        raise UnprocessableError(
            "REGRESSION_TARGET_NOT_NUMERIC",
            f"Regression needs a numeric target; '{series.name}' is not numeric.",
            {"target": str(series.name)},
        )
    return series.astype("float64")


def _split(
    x: pd.DataFrame, y: pd.Series, config: TrainingConfig
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
    stratify = y if (config.task_type == "classification" and config.stratify) else None
    if stratify is not None:
        counts = y.value_counts()
        too_small = sorted(str(label) for label, n in counts.items() if n < 2)
        if too_small:
            raise UnprocessableError(
                "CLASS_TOO_SMALL_FOR_STRATIFY",
                "Stratified splitting needs at least 2 rows per class. Classes with a single "
                f"row: {', '.join(too_small[:10])}. Disable stratification or pick another "
                "target.",
                {"classes": too_small},
            )
    try:
        x_train, x_test, y_train, y_test = train_test_split(
            x, y, test_size=config.test_size, random_state=config.random_state, stratify=stratify
        )
    except ValueError as exc:
        raise UnprocessableError(
            "INVALID_SPLIT",
            f"The train/test split is not possible with this data: {exc}",
            {"rows": len(y), "test_size": config.test_size},
        ) from exc
    if len(x_train) < MIN_TRAIN_ROWS or len(x_test) < 1:
        raise UnprocessableError(
            "INVALID_SPLIT",
            "Not enough rows for a train/test split. Upload more data or change the test size.",
            {"rows": len(y), "test_size": config.test_size},
        )
    return x_train, x_test, y_train, y_test


def build_forest(config: TrainingConfig) -> RandomForestClassifier | RandomForestRegressor:
    params = dict(config.hyperparameters)
    cls = RandomForestClassifier if config.task_type == "classification" else RandomForestRegressor
    return cls(**params, random_state=config.random_state, n_jobs=-1)


def train_random_forest(frame: pd.DataFrame, config: TrainingConfig) -> TrainedModel:
    started = time.perf_counter()
    feature_names = [s.name for s in config.features]
    data = frame[[*feature_names, config.target]]

    y_all = prepare_target(data[config.target], config.task_type)
    keep = y_all.notna()
    rows_dropped = int((~keep).sum())
    y = y_all[keep]
    x = prepare_features(data.loc[keep], config.features)

    if config.task_type == "classification":
        n_classes = int(y.nunique())
        if n_classes < 2:
            raise UnprocessableError(
                "INVALID_TARGET",
                "Classification needs at least 2 distinct target values.",
                {"classes": n_classes},
            )
        if n_classes > MAX_CLASSES:
            raise UnprocessableError(
                "TOO_MANY_CLASSES",
                f"The target has {n_classes} distinct values; the maximum for classification "
                f"is {MAX_CLASSES}. Consider regression for numeric targets.",
                {"classes": n_classes, "max_classes": MAX_CLASSES},
            )
    elif y.nunique() < 2:
        raise UnprocessableError(
            "INVALID_TARGET", "Regression needs a target with at least 2 distinct values.", {}
        )

    x_train, x_test, y_train, y_test = _split(x, y, config)

    pipeline = Pipeline(
        [("preprocess", build_preprocessor(config.features)), ("forest", build_forest(config))]
    )
    pipeline.fit(x_train, y_train)

    if config.task_type == "classification":
        forest = pipeline.named_steps["forest"]
        classes = [str(c) for c in forest.classes_]
        metrics = evaluate_classification(y_test.to_numpy(), pipeline.predict(x_test), classes)
    else:
        classes = None
        metrics = evaluate_regression(y_test.to_numpy(), pipeline.predict(x_test))

    return TrainedModel(
        pipeline=pipeline,
        input_schema=input_schema_from_pipeline(pipeline, config.features, x_train),
        classes=classes,
        metrics=metrics,
        n_train=len(x_train),
        n_test=len(x_test),
        rows_dropped_missing_target=rows_dropped,
        train_duration_ms=int((time.perf_counter() - started) * 1000),
        sklearn_version=sklearn.__version__,
    )
