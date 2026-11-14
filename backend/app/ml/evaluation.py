"""Evaluation metrics, computed on held-out test predictions only."""

from typing import Any

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    mean_absolute_error,
    mean_squared_error,
    precision_recall_fscore_support,
    r2_score,
)

from app.ml.profiling import to_jsonable


def evaluate_classification(
    y_true: np.ndarray, y_pred: np.ndarray, classes: list[str]
) -> dict[str, Any]:
    metrics: dict[str, Any] = {
        "task_type": "classification",
        "n_samples": int(len(y_true)),
        "accuracy": float(accuracy_score(y_true, y_pred)),
    }
    for average in ("macro", "weighted"):
        precision, recall, f1, _ = precision_recall_fscore_support(
            y_true, y_pred, labels=classes, average=average, zero_division=0
        )
        metrics[f"precision_{average}"] = float(precision)
        metrics[f"recall_{average}"] = float(recall)
        metrics[f"f1_{average}"] = float(f1)

    report = classification_report(
        y_true, y_pred, labels=classes, output_dict=True, zero_division=0
    )
    metrics["per_class"] = [
        {
            "label": label,
            "precision": float(report[label]["precision"]),
            "recall": float(report[label]["recall"]),
            "f1": float(report[label]["f1-score"]),
            "support": int(report[label]["support"]),
        }
        for label in classes
    ]
    metrics["confusion_matrix"] = {
        "labels": classes,
        "matrix": confusion_matrix(y_true, y_pred, labels=classes).astype(int).tolist(),
    }
    return metrics


def evaluate_regression(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, Any]:
    mse = float(mean_squared_error(y_true, y_pred))
    r2 = float(r2_score(y_true, y_pred)) if len(y_true) >= 2 else float("nan")
    return {
        "task_type": "regression",
        "n_samples": int(len(y_true)),
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "mse": mse,
        "rmse": float(np.sqrt(mse)),
        "r2": to_jsonable(r2),  # undefined (None) with < 2 test rows or constant y_true
    }
