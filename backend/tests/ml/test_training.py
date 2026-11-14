"""Training correctness: leakage prevention, reproducibility, real metrics, validation."""

import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import accuracy_score, mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

from app.errors import AppError
from app.ml.preprocessing import FeatureSpec, prepare_features, to_category_value
from app.ml.training import TrainingConfig, train_random_forest

HP = dict(
    n_estimators=15,
    max_depth=5,
    min_samples_split=2,
    min_samples_leaf=1,
    max_features="sqrt",
    bootstrap=True,
    criterion="gini",
)


@pytest.fixture
def frame() -> pd.DataFrame:
    rng = np.random.default_rng(0)
    n = 200
    x1 = rng.normal(size=n)
    color = rng.choice(["red", "green", "blue"], size=n)
    x1[::7] = np.nan  # missing numeric values
    color = color.astype(object)
    color[::11] = None  # missing categorical values
    label = np.where(np.nan_to_num(x1) + (color == "red") > 0.3, "yes", "no")
    value = 3 * np.nan_to_num(x1) + rng.normal(scale=0.1, size=n)
    return pd.DataFrame({"x1": x1, "color": color, "label": label, "value": value})


FEATURES = [FeatureSpec("x1", "numeric"), FeatureSpec("color", "categorical")]


def config(**overrides) -> TrainingConfig:
    values = dict(
        task_type="classification",
        target="label",
        features=FEATURES,
        test_size=0.25,
        random_state=7,
        stratify=True,
        hyperparameters=HP,
    )
    values.update(overrides)
    return TrainingConfig(**values)


def test_only_random_forest_is_trained(frame: pd.DataFrame) -> None:
    model = train_random_forest(frame, config())
    forest = model.pipeline.named_steps["forest"]
    assert isinstance(forest, RandomForestClassifier)
    assert len(forest.estimators_) == 15

    reg = train_random_forest(
        frame,
        config(
            task_type="regression",
            target="value",
            stratify=False,
            hyperparameters={**HP, "criterion": "squared_error", "max_features": 1.0},
        ),
    )
    assert isinstance(reg.pipeline.named_steps["forest"], RandomForestRegressor)


def test_preprocessor_is_fitted_on_training_split_only(frame: pd.DataFrame) -> None:
    model = train_random_forest(frame, config())

    # Recreate the exact split independently and compare the learned imputer statistics.
    x = prepare_features(frame, FEATURES)
    y = frame["label"].map(to_category_value)
    x_train, _, _, _ = train_test_split(x, y, test_size=0.25, random_state=7, stratify=y)
    imputer = model.pipeline.named_steps["preprocess"].named_transformers_["numeric"]

    assert imputer.statistics_[0] == pytest.approx(x_train["x1"].median())
    assert imputer.statistics_[0] != pytest.approx(x["x1"].median())
    assert model.n_train == len(x_train)
    assert model.n_test == len(frame) - len(x_train)
    categories = model.input_schema[1]["categories"]
    assert categories == sorted(x_train["color"].dropna().unique())


def test_metrics_are_recomputed_from_held_out_predictions(frame: pd.DataFrame) -> None:
    model = train_random_forest(frame, config())
    x = prepare_features(frame, FEATURES)
    y = frame["label"].map(to_category_value)
    _, x_test, _, y_test = train_test_split(x, y, test_size=0.25, random_state=7, stratify=y)

    expected = accuracy_score(y_test, model.pipeline.predict(x_test))
    assert model.metrics["accuracy"] == pytest.approx(expected)
    assert model.metrics["n_samples"] == len(y_test)
    matrix = np.array(model.metrics["confusion_matrix"]["matrix"])
    assert matrix.sum() == len(y_test)
    assert np.trace(matrix) / matrix.sum() == pytest.approx(expected)
    assert [c["label"] for c in model.metrics["per_class"]] == model.classes == ["no", "yes"]


def test_regression_metrics(frame: pd.DataFrame) -> None:
    cfg = config(
        task_type="regression",
        target="value",
        stratify=False,
        hyperparameters={**HP, "criterion": "squared_error", "max_features": 1.0},
    )
    model = train_random_forest(frame, cfg)
    x = prepare_features(frame, FEATURES)
    _, x_test, _, y_test = train_test_split(x, frame["value"], test_size=0.25, random_state=7)
    pred = model.pipeline.predict(x_test)

    assert model.classes is None
    assert model.metrics["mae"] == pytest.approx(mean_absolute_error(y_test, pred))
    assert model.metrics["rmse"] == pytest.approx(np.sqrt(model.metrics["mse"]))
    assert model.metrics["r2"] == pytest.approx(r2_score(y_test, pred))


def test_training_is_reproducible(frame: pd.DataFrame) -> None:
    a = train_random_forest(frame, config())
    b = train_random_forest(frame, config())
    x = prepare_features(frame, FEATURES)

    assert a.metrics == b.metrics
    np.testing.assert_array_equal(a.pipeline.predict_proba(x), b.pipeline.predict_proba(x))


def test_rows_with_missing_target_are_dropped_before_split(frame: pd.DataFrame) -> None:
    frame.loc[:9, "label"] = None
    model = train_random_forest(frame, config())

    assert model.rows_dropped_missing_target == 10
    assert model.n_train + model.n_test == len(frame) - 10


def test_numeric_category_values_are_normalised(frame: pd.DataFrame) -> None:
    frame["grade"] = np.where(frame.index % 2 == 0, 1.0, 2.0)
    frame.loc[3, "grade"] = np.nan
    model = train_random_forest(
        frame, config(features=[*FEATURES, FeatureSpec("grade", "categorical")])
    )
    assert model.input_schema[2]["categories"] == ["1", "2"]


def test_single_row_class_with_stratify_is_rejected(frame: pd.DataFrame) -> None:
    frame.loc[0, "label"] = "rare"
    with pytest.raises(AppError) as info:
        train_random_forest(frame, config())
    assert info.value.code == "CLASS_TOO_SMALL_FOR_STRATIFY"


def test_single_class_target_is_rejected(frame: pd.DataFrame) -> None:
    frame["label"] = "same"
    with pytest.raises(AppError) as info:
        train_random_forest(frame, config(stratify=False))
    assert info.value.code == "INVALID_TARGET"


def test_impossible_split_is_rejected() -> None:
    tiny = pd.DataFrame({"x1": [1.0, 2.0, 3.0], "color": ["a", "b", "a"], "label": ["p", "q", "p"]})
    with pytest.raises(AppError) as info:
        train_random_forest(tiny, config(stratify=False, test_size=0.5))
    assert info.value.code == "INVALID_SPLIT"


def test_regression_requires_numeric_target(frame: pd.DataFrame) -> None:
    with pytest.raises(AppError) as info:
        train_random_forest(frame, config(task_type="regression", stratify=False))
    assert info.value.code == "REGRESSION_TARGET_NOT_NUMERIC"


@pytest.mark.parametrize(
    ("value", "expected"),
    [(1, "1"), (2.0, "2"), (2.5, "2.5"), (True, "True"), ("x", "x"), (None, None), ("", None)],
)
def test_to_category_value(value: object, expected: object) -> None:
    result = to_category_value(value)
    if expected is None:
        assert isinstance(result, float) and np.isnan(result)
    else:
        assert result == expected
