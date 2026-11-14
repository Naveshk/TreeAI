"""CSV decoding, delimiter detection, header validation, parsing and limits."""

from pathlib import Path

import pandas as pd
import pytest

from app.errors import AppError
from app.ml.csv_loader import (
    CsvFormat,
    CsvLimits,
    load_csv_bytes,
    load_dataset_frame,
    read_preview_rows,
)

LIMITS = CsvLimits(max_rows=1000, max_columns=50)


def load(data: bytes, limits: CsvLimits = LIMITS):
    return load_csv_bytes(data, limits)


def assert_error(data: bytes, code: str, status: int, limits: CsvLimits = LIMITS) -> AppError:
    with pytest.raises(AppError) as info:
        load(data, limits)
    assert info.value.code == code
    assert info.value.status_code == status
    return info.value


# ---- encodings -------------------------------------------------------------------------
def test_utf8() -> None:
    result = load("name,city\nZoë,Kraków\n".encode())
    assert result.fmt.encoding == "utf-8-sig"
    assert result.frame["city"].tolist() == ["Kraków"]


def test_utf8_bom_is_not_part_of_first_column_name() -> None:
    result = load(b"\xef\xbb\xbfa,b\n1,2\n")
    assert list(result.frame.columns) == ["a", "b"]


def test_cp1252_fallback() -> None:
    result = load("name,price\ncafé,€5\n".encode("cp1252"))
    assert result.fmt.encoding == "cp1252"
    assert result.frame["name"].tolist() == ["café"]
    assert result.frame["price"].tolist() == ["€5"]


def test_latin1_final_fallback() -> None:
    # 0x81 is undefined in cp1252 but valid in latin-1.
    result = load(b"a,b\n\x81x,1\n")
    assert result.fmt.encoding == "latin-1"


# ---- delimiters -------------------------------------------------------------------------
@pytest.mark.parametrize("delimiter", [",", ";", "\t", "|"])
def test_delimiters(delimiter: str) -> None:
    text = delimiter.join(["a", "b", "c"]) + "\n" + delimiter.join(["1", "2", "x"]) + "\n"
    text += delimiter.join(["3", "4", "y"]) + "\n"
    result = load(text.encode())
    assert result.fmt.delimiter == delimiter
    assert list(result.frame.columns) == ["a", "b", "c"]
    assert result.frame["a"].tolist() == [1, 3]


def test_semicolon_with_decimal_commas_in_quotes() -> None:
    result = load(b'a;b\n"1,5";2\n"2,5";3\n')
    assert result.fmt.delimiter == ";"
    assert result.frame["a"].tolist() == ["1,5", "2,5"]


def test_quoted_fields_with_commas_and_newlines() -> None:
    result = load(b'id,text,n\n1,"hello, world",3\n2,"line1\nline2",4\n')
    assert result.frame["text"].tolist() == ["hello, world", "line1\nline2"]
    assert len(result.frame) == 2


def test_space_after_delimiter_is_ignored() -> None:
    result = load(b"a, b\n1, 2\n")
    assert list(result.frame.columns) == ["a", "b"]
    assert result.frame["b"].tolist() == [2]


# ---- structural errors -------------------------------------------------------------------
@pytest.mark.parametrize("data", [b"", b"   \n\n  ", b"\n"])
def test_empty_file(data: bytes) -> None:
    assert_error(data, "EMPTY_FILE", 400)


def test_header_only() -> None:
    assert_error(b"a,b,c\n", "HEADER_ONLY", 400)


def test_binary_file_rejected() -> None:
    assert_error(b"\x89PNG\r\n\x1a\n\x00\x00\x00", "INVALID_FILE_TYPE", 415)


def test_utf16_rejected() -> None:
    assert_error("a,b\n1,2\n".encode("utf-16"), "INVALID_FILE_TYPE", 415)


def test_duplicate_columns_detected_before_pandas_renames_them() -> None:
    error = assert_error(b"a,b,a\n1,2,3\n", "DUPLICATE_COLUMNS", 400)
    assert error.details == {"duplicates": ["a"]}


def test_blank_column_name() -> None:
    error = assert_error(b"a,,c\n1,2,3\n", "BLANK_COLUMN_NAME", 400)
    assert error.details == {"positions": [2]}


def test_trailing_delimiter_in_header_is_blank_column() -> None:
    assert_error(b"a,b,\n1,2,\n", "BLANK_COLUMN_NAME", 400)


def test_single_column_rejected() -> None:
    assert_error(b"only\n1\n2\n", "TOO_FEW_COLUMNS", 400)


def test_row_with_too_many_fields_is_parse_error() -> None:
    error = assert_error(b"a,b\n1,2\n3,4,5\n", "PARSE_ERROR", 400)
    assert "line 3" in error.message


def test_trailing_delimiter_on_every_row_does_not_shift_columns() -> None:
    # Regression: pandas used the first column as the index and shifted all values left.
    result = load(b"a,b\n1,2,\n3,4,\n5,6,\n")

    assert list(result.frame.columns) == ["a", "b"]
    assert result.frame["a"].tolist() == [1, 3, 5]
    assert result.frame["b"].tolist() == [2, 4, 6]
    assert result.frame.index.tolist() == [0, 1, 2]


def test_trailing_delimiter_on_some_rows_does_not_shift_columns() -> None:
    result = load(b"a,b\n1,2,\n3,4\n5,6,\n")

    assert result.frame["a"].tolist() == [1, 3, 5]
    assert result.frame["b"].tolist() == [2, 4, 6]


def test_extra_field_on_every_row_is_parse_error() -> None:
    # Regression: the values of column "a" were silently moved into the index.
    error = assert_error(b"a,b\n1,2,3\n4,5,6\n", "PARSE_ERROR", 400)
    assert error.details == {"reason": "extra_fields"}


def test_extra_field_on_one_row_among_trailing_delimiters_is_parse_error() -> None:
    error = assert_error(b"a,b\n1,2,\n3,4,99\n5,6,\n", "PARSE_ERROR", 400)
    assert error.details == {"reason": "extra_fields"}


def test_quoted_value_with_trailing_delimiter_keeps_data() -> None:
    result = load(b'a,b\n1,"x, y",\n2,"z",\n')

    assert result.frame["a"].tolist() == [1, 2]
    assert result.frame["b"].tolist() == ["x, y", "z"]


def test_row_with_too_few_fields_becomes_missing_value() -> None:
    result = load(b"a,b\n1,2\n3\n")
    assert result.frame["b"].isna().tolist() == [False, True]


# ---- limits -------------------------------------------------------------------------------
def test_too_many_columns() -> None:
    error = assert_error(b"a,b,c\n1,2,3\n", "TOO_MANY_COLUMNS", 413, CsvLimits(10, 2))
    assert error.details == {"columns": 3, "max_columns": 2}


def test_too_many_rows() -> None:
    data = b"a,b\n" + b"1,2\n" * 6
    assert_error(data, "TOO_MANY_ROWS", 413, CsvLimits(max_rows=5, max_columns=10))


def test_exactly_max_rows_is_allowed() -> None:
    data = b"a,b\n" + b"1,2\n" * 5
    assert len(load(data, CsvLimits(max_rows=5, max_columns=10)).frame) == 5


# ---- missing values and dtypes --------------------------------------------------------------
def test_infinite_values_become_missing() -> None:
    result = load(b"x,y\n1.5,0\ninf,1\n-inf,0\n1e309,1\n-1e309,0\nInfinity,1\n2.25,0\n")

    x = result.frame["x"]
    assert x.dtype == "float64"
    assert x.isna().tolist() == [False, True, True, True, True, True, False]
    assert x.dropna().tolist() == [1.5, 2.25]


def test_finite_values_are_unaffected_by_infinity_handling() -> None:
    result = load(b"big,small,ints\n1e308,-1e-300,1\n-1.7976931348623157e308,0.0,2\n")

    assert result.frame["big"].tolist() == [1e308, -1.7976931348623157e308]
    assert result.frame["small"].tolist() == [-1e-300, 0.0]
    assert result.frame["ints"].tolist() == [1, 2]
    assert not result.frame.isna().any().any()


def test_load_dataset_frame_also_treats_infinity_as_missing(tmp_path: Path) -> None:
    data = b"x,y\n1,0\ninf,1\n"
    path = tmp_path / "data.csv"
    path.write_bytes(data)

    reloaded = load_dataset_frame(path, load(data).fmt)

    assert reloaded["x"].isna().tolist() == [False, True]


def test_missing_values_are_recognized() -> None:
    result = load(b"a,b\n1,\n,x\nNA,y\n4,NaN\n")
    assert result.frame["a"].isna().sum() == 2
    assert result.frame["b"].isna().sum() == 2


# ---- stored-file loading -------------------------------------------------------------------
def test_load_dataset_frame_matches_upload_parse(tmp_path: Path) -> None:
    data = "x;y;label\n1,5;2;café\n3;;thé\n".encode("cp1252")
    uploaded = load(data)
    path = tmp_path / "data.csv"
    path.write_bytes(data)

    reloaded = load_dataset_frame(path, uploaded.fmt)

    pd.testing.assert_frame_equal(reloaded, uploaded.frame)


def test_preview_returns_raw_strings_and_none(tmp_path: Path) -> None:
    path = tmp_path / "data.csv"
    path.write_bytes(b"a,b\n1.50,x\n2,\n3,z\n4,w\n")
    fmt = CsvFormat(encoding="utf-8-sig", delimiter=",")

    columns, rows = read_preview_rows(path, fmt, offset=0, limit=2)
    assert columns == ["a", "b"]
    assert rows == [["1.50", "x"], ["2", None]]

    _, rows = read_preview_rows(path, fmt, offset=2, limit=10)
    assert rows == [["3", "z"], ["4", "w"]]

    _, rows = read_preview_rows(path, fmt, offset=100, limit=10)
    assert rows == []


def test_preview_offsets_count_data_rows_not_lines(tmp_path: Path) -> None:
    # Regression: blank lines (and quoted newlines) shifted offsets, repeating/skipping rows.
    data = b'a,b\n0,"multi\nline"\n\n1,x\n\n\n2,y\n3,z\n\n4,w\n'
    path = tmp_path / "data.csv"
    path.write_bytes(data)
    fmt = CsvFormat(encoding="utf-8-sig", delimiter=",")
    expected = [["0", "multi\nline"], ["1", "x"], ["2", "y"], ["3", "z"], ["4", "w"]]

    for offset in range(5):
        _, rows = read_preview_rows(path, fmt, offset=offset, limit=1)
        assert rows == [expected[offset]], f"offset={offset}"

    _, rows = read_preview_rows(path, fmt, offset=1, limit=3)
    assert rows == expected[1:4]
    _, rows = read_preview_rows(path, fmt, offset=3, limit=10)
    assert rows == expected[3:]
    _, rows = read_preview_rows(path, fmt, offset=5, limit=10)
    assert rows == []
