"""Dataset profiling: counts, statistics, target suitability, warnings, JSON safety."""

import json

import numpy as np
import pandas as pd
import pytest

from app.ml.csv_loader import CsvLimits, load_csv_bytes
from app.ml.profiling import profile_dataframe, target_suitability, to_jsonable
from app.ml.type_inference import infer_column_kind


@pytest.fixture
def frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "age": [22.0, 38.0, np.nan, 35.0, 35.0, 54.0],
            "sex": ["male", "female", "female", "male", "male", None],
            "city": ["A", "B", "C", "A", "A", "B"],
            "constant": [1, 1, 1, 1, 1, 1],
            "survived": [0, 1, 1, 0, 0, 1],
        }
    )


def column(profile: dict, name: str) -> dict:
    return next(c for c in profile["columns"] if c["name"] == name)


def test_dataset_counts(frame: pd.DataFrame) -> None:
    # The fixture already has one exact duplicate (rows 3 and 4); append a second copy.
    frame = pd.concat([frame, frame.iloc[[3]]], ignore_index=True)
    profile = profile_dataframe(frame)

    assert profile["n_rows"] == 7
    assert profile["n_cols"] == 5
    assert profile["duplicate_rows"] == int(frame.duplicated().sum()) == 2
    assert profile["total_missing"] == 2
    assert profile["missing_pct"] == round(100 * 2 / 35, 4)


def test_column_basics(frame: pd.DataFrame) -> None:
    profile = profile_dataframe(frame)
    age = column(profile, "age")

    assert [c["position"] for c in profile["columns"]] == [0, 1, 2, 3, 4]
    assert age["inferred_kind"] == "numeric"
    assert age["dtype"] == "float64"
    assert age["missing_count"] == 1
    assert age["missing_pct"] == round(100 / 6, 4)
    assert age["unique_count"] == 4
    assert age["sample_values"] == [22.0, 38.0, 35.0, 54.0]


def test_numeric_stats_match_pandas(frame: pd.DataFrame) -> None:
    stats = column(profile_dataframe(frame), "age")["numeric_stats"]
    expected = frame["age"].describe()

    assert stats["mean"] == pytest.approx(expected["mean"])
    assert stats["std"] == pytest.approx(expected["std"])
    assert stats["min"] == expected["min"]
    assert stats["q1"] == pytest.approx(expected["25%"])
    assert stats["median"] == pytest.approx(expected["50%"])
    assert stats["q3"] == pytest.approx(expected["75%"])
    assert stats["max"] == expected["max"]


def test_top_values_for_categorical(frame: pd.DataFrame) -> None:
    city = column(profile_dataframe(frame), "city")

    assert city["inferred_kind"] == "categorical"
    assert city["numeric_stats"] is None
    assert city["top_values"] == [
        {"value": "A", "count": 3},
        {"value": "B", "count": 2},
        {"value": "C", "count": 1},
    ]


def test_datetime_range() -> None:
    frame = pd.DataFrame({"d": ["2026-03-01", "2026-01-15", None], "y": [1, 2, 3]})
    d = column(profile_dataframe(frame), "d")

    assert d["inferred_kind"] == "datetime"
    assert d["datetime_range"] == {
        "min": "2026-01-15T00:00:00+00:00",
        "max": "2026-03-01T00:00:00+00:00",
    }


# ---- target suitability -------------------------------------------------------------------
def suitability(values: list) -> dict:
    series = pd.Series(values, name="t")
    return target_suitability(series, infer_column_kind(series), int(series.nunique()))


def test_binary_integer_target_suggests_classification() -> None:
    result = suitability([0, 1, 1, 0, None])
    assert result == {
        "classification": True,
        "regression": True,
        "suggested_task": "classification",
        "missing_target_rows": 1,
        "reason": None,
    }


def test_continuous_target_suggests_regression() -> None:
    result = suitability([1.5, 2.25, 3.0, 4.75])
    assert result["suggested_task"] == "regression"
    assert result["regression"] is True
    assert result["classification"] is True  # only 4 distinct values


def test_many_integer_values_suggest_regression() -> None:
    result = suitability([i % 30 for i in range(100)])
    assert result["suggested_task"] == "regression"
    assert result["classification"] is True  # 30 <= 50 classes still allowed


def test_too_many_classes_for_classification() -> None:
    result = suitability([float(i % 60) + 0.5 for i in range(120)])
    assert result["classification"] is False
    assert result["regression"] is True
    assert result["suggested_task"] == "regression"


def test_unique_integer_price_is_a_regression_target() -> None:
    # Regression: unique integers were id_like and therefore unsuitable as targets.
    result = suitability([200_000 + i * 1371 for i in range(30)])
    assert result["regression"] is True
    assert result["suggested_task"] == "regression"
    assert result["reason"] is None


def test_categorical_target() -> None:
    result = suitability(["setosa", "versicolor", "virginica"] * 5)
    assert result["classification"] is True
    assert result["regression"] is False
    assert result["suggested_task"] == "classification"


def test_categorical_with_too_many_classes_has_reason() -> None:
    result = suitability([f"c{i}" for i in range(60)] * 2)
    assert result["classification"] is False
    assert result["regression"] is False
    assert result["suggested_task"] is None
    assert "Too many distinct values" in result["reason"]


@pytest.mark.parametrize(
    ("values", "reason_fragment"),
    [
        ([7] * 25, "only one distinct value"),
        (list(range(25)), "identifier"),
        (["2026-01-01", "2026-01-02", "2026-01-03"], "Date/time"),
    ],
)
def test_unsuitable_targets(values: list, reason_fragment: str) -> None:
    result = suitability(values)
    assert result["classification"] is False
    assert result["regression"] is False
    assert result["suggested_task"] is None
    assert reason_fragment in result["reason"]


# ---- warnings -------------------------------------------------------------------------------
def test_warnings() -> None:
    frame = pd.DataFrame(
        {
            "id": list(range(30)),
            "const": ["x"] * 30,
            "sparse": [1.0] * 10 + [np.nan] * 20,
            "y": [0, 1] * 15,
        }
    )
    # Near-copy of row 0 with a new id (30 keeps the ids a consecutive run, i.e. id-like).
    frame = pd.concat([frame, frame.iloc[[0]].assign(id=30)], ignore_index=True)
    profile = profile_dataframe(frame)
    codes = {(w["code"], w["column"]) for w in profile["warnings"]}

    assert ("ID_LIKE_COLUMN", "id") in codes
    assert ("CONSTANT_COLUMN", "const") in codes
    assert ("HIGH_MISSING", "sparse") in codes
    assert not any(code == "DUPLICATE_ROWS" for code, _ in codes)  # ids differ


def test_duplicate_rows_warning(frame: pd.DataFrame) -> None:
    frame = pd.concat([frame, frame], ignore_index=True)
    codes = [w["code"] for w in profile_dataframe(frame)["warnings"]]
    assert "DUPLICATE_ROWS" in codes


# ---- JSON safety ----------------------------------------------------------------------------
def test_profile_is_strict_json() -> None:
    frame = pd.DataFrame(
        {
            "inf": [1.0, np.inf, -np.inf, np.nan],
            "all_nan": [np.nan] * 4,
            "ints": np.array([1, 2, 3, 4], dtype=np.int64),
            "flags": [True, False, True, False],
            "text": ["a", None, "c", "d"],
        }
    )
    profile = profile_dataframe(frame)

    json.dumps(profile, allow_nan=False)  # raises if any NaN/inf slipped through
    stats = column(profile, "inf")["numeric_stats"]
    assert stats["max"] is None or isinstance(stats["max"], float)


def test_infinite_values_are_profiled_as_missing() -> None:
    # Regression: inf values were not counted as missing and nulled most statistics.
    frame = load_csv_bytes(
        b"x,y\n1,0\ninf,1\n-inf,0\n1e309,1\n2,0\n3,1\n", CsvLimits(100, 10)
    ).frame
    profile = profile_dataframe(frame)
    x = column(profile, "x")

    assert x["inferred_kind"] == "numeric"
    assert x["missing_count"] == 3
    assert profile["total_missing"] == 3
    assert x["numeric_stats"] == {
        "mean": 2.0,
        "std": 1.0,
        "min": 1.0,
        "q1": 1.5,
        "median": 2.0,
        "q3": 2.5,
        "max": 3.0,
    }
    json.dumps(profile, allow_nan=False)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (np.int64(3), 3),
        (np.float32(1.5), 1.5),
        (np.nan, None),
        (np.inf, None),
        (np.bool_(True), True),
        (pd.NA, None),
        (pd.NaT, None),
        (None, None),
        ("x", "x"),
        (pd.Timestamp("2026-01-01"), "2026-01-01T00:00:00"),
    ],
)
def test_to_jsonable(value: object, expected: object) -> None:
    result = to_jsonable(value)
    assert result == expected
    assert type(result) is type(expected)
