# TreeAI

**An Interactive Random Forest Visualization and Prediction Platform.**

*Upload Your Data. Train Your Model. Understand Your Predictions.*

TreeAI lets you upload a CSV dataset, explore it, train a scikit-learn Random Forest,
evaluate it on held-out data, make predictions, and inspect how the individual decision
trees inside the forest reach their predictions.

> Status: **Batch A (M1 + M2) – storage foundation and dataset backend.** The backend can
> ingest, validate, profile, preview and delete CSV datasets. The frontend is still a
> placeholder page.

## Tech stack

| Layer    | Technology                                   |
| -------- | -------------------------------------------- |
| Frontend | React, TypeScript, Vite, Tailwind CSS        |
| Backend  | Python 3.12, FastAPI, Uvicorn                |
| Data     | pandas, NumPy, SQLite (Python standard library) |
| ML       | scikit-learn (added in M4)                   |
| Tests    | pytest (backend), Vitest + Testing Library (frontend) |

## Prerequisites

- **uv** ≥ 0.5 — Python package/project manager (<https://docs.astral.sh/uv/>)
- **Node.js** ≥ 22.13 and **npm**

You do **not** need to install Python 3.12 yourself — uv downloads and manages it
inside your home directory without touching the system Python.

## Setup

```bash
# Backend
cd backend
uv sync              # installs Python 3.12 (if needed) and all dependencies into backend/.venv

# Frontend
cd ../frontend
npm install          # installs dependencies into frontend/node_modules
```

## Run locally (two terminals)

**Terminal 1 – backend** (http://localhost:8000):

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

**Terminal 2 – frontend** (http://localhost:5173):

```bash
cd frontend
npm run dev
```

Open <http://localhost:5173>. The Vite dev server forwards every `/api/*` request to the
backend, so the browser only talks to one origin.

Quick check that the backend is up: <http://localhost:5173/api/health> should return
`{"status":"ok","version":"0.1.0"}`. Interactive API docs: <http://localhost:8000/docs>.

## Tests and checks

```bash
# Backend
cd backend
uv run pytest            # tests
uv run ruff check .      # lint
uv run ruff format .     # auto-format

# Frontend
cd frontend
npm test                 # Vitest (single run)
npm run typecheck        # TypeScript
npm run build            # type check + production build into frontend/dist
```

## API (so far)

All endpoints live under `/api`. Interactive docs: <http://localhost:8000/docs>.

| Method | Path                                   | Purpose                                     |
| ------ | -------------------------------------- | ------------------------------------------- |
| GET    | `/api/health`                          | Liveness check                              |
| GET    | `/api/samples`                         | List bundled sample datasets                |
| POST   | `/api/samples/{sample_id}/load`        | Load a sample (same pipeline as an upload)  |
| POST   | `/api/datasets`                        | Upload a CSV (`multipart/form-data`, field `file`) |
| GET    | `/api/datasets`                        | List datasets (newest first)                |
| GET    | `/api/datasets/{id}`                   | Dataset metadata, columns and warnings      |
| GET    | `/api/datasets/{id}/preview?offset=0&limit=50` | Rows as written in the file (limit 1–100) |
| GET    | `/api/datasets/{id}/profile`           | Types, missing values, duplicates, statistics, target suitability |
| DELETE | `/api/datasets/{id}`                   | Delete a dataset, its files and its models  |

Every error uses one JSON envelope:

```json
{"error": {"code": "DUPLICATE_COLUMNS", "message": "Column names must be unique. Duplicated: a.", "details": {"duplicates": ["a"]}}}
```

### CSV upload rules

- `.csv` files only, at most **50 MB**, **200,000** data rows and **500** columns.
- Encoding: UTF-8 (with or without BOM), falling back to Windows-1252, then Latin-1.
- Delimiter: comma, semicolon, tab or pipe (detected automatically).
- The header row must have at least 2 columns, with non-blank and unique names.
- Column kinds are inferred as `numeric`, `categorical`, `boolean`, `datetime` (ISO-8601
  only), `text`, `id_like` or `constant`.

### Sample datasets

Iris (classification), Wine (classification) and Diabetes (regression), exported from
scikit-learn's bundled datasets into `backend/app/samples/`.

## Project structure

```
TreeAI/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app factory; all routes under /api
│   │   ├── config.py          # settings from environment variables
│   │   ├── errors.py          # domain exceptions (no FastAPI imports)
│   │   ├── api/               # routes, dependencies, error handlers, upload limit
│   │   ├── schemas/           # Pydantic request/response models
│   │   ├── services/          # use cases (dataset ingestion, reads, delete)
│   │   ├── ml/                # pure pandas logic: CSV loading, type inference, profiling
│   │   ├── storage/           # SQLite (migrations, repositories) and file storage
│   │   └── samples/           # bundled sample CSVs
│   └── tests/                 # api/, ml/, storage/
└── frontend/
    └── src/
        ├── main.tsx · App.tsx
        ├── pages/
        └── test/
```

## Data storage

Runtime data lives in `data/` at the repository root (git-ignored). It is created on
the first backend start:

```
data/
├── treeai.db                    # SQLite metadata (WAL mode; -wal/-shm files are normal)
├── tmp/                         # in-progress uploads, cleared on every start
├── datasets/<id>/data.csv       # the original uploaded bytes
├── datasets/<id>/profile.json   # cached dataset profile
└── models/<id>/                 # trained models (from M4)
```

To start from scratch, stop the backend and delete the `data/` folder.

**Known limitation (by design, no recovery system):** files are written before the
database row and removed after it. If the backend crashes between those two steps, an
orphaned folder may remain under `data/datasets/`. Orphans are never shown by the API
and are harmless. A dataset whose files were removed manually is reported with the
error `DATASET_FILE_MISSING`; delete it and upload it again.

## Configuration

| Variable              | Default       | Purpose                                       |
| --------------------- | ------------- | --------------------------------------------- |
| `TREEAI_DATA_DIR`     | `<repo>/data` | Where datasets, models and the SQLite DB live |
| `TREEAI_MAX_UPLOAD_MB`| `50`          | Maximum CSV file size in MB                   |
| `TREEAI_MAX_ROWS`     | `200000`      | Maximum number of data rows                   |
| `TREEAI_MAX_COLUMNS`  | `500`         | Maximum number of columns                     |

## Team

| Name            | Role            |
| --------------- | --------------- |
| *Team Member 1* | *Role*          |
| *Team Member 2* | *Role*          |
| *Team Member 3* | *Role*          |
