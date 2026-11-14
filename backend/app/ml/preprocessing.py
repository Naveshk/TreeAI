"""Feature preparation and the preprocessing half of the training pipeline.

The SAME fitted `ColumnTransformer` (inside the saved Pipeline) is used for evaluation,
prediction and tree explanation. Before data reaches it, `prepare_features` normalises
column types so training and inference values always match:

- numeric features  -> float64 (NaN = missing)
- categorical features -> Python `str` (NaN = missing). Booleans become "True"/"False",
  integral floats such as 3.0 become "3", so user input "3" or 3 maps to the same category.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OrdinalEncoder

FeatureKind = Literal["numeric", "categorical"]
UNKNOWN_CATEGORY_CODE = -1


@dataclass(frozen=True)
class FeatureSpec:
    name: str
    kind: FeatureKind


def to_category_value(value: Any) -> Any:
    """Canonical string form of a categorical value; missing -> np.nan."""
    if value is None or value is pd.NA:
        return np.nan
    if isinstance(value, (bool, np.bool_)):
        return "True" if value else "False"
    if isinstance(value, (int, np.integer)):
        return str(int(value))
    if isinstance(value, (float, np.floating)):
        number = float(value)
        if math.isnan(number) or math.isinf(number):
            return np.nan
        return str(int(number)) if number.is_integer() else repr(number)
    text = str(value)
    return text if text != "" else np.nan


def prepare_features(frame: pd.DataFrame, specs: Sequence[FeatureSpec]) -> pd.DataFrame:
    """Select feature columns and normalise their types (see module docstring)."""
    columns: dict[str, pd.Series] = {}
    for spec in specs:
        series = frame[spec.name]
        if spec.kind == "numeric":
            columns[spec.name] = pd.to_numeric(series, errors="raise").astype("float64")
        else:
            columns[spec.name] = series.map(to_category_value).astype(object)
    return pd.DataFrame(columns, index=frame.index)


def transformed_order(specs: Sequence[FeatureSpec]) -> list[FeatureSpec]:
    """Column order produced by the ColumnTransformer: numeric first, then categorical."""
    return [s for s in specs if s.kind == "numeric"] + [s for s in specs if s.kind != "numeric"]


def build_preprocessor(specs: Sequence[FeatureSpec]) -> ColumnTransformer:
    numeric = [s.name for s in specs if s.kind == "numeric"]
    categorical = [s.name for s in specs if s.kind == "categorical"]
    transformers: list[tuple[str, Any, list[str]]] = []
    if numeric:
        transformers.append(
            ("numeric", SimpleImputer(strategy="median", keep_empty_features=True), numeric)
        )
    if categorical:
        transformers.append(
            (
                "categorical",
                Pipeline(
                    [
                        (
                            "impute",
                            SimpleImputer(strategy="most_frequent", keep_empty_features=True),
                        ),
                        (
                            "encode",
                            OrdinalEncoder(
                                handle_unknown="use_encoded_value",
                                unknown_value=UNKNOWN_CATEGORY_CODE,
                                dtype=np.float64,
                            ),
                        ),
                    ]
                ),
                categorical,
            )
        )
    return ColumnTransformer(transformers, remainder="drop", verbose_feature_names_out=False)


def input_schema_from_pipeline(
    pipeline: Pipeline, specs: Sequence[FeatureSpec], x_train: pd.DataFrame
) -> list[dict[str, Any]]:
    """Describe every feature using statistics of the FITTED preprocessor (training data).

    Returned in transformed-column order; index i describes column i seen by the trees.
    """
    preprocessor: ColumnTransformer = pipeline.named_steps["preprocess"]
    ordered = transformed_order(specs)
    numeric_stats: dict[str, float] = {}
    categorical_info: dict[str, tuple[list[str], str]] = {}

    if "numeric" in preprocessor.named_transformers_:
        imputer = preprocessor.named_transformers_["numeric"]
        names = [s.name for s in ordered if s.kind == "numeric"]
        numeric_stats = dict(zip(names, imputer.statistics_, strict=True))
    if "categorical" in preprocessor.named_transformers_:
        cat_pipe = preprocessor.named_transformers_["categorical"]
        names = [s.name for s in ordered if s.kind == "categorical"]
        modes = cat_pipe.named_steps["impute"].statistics_
        categories = cat_pipe.named_steps["encode"].categories_
        for name, mode, cats in zip(names, modes, categories, strict=True):
            categorical_info[name] = ([str(c) for c in cats], str(mode))

    schema: list[dict[str, Any]] = []
    for spec in ordered:
        if spec.kind == "numeric":
            column = x_train[spec.name]
            has_values = bool(column.notna().any())
            schema.append(
                {
                    "name": spec.name,
                    "kind": "numeric",
                    "categories": None,
                    "train_min": float(column.min()) if has_values else None,
                    "train_max": float(column.max()) if has_values else None,
                    "train_median": float(numeric_stats[spec.name]),
                    "train_mode": None,
                }
            )
        else:
            cats, mode = categorical_info[spec.name]
            schema.append(
                {
                    "name": spec.name,
                    "kind": "categorical",
                    "categories": cats,
                    "train_min": None,
                    "train_max": None,
                    "train_median": None,
                    "train_mode": mode,
                }
            )
    return schema
