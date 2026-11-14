"""Versioned SQLite schema migrations.

MIGRATIONS[i] upgrades the schema from version i to version i + 1
(tracked in `PRAGMA user_version`).

Rules:
- Never edit a migration that has already been released; append a new one instead.
- Do not put BEGIN/COMMIT or PRAGMA statements here; `database.init_db` wraps each
  migration in its own transaction together with the version bump.
"""

MIGRATION_001_INITIAL = """
CREATE TABLE datasets (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    original_filename  TEXT NOT NULL,
    source             TEXT NOT NULL CHECK (source IN ('upload', 'sample')),
    file_path          TEXT NOT NULL,
    file_size_bytes    INTEGER NOT NULL,
    sha256             TEXT NOT NULL,
    n_rows             INTEGER NOT NULL,
    n_cols             INTEGER NOT NULL,
    duplicate_rows     INTEGER NOT NULL,
    total_missing      INTEGER NOT NULL,
    detected_encoding  TEXT NOT NULL,
    detected_delimiter TEXT NOT NULL,
    created_at         TEXT NOT NULL
);

CREATE TABLE dataset_columns (
    dataset_id    TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    name          TEXT NOT NULL,
    dtype         TEXT NOT NULL,
    inferred_kind TEXT NOT NULL,
    missing_count INTEGER NOT NULL,
    unique_count  INTEGER NOT NULL,
    PRIMARY KEY (dataset_id, position),
    UNIQUE (dataset_id, name)
);

CREATE TABLE models (
    id                          TEXT PRIMARY KEY,
    dataset_id                  TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    name                        TEXT NOT NULL,
    task_type                   TEXT NOT NULL
                                CHECK (task_type IN ('classification', 'regression')),
    target_column               TEXT NOT NULL,
    feature_columns_json        TEXT NOT NULL,
    column_types_json           TEXT NOT NULL,
    hyperparameters_json        TEXT NOT NULL,
    test_size                   REAL NOT NULL,
    random_state                INTEGER NOT NULL,
    stratified                  INTEGER NOT NULL,
    status                      TEXT NOT NULL CHECK (status IN ('training', 'ready', 'failed')),
    error_message               TEXT,
    classes_json                TEXT,
    input_schema_json           TEXT,
    n_train                     INTEGER,
    n_test                      INTEGER,
    rows_dropped_missing_target INTEGER,
    artifact_path               TEXT,
    artifact_sha256             TEXT,
    sklearn_version             TEXT,
    train_duration_ms           INTEGER,
    created_at                  TEXT NOT NULL
);

CREATE INDEX idx_models_dataset ON models(dataset_id);

CREATE TABLE evaluations (
    model_id     TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
    split        TEXT NOT NULL DEFAULT 'test',
    n_samples    INTEGER NOT NULL,
    metrics_json TEXT NOT NULL,
    created_at   TEXT NOT NULL
);
"""

MIGRATIONS: tuple[str, ...] = (MIGRATION_001_INITIAL,)
