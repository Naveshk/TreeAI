"""Dataset use cases: ingest (upload or sample), read, preview, profile, delete.

Uploads and bundled samples share ONE ingestion pipeline (`_ingest_tmp_file`):
bytes land in a temp file -> validated/parsed/profiled -> moved into place -> DB rows.
The temp file is always removed, whatever happens.
"""

import json
import shutil
import sqlite3
from datetime import UTC, datetime
from pathlib import Path, PurePath
from typing import Any, BinaryIO

from app.config import Settings
from app.errors import (
    InternalError,
    NotFoundError,
    PayloadTooLargeError,
    UnsupportedMediaTypeError,
)
from app.ml.csv_loader import CsvFormat, CsvLimits, load_csv_bytes, read_preview_rows
from app.ml.profiling import profile_dataframe
from app.samples.registry import get_sample
from app.schemas.dataset import (
    ColumnSummary,
    DatasetDetail,
    DatasetPreview,
    DatasetProfile,
    DatasetSummary,
    DatasetWarning,
)
from app.storage.files import FileStore, is_valid_id, new_id, sha256_file
from app.storage.records import ColumnRecord, DatasetRecord
from app.storage.repositories import DatasetRepository

COPY_CHUNK_BYTES = 1024 * 1024
MAX_NAME_CHARS = 100
MAX_FILENAME_CHARS = 255


def _not_found(dataset_id: str) -> NotFoundError:
    return NotFoundError("DATASET_NOT_FOUND", "Dataset not found.", {"dataset_id": dataset_id})


def _file_missing(dataset_id: str) -> InternalError:
    return InternalError(
        "DATASET_FILE_MISSING",
        "The files for this dataset are missing. Please delete it and upload it again.",
        {"dataset_id": dataset_id},
    )


def format_bytes(n: int) -> str:
    mb = 1024 * 1024
    return f"{n // mb} MB" if n >= mb and n % mb == 0 else f"{n} bytes"


def file_too_large(limit: int) -> PayloadTooLargeError:
    return PayloadTooLargeError(
        "FILE_TOO_LARGE",
        f"The file exceeds the upload limit of {format_bytes(limit)}.",
        {"max_bytes": limit},
    )


def validate_csv_filename(filename: str | None) -> str:
    """Return the base filename (no directories) or raise INVALID_FILE_TYPE."""
    base = PurePath((filename or "").replace("\\", "/")).name.strip()
    if not base.lower().endswith(".csv") or len(base) <= len(".csv"):
        raise UnsupportedMediaTypeError(
            "INVALID_FILE_TYPE", "Only .csv files can be uploaded.", {"filename": base or None}
        )
    return base[:MAX_FILENAME_CHARS]


def display_name(filename: str) -> str:
    stem = filename[: -len(".csv")].strip()
    return (stem or "dataset")[:MAX_NAME_CHARS]


class DatasetService:
    def __init__(self, conn: sqlite3.Connection, files: FileStore, settings: Settings) -> None:
        self._repo = DatasetRepository(conn)
        self._files = files
        self._settings = settings

    # ---- ingestion ---------------------------------------------------------------------
    def create_from_upload(self, stream: BinaryIO, filename: str | None) -> DatasetDetail:
        original = validate_csv_filename(filename)
        tmp_path = self._files.new_tmp_file()
        try:
            self._copy_with_limit(stream, tmp_path)
            return self._ingest_tmp_file(tmp_path, original, display_name(original), "upload")
        finally:
            tmp_path.unlink(missing_ok=True)

    def create_from_sample(self, sample_id: str) -> DatasetDetail:
        sample = get_sample(sample_id)
        if sample is None:
            raise NotFoundError(
                "SAMPLE_NOT_FOUND", "Sample dataset not found.", {"sample_id": sample_id}
            )
        tmp_path = self._files.new_tmp_file()
        try:
            shutil.copyfile(sample.path, tmp_path)
            return self._ingest_tmp_file(tmp_path, sample.filename, sample.name, "sample")
        finally:
            tmp_path.unlink(missing_ok=True)

    def _copy_with_limit(self, stream: BinaryIO, dest: Path) -> int:
        """Copy the uploaded file, enforcing the limit on the file's own byte count."""
        limit = self._settings.max_upload_bytes
        total = 0
        with dest.open("wb") as out:
            while chunk := stream.read(COPY_CHUNK_BYTES):
                total += len(chunk)
                if total > limit:
                    raise file_too_large(limit)
                out.write(chunk)
        return total

    def _ingest_tmp_file(
        self, tmp_path: Path, original_filename: str, name: str, source: str
    ) -> DatasetDetail:
        data = tmp_path.read_bytes()
        loaded = load_csv_bytes(
            data, CsvLimits(self._settings.max_rows, self._settings.max_columns)
        )
        profile = profile_dataframe(loaded.frame)

        dataset_id = new_id()
        csv_path = self._files.dataset_csv_path(dataset_id)
        try:
            # Files first (atomically), then DB rows in one transaction (see storage/files.py).
            self._files.move_into_place(tmp_path, csv_path)
            self._files.write_bytes_atomic(
                self._files.dataset_profile_path(dataset_id),
                json.dumps(profile, allow_nan=False).encode("utf-8"),
            )
            record = DatasetRecord(
                id=dataset_id,
                name=name,
                original_filename=original_filename,
                source=source,
                file_path=self._files.relative(csv_path),
                file_size_bytes=len(data),
                sha256=sha256_file(csv_path),
                n_rows=profile["n_rows"],
                n_cols=profile["n_cols"],
                duplicate_rows=profile["duplicate_rows"],
                total_missing=profile["total_missing"],
                detected_encoding=loaded.fmt.encoding,
                detected_delimiter=loaded.fmt.delimiter,
                created_at=datetime.now(UTC).isoformat(),
            )
            columns = [
                ColumnRecord(
                    position=c["position"],
                    name=c["name"],
                    dtype=c["dtype"],
                    inferred_kind=c["inferred_kind"],
                    missing_count=c["missing_count"],
                    unique_count=c["unique_count"],
                )
                for c in profile["columns"]
            ]
            self._repo.create(record, columns)
        except BaseException:
            self._files.delete_dataset_files(dataset_id)
            raise
        return self._detail(record, columns, profile["warnings"])

    # ---- reads -------------------------------------------------------------------------
    def list_datasets(self) -> list[DatasetSummary]:
        return [self._summary(r) for r in self._repo.list_all()]

    def get_dataset(self, dataset_id: str) -> DatasetDetail:
        record = self._get_record(dataset_id)
        profile = self._read_profile(record)
        return self._detail(record, self._repo.get_columns(record.id), profile["warnings"])

    def get_profile(self, dataset_id: str) -> DatasetProfile:
        record = self._get_record(dataset_id)
        return DatasetProfile(dataset_id=record.id, **self._read_profile(record))

    def get_preview(self, dataset_id: str, offset: int, limit: int) -> DatasetPreview:
        record = self._get_record(dataset_id)
        csv_path = self._files.absolute(record.file_path)
        if not csv_path.is_file():
            raise _file_missing(record.id)
        fmt = CsvFormat(encoding=record.detected_encoding, delimiter=record.detected_delimiter)
        if offset >= record.n_rows:
            columns = [c.name for c in self._repo.get_columns(record.id)]
            rows: list[list[str | None]] = []
        else:
            columns, rows = read_preview_rows(csv_path, fmt, offset, limit)
        return DatasetPreview(
            dataset_id=record.id,
            columns=columns,
            rows=rows,
            offset=offset,
            limit=limit,
            total_rows=record.n_rows,
        )

    # ---- delete ------------------------------------------------------------------------
    def delete_dataset(self, dataset_id: str) -> None:
        record = self._get_record(dataset_id)
        model_ids = self._repo.get_model_ids(record.id)
        # DB first (cascades to columns/models/evaluations), then files.
        self._repo.delete(record.id)
        self._files.delete_dataset_files(record.id)
        for model_id in model_ids:
            self._files.delete_model_files(model_id)

    # ---- helpers -----------------------------------------------------------------------
    def _get_record(self, dataset_id: str) -> DatasetRecord:
        if not is_valid_id(dataset_id):
            raise _not_found(dataset_id)
        record = self._repo.get(dataset_id)
        if record is None:
            raise _not_found(dataset_id)
        return record

    def _read_profile(self, record: DatasetRecord) -> dict[str, Any]:
        path = self._files.dataset_profile_path(record.id)
        if not path.is_file():
            raise _file_missing(record.id)
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _summary(record: DatasetRecord) -> DatasetSummary:
        return DatasetSummary(
            id=record.id,
            name=record.name,
            original_filename=record.original_filename,
            source=record.source,  # type: ignore[arg-type]
            file_size_bytes=record.file_size_bytes,
            n_rows=record.n_rows,
            n_cols=record.n_cols,
            duplicate_rows=record.duplicate_rows,
            total_missing=record.total_missing,
            created_at=record.created_at,
        )

    def _detail(
        self,
        record: DatasetRecord,
        columns: list[ColumnRecord],
        warnings: list[dict[str, Any]],
    ) -> DatasetDetail:
        return DatasetDetail(
            **self._summary(record).model_dump(),
            detected_encoding=record.detected_encoding,
            detected_delimiter=record.detected_delimiter,
            columns=[ColumnSummary(**vars(c)) for c in columns],
            warnings=[DatasetWarning(**w) for w in warnings],
        )
