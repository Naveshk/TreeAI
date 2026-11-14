"""Column kind inference rules and their precedence."""

import numpy as np
import pandas as pd
import pytest

from app.ml.type_inference import infer_column_kind


def kind(values: list, dtype: str | None = None) -> str:
    return infer_column_kind(pd.Series(values, dtype=dtype, name="c"))


def test_constant() -> None:
    assert kind([5] * 30) == "constant"
    assert kind(["a", "a", None]) == "constant"


def test_entirely_missing_is_constant() -> None:
    assert kind([np.nan, np.nan, np.nan]) == "constant"


def test_integer_id_like() -> None:
    assert kind(list(range(1, 21))) == "id_like"


def test_text_id_like() -> None:
    assert kind([f"user-{i}" for i in range(25)]) == "id_like"


def test_shuffled_consecutive_integers_are_id_like() -> None:
    values = list(range(100, 130))
    values.reverse()
    assert kind(values) == "id_like"


def test_arbitrary_unique_integers_are_numeric_not_id_like() -> None:
    # Regression: unique integer prices were classified as identifiers.
    prices = [200_000 + i * 1371 for i in range(30)]
    assert kind(prices) == "numeric"
    assert kind([120, 450, 875, 990, 1210] + [2000 + i * 3 for i in range(20)]) == "numeric"


def test_unique_integers_with_one_gap_are_numeric() -> None:
    assert kind([*range(1, 15), *range(16, 27)]) == "numeric"


def test_id_like_requires_minimum_rows() -> None:
    assert kind(list(range(19))) == "numeric"


def test_id_like_requires_no_missing_values() -> None:
    assert kind([*range(25), None]) == "numeric"


def test_unique_floats_are_not_id_like() -> None:
    assert kind([i + 0.5 for i in range(30)]) == "numeric"


def test_bool_dtype() -> None:
    assert kind([True, False, True]) == "boolean"


@pytest.mark.parametrize(
    "values",
    [["yes", "no", "Yes"], ["TRUE", "false", "true"], ["t", "f", "t"], ["Y", "n", None]],
)
def test_boolean_text(values: list) -> None:
    assert kind(values) == "boolean"


def test_two_arbitrary_strings_are_categorical() -> None:
    assert kind(["male", "female", "male"]) == "categorical"


def test_numeric_with_missing() -> None:
    assert kind([1.5, None, 3.2, 4.0]) == "numeric"


def test_low_cardinality_numbers_stay_numeric() -> None:
    assert kind([1, 2, 3, 1, 2, 3] * 10) == "numeric"


def test_iso_dates() -> None:
    assert kind(["2026-01-01", "2026-02-15", "2026-03-31 10:20:30", None]) == "datetime"


def test_invalid_dates_with_iso_shape_are_not_datetime() -> None:
    assert kind(["2026-13-45", "2026-99-99", "2026-00-00"]) == "categorical"


def test_non_iso_dates_are_not_datetime() -> None:
    assert kind(["01/02/2026", "03/04/2026", "05/06/2026"]) == "categorical"


def test_datetime_needs_ninety_percent() -> None:
    values = ["2026-01-01"] * 8 + ["hello", "world"]
    assert kind(values) == "categorical"
    assert kind(["2026-01-01"] * 9 + ["x"]) == "datetime"


def test_categorical_cutoff() -> None:
    hundred = [f"v{i}" for i in range(100)] * 2
    assert kind(hundred) == "categorical"
    hundred_and_one = [f"v{i}" for i in range(101)] * 2
    assert kind(hundred_and_one) == "text"


def test_numbers_stored_as_text_with_thousands_separator_are_categorical() -> None:
    assert kind(["1,234", "2,345", "1,234"]) == "categorical"


def test_legacy_object_dtype_is_treated_as_text() -> None:
    assert kind(["a", "b", "a"], dtype="object") == "categorical"
