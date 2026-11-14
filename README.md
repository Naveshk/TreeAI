# TreeMind AI

**An Interactive Random Forest Visualization and Prediction Platform.**

*Upload Your Data. Train Your Model. Understand Your Predictions.*

> Repository / internal project name: `TreeAI`. Product name: **TreeMind AI**.

TreeMind AI is an educational web application that opens up a Random Forest. Upload a CSV
(or use a bundled sample), explore it, train a scikit-learn Random Forest, evaluate it on
held-out data, make predictions, and then inspect **every individual decision tree** inside
the forest: its real splits, thresholds and leaves, the exact path your input takes through
it, and how all trees' answers combine into the final prediction.

Every metric, probability, tree structure, split, threshold, leaf and prediction path comes
from the actual trained scikit-learn model. Nothing is simulated or hard-coded.

## Features

| Area | What you can do |
| ---- | --------------- |
| **Home** | Project introduction, objective, workflow, team. |
| **Upload** | Drag-and-drop / pick a CSV (≤ 50 MB) with upload progress, or load Iris, Wine or Diabetes. Server-side validation messages are shown as-is. |
| **Workspace** | All datasets as cards (rows, columns, size, trained models), open or delete them. |
| **Dataset Explorer** | Overview, Columns (types + per-column statistics), Preview (paginated raw rows), Data Quality (missing values, duplicates, warnings), ML Suitability (classification/regression target candidates — recommendations only). |
| **Model Configuration** | Target, task, features (with numeric→categorical override), train/test split, stratification, seed and all main Random Forest hyperparameters, each explained. The target can never be a feature. |
| **Training & Evaluation** | Accuracy, precision, recall, F1 (macro + weighted), per-class table and confusion matrix — or MAE, RMSE, MSE, R² — all from the held-out test split. |
| **Prediction Studio** | A form generated from the model's features; predictions, class probabilities, filled-in values and out-of-range warnings. |
| **Forest Explorer** | Pick any tree; zoom/pan; expand/collapse; inspect nodes; enter an input to highlight its **real** decision path in every tree; per-tree votes or values; forest-level explanation (majority-vote view vs. scikit-learn's averaged probabilities, or the mean of the trees for regression). |

## Tech stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, React Router 8, TanStack Query 5, d3-hierarchy / d3-zoom |
| Backend  | Python 3.12, FastAPI, Uvicorn |
| ML / data | scikit-learn (RandomForestClassifier / RandomForestRegressor), pandas, NumPy |
| Storage  | SQLite (standard library) + files on disk |
| Tests    | pytest (backend), Vitest + Testing Library (frontend) |

## Prerequisites

- **uv** ≥ 0.5 — Python package/project manager (<https://docs.astral.sh/uv/>)
- **Node.js** ≥ 22.13 and **npm**

uv downloads and manages Python 3.12 in your home directory; the system Python is untouched.

## Setup

```bash
# Backend
cd backend
uv sync              # Python 3.12 + all dependencies into backend/.venv

# Frontend
cd ../frontend
npm install          # dependencies into frontend/node_modules
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
backend, so the browser only talks to one origin. API docs: <http://localhost:8000/docs>.

Run a single backend process (no `--workers`): startup clears `data/tmp/` and runs migrations.

## Try the complete workflow

1. Open <http://localhost:5173> → **Get Started**.
2. Load the **Iris** sample (or upload your own CSV). You land in the **Dataset Explorer**;
   browse the five tabs.
3. Click **Configure a model**. Keep the suggested target `species` and press
   **Train Random Forest** (100 trees, depth 10 by default).
4. On **Training & Evaluation**, read the test-set metrics and the confusion matrix.
5. Open **Prediction Studio**, press **Fill typical values**, then **Predict**.
6. Press **See how the trees decided**. The **Forest Explorer** explains the same input:
   tree votes, averaged probabilities, and the highlighted path in the selected tree.
   Click other trees, nodes and path steps; zoom and pan the tree.
7. Repeat with **Diabetes** (regression): the Forest Explorer shows each tree's value and
   how their average equals the forest's prediction.

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

## How the ML stays honest

- Only `RandomForestClassifier` / `RandomForestRegressor` are trained. Individual trees are
  `forest.estimators_[i]`; no standalone tree is ever trained.
- Rows with a missing **target** are dropped, then the data is split **before** anything is
  fitted. The preprocessing (median / most-frequent imputation, ordinal encoding of
  categories with unknown-category handling) lives inside one scikit-learn `Pipeline` fitted
  on the training split only, so evaluation is free of leakage.
- The same saved, fitted pipeline is used for evaluation, prediction and explanations.
- Prediction paths come from scikit-learn's `decision_path()` / `apply()`; split directions
  are never recomputed. Per-tree class labels are mapped through `forest.classes_`.
- The forest's `predict()` / `predict_proba()` is authoritative. Classification averages the
  trees' probabilities (soft voting); the majority-vote tally is shown as an educational
  view, and any disagreement is stated explicitly. Regression is the mean of the trees.
  Every explanation is checked to reproduce the model's output exactly.
- Model files are integrity-checked (SHA-256) and tied to the scikit-learn version.

## API

All endpoints live under `/api` (interactive docs at <http://localhost:8000/docs>).

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/api/health` | Liveness check |
| GET | `/api/samples` · POST `/api/samples/{id}/load` | List / load bundled samples |
| POST | `/api/datasets` | Upload a CSV (`multipart/form-data`, field `file`) |
| GET | `/api/datasets` · `/api/datasets/{id}` | List / detail |
| GET | `/api/datasets/{id}/preview?offset&limit` | Raw rows (limit 1–100) |
| GET | `/api/datasets/{id}/profile` | Types, missing values, statistics, target suitability |
| DELETE | `/api/datasets/{id}` | Delete a dataset and its models |
| POST | `/api/models` | Train a Random Forest |
| GET | `/api/models?dataset_id=` · `/api/models/{id}` | List / detail |
| GET | `/api/models/{id}/evaluation` | Held-out test metrics |
| GET | `/api/models/{id}/input-schema` | Feature definitions for prediction forms |
| POST | `/api/models/{id}/predict` | Prediction (+ class probabilities) |
| GET | `/api/models/{id}/trees` · `/api/models/{id}/trees/{index}` | Tree summaries / full tree |
| POST | `/api/models/{id}/explain` | Per-tree predictions, real paths, votes, aggregation |
| DELETE | `/api/models/{id}` | Delete a model |

Every error uses one JSON envelope:

```json
{"error": {"code": "TARGET_IN_FEATURES", "message": "The target column cannot also be a feature (that would leak the answer).", "details": {"target": "species"}}}
```

### CSV upload rules

- `.csv` only, at most **50 MB**, **200,000** data rows and **500** columns. Oversized
  bodies are rejected while streaming (also for chunked uploads without `Content-Length`).
- Encoding: UTF-8 (with/without BOM), then Windows-1252, then Latin-1 (a file mixing
  encodings is decoded with the fallback as a whole).
- Delimiter: comma, semicolon, tab or pipe (detected automatically).
- Header: at least 2 columns, non-blank, unique names. A pandas-style unnamed index column
  (`,a,b`) is rejected as a blank column name.
- Rows with extra values are rejected; empty trailing fields (`1,2,`) are accepted.
- `inf`, `-inf`, `1e309` in numeric columns count as missing values. The standard pandas
  markers (`NA`, `N/A`, `null`, `None`, empty) also mean missing.
- Column kinds: `numeric`, `categorical`, `boolean`, `datetime` (ISO-8601 only), `text`,
  `id_like` (text with all-unique values, or consecutive integers 1..n), `constant`.
  Date/time, text, ID-like and constant columns are not used as features.

### Sample datasets

Iris (classification), Wine (classification) and Diabetes (regression), exported from
scikit-learn's bundled datasets into `backend/app/samples/`.

## Project structure

```
TreeAI/
├── backend/
│   ├── app/
│   │   ├── main.py            # app factory; routes under /api; upload-limit middleware
│   │   ├── config.py · errors.py
│   │   ├── api/               # routes, dependencies, error handlers, upload limit
│   │   ├── schemas/           # Pydantic request/response models
│   │   ├── services/          # datasets, model training/management, inference
│   │   ├── ml/                # pandas/scikit-learn logic (no FastAPI/DB imports)
│   │   ├── storage/           # SQLite migrations + repositories, files, model store
│   │   └── samples/           # bundled sample CSVs
│   └── tests/                 # api/, ml/, storage/
└── frontend/
    └── src/
        ├── api/               # typed client, endpoints, XHR upload
        ├── hooks/             # TanStack Query hooks
        ├── components/        # ui/, layout/, explorer/, model/, forest/, home/
        ├── pages/             # one page per route
        ├── lib/               # formatting, tree layout, helpers
        ├── config/            # brand, team, upload limit
        └── test/              # render helpers, API mocks, fixtures
```

## Data storage

Runtime data lives in `data/` at the repository root (git-ignored), created on first start:

```
data/
├── treeai.db                    # SQLite metadata (WAL mode; -wal/-shm files are normal)
├── tmp/                         # in-progress uploads, cleared on every start
├── datasets/<id>/data.csv       # the original uploaded bytes
├── datasets/<id>/profile.json   # cached dataset profile
└── models/<id>/model.joblib     # trained pipeline (preprocessing + forest)
```

To start from scratch, stop the backend and delete `data/`.

**Known limitation (by design, no recovery system):** files are written before database
rows and removed after them. A crash between those steps can leave an orphaned folder,
which the API never shows and which is harmless. Files removed by hand are reported as
`DATASET_FILE_MISSING` / `MODEL_FILE_MISSING`; delete the item and recreate it.

## Configuration

| Variable              | Default       | Purpose |
| --------------------- | ------------- | ------- |
| `TREEAI_DATA_DIR`     | `<repo>/data` | Where datasets, models and the SQLite DB live |
| `TREEAI_MAX_UPLOAD_MB`| `50`          | Maximum CSV file size in MB (the frontend pre-check assumes 50) |
| `TREEAI_MAX_ROWS`     | `200000`      | Maximum number of data rows |
| `TREEAI_MAX_COLUMNS`  | `500`         | Maximum number of columns |

## Team

Edit `frontend/src/config/team.ts` to set names, roll numbers and roles.
