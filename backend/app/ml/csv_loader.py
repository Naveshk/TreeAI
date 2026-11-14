"""CSV decoding, delimiter detection, structural validation and parsing.

Pure pandas/stdlib logic: no FastAPI or database imports. Validation failures raise
`app.errors.AppError` subclasses with stable error codes.

`parse_csv_text` is the ONLY function that turns CSV text into a DataFrame. Upload
validation, profiling, preview and (from M4) training all go through it with the same
recorded encoding and delimiter, so the same bytes always produce the same DataFrame.
"""

import csv
import io
import warnings
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from app.errors import BadRequestError, PayloadTooLargeError, UnsupportedMediaTypeError

ENCODINGS: tuple[str, ...] = ("utf-8-sig", "cp1252", "latin-1")
DELIMITERS = ",;\t|"
SNIFF_CHARS = 64 * 1024
_MAX_REASON_CHARS = 300


@dataclass(frozen=True)
class CsvFormat:
    encoding: str
    delimiter: str


@dataclass(frozen=True)
class CsvLimits:
    max_rows: int
    max_columns: int


@dataclass(frozen=True)
class LoadedCsv:
    frame: pd.DataFrame
    fmt: CsvFormat


def decode_bytes(data: bytes) -> tuple[str, str]:
    """Decode CSV bytes. Returns (text, encoding). latin-1 is the final fallback."""
    if not data.strip():
        raise BadRequestError("EMPTY_FILE", "The file is empty.")
    if b"\x00" in data[:SNIFF_CHARS]:
        raise UnsupportedMediaTypeError(
            "INVALID_FILE_TYPE",
            "The file looks binary (or UTF-16). Please upload a plain-text CSV saved as UTF-8.",
        )
    for encoding in ENCODINGS:
        try:
            return data.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    raise AssertionError("latin-1 decoding cannot fail")  # pragma: no cover


def detect_delimiter(text: str) -> str:
    """Detect the delimiter among , ; tab | using csv.Sniffer with a count fallback."""
    sample = text[:SNIFF_CHARS]
    try:
        return csv.Sniffer().sniff(sample, delimiters=DELIMITERS).delimiter
    except csv.Error:
        first_line = sample.splitlines()[0] if sample.splitlines() else ""
        counts = {d: first_line.count(d) for d in DELIMITERS}
        best = max(counts, key=lambda d: counts[d])
        return best if counts[best] > 0 else ","


def read_header(text: str, delimiter: str) -> list[str]:
    reader = csv.reader(io.StringIO(text), delimiter=delimiter, skipinitialspace=True)
    for row in reader:
        if row:  # skip leading blank lines, like pandas does
            return row
    raise BadRequestError("EMPTY_FILE", "The file is empty.")


def validate_header(header: list[str], limits: CsvLimits) -> None:
    if len(header) > limits.max_columns:
        raise PayloadTooLargeError(
            "TOO_MANY_COLUMNS",
            f"The file has {len(header)} columns; the maximum is {limits.max_columns}.",
            {"columns": len(header), "max_columns": limits.max_columns},
        )
    blank = [i + 1 for i, name in enumerate(header) if not name.strip()]
    if blank:
        raise BadRequestError(
            "BLANK_COLUMN_NAME",
            "Every column needs a name in the header row. Blank column name at position(s) "
            f"{', '.join(map(str, blank))}.",
            {"positions": blank},
        )
    seen: set[str] = set()
    duplicates: list[str] = []
    for name in header:
        if name in seen and name not in duplicates:
            duplicates.append(name)
        seen.add(name)
    if duplicates:
        raise BadRequestError(
            "DUPLICATE_COLUMNS",
            f"Column names must be unique. Duplicated: {', '.join(duplicates)}.",
            {"duplicates": duplicates},
        )
    if len(header) < 2:
        raise BadRequestError(
            "TOO_FEW_COLUMNS",
            "The file needs at least 2 columns (features and a target). If your file has "
            "more, check that it uses a comma, semicolon, tab or pipe as the delimiter.",
            {"columns": len(header)},
        )


def parse_csv_text(
    text: str,
    delimiter: str,
    *,
    nrows: int | None = None,
    as_strings: bool = False,
) -> pd.DataFrame:
    """The single CSV -> DataFrame parser used everywhere.

    - `index_col=False`: pandas would otherwise silently use the first column as the
      index when every data row has one field more than the header (e.g. trailing
      delimiters), shifting all values one column to the left.
    - Rows with real extra fields make pandas emit a ParserWarning and drop the extra
      values; that warning is escalated to PARSE_ERROR so no data is discarded silently.
      Empty trailing fields (`1,2,`) carry no data and parse normally.
    - Positive/negative infinity (`inf`, `-inf`, `1e309`, ...) in numeric columns is
      treated as missing, so profiling and training see the same NaN values.
    """
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", pd.errors.ParserWarning)
            frame = pd.read_csv(
                io.StringIO(text),
                sep=delimiter,
                skipinitialspace=True,
                on_bad_lines="error",
                index_col=False,
                nrows=nrows,
                dtype=str if as_strings else None,
            )
    except pd.errors.EmptyDataError as exc:
        raise BadRequestError("EMPTY_FILE", "The file is empty.") from exc
    except pd.errors.ParserWarning as exc:
        raise BadRequestError(
            "PARSE_ERROR",
            "The CSV file could not be parsed: some rows have more values than the header "
            "has columns.",
            {"reason": "extra_fields"},
        ) from exc
    except (pd.errors.ParserError, csv.Error, ValueError) as exc:
        reason = str(exc).strip()[:_MAX_REASON_CHARS]
        raise BadRequestError(
            "PARSE_ERROR", f"The CSV file could not be parsed: {reason}", {"reason": reason}
        ) from exc

    if not as_strings:
        float_columns = frame.select_dtypes(include="floating").columns
        if len(float_columns):
            frame[float_columns] = frame[float_columns].replace([np.inf, -np.inf], np.nan)
    return frame


def load_csv_bytes(data: bytes, limits: CsvLimits) -> LoadedCsv:
    """Validate and parse uploaded CSV bytes. Raises AppError subclasses on failure."""
    text, encoding = decode_bytes(data)
    if not text.strip():
        raise BadRequestError("EMPTY_FILE", "The file is empty.")
    delimiter = detect_delimiter(text)
    header = read_header(text, delimiter)
    validate_header(header, limits)

    frame = parse_csv_text(text, delimiter, nrows=limits.max_rows + 1)
    if len(frame) == 0:
        raise BadRequestError("HEADER_ONLY", "The file has a header row but no data rows.")
    if len(frame) > limits.max_rows:
        raise PayloadTooLargeError(
            "TOO_MANY_ROWS",
            f"The file has more than {limits.max_rows} data rows.",
            {"max_rows": limits.max_rows},
        )
    return LoadedCsv(frame=frame, fmt=CsvFormat(encoding=encoding, delimiter=delimiter))


def read_text(path: Path, fmt: CsvFormat) -> str:
    return path.read_bytes().decode(fmt.encoding)


def load_dataset_frame(path: Path, fmt: CsvFormat) -> pd.DataFrame:
    """Load a stored dataset exactly as it was parsed at upload time."""
    return parse_csv_text(read_text(path, fmt), fmt.delimiter)


def read_preview_rows(
    path: Path, fmt: CsvFormat, offset: int, limit: int
) -> tuple[list[str], list[list[str | None]]]:
    """Rows as written in the file (strings), missing values as None.

    Parses the first `offset + limit` data rows and slices afterwards, so offsets count
    parsed data rows (blank lines and quoted newlines do not shift them).
    """
    frame = parse_csv_text(
        read_text(path, fmt), fmt.delimiter, nrows=offset + limit, as_strings=True
    ).iloc[offset:]
    columns = [str(c) for c in frame.columns]
    values = frame.astype(object).where(frame.notna(), None)
    return columns, values.values.tolist()
