# TreeAI (product: TreeMind AI) – project rules for Claude Code

TreeMind AI: upload a CSV → explore → train a scikit-learn Random Forest → evaluate on held-out
data → predict → inspect the real decision trees inside the forest and the real prediction
path for a given input.

## Working agreement
- Report results (tests, type check, build) after each piece of work.
- Explain important commands before running them. No `sudo`, no system Python changes,
  no global npm installs, no destructive commands.
- Never overwrite an existing file without reading it first.
- Never commit without explicit approval; show `git status` and the file list first.
- If a command fails, stop and explain — do not apply unrelated workarounds.

## Scope (MVP only)
- In scope: Home, CSV upload + validation, Dataset Explorer, Model Configuration,
  Random Forest training, Evaluation, Prediction Studio, Forest Explorer with real
  prediction-path highlighting.
- Out of scope unless approved: Docker/nginx, auth, optional features (feature importance,
  ROC, histograms, OOB, downloads, batch prediction, model comparison, background jobs).
- No new dependency without approval. Installed:
  - Backend: fastapi, uvicorn, python-multipart, pandas, numpy, scikit-learn.
    Dev: pytest, httpx, ruff. SQLite via the standard-library `sqlite3` (no ORM).
  - Frontend: react, react-dom, react-router, @tanstack/react-query, d3-hierarchy, d3-zoom,
    d3-selection (+ @types). No chart library: small SVG/CSS bars render real API data.
    Dev: vite, typescript, tailwindcss, vitest, jsdom, Testing Library.

## ML rules (non-negotiable)
- Train ONLY `RandomForestClassifier` / `RandomForestRegressor`. Never train a standalone
  DecisionTree. Individual trees come only from `rf.estimators_`.
- One `sklearn.pipeline.Pipeline(preprocessor, forest)` is fitted once and saved as one
  artifact; the same fitted pipeline is used for evaluation and prediction.
- Prevent leakage: drop rows with missing target → `train_test_split` FIRST (stratified for
  classification) → fit the pipeline on the training split only → metrics on the test split only.
- Preprocessing: numeric → `SimpleImputer(median)`; categorical → `SimpleImputer(most_frequent)`
  + `OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)`; both imputers use
  `keep_empty_features=True` so transformed column order == input schema order.
- Categorical/boolean features and classification labels are normalised to strings with
  `ml/preprocessing.to_category_value` at training AND inference (`ml/inputs.py`).
- Prediction paths come from `tree.decision_path()` / `tree.apply()` on the pipeline-transformed
  input. Never recompute split directions yourself (sklearn compares in float32).
- Per-tree class labels: map tree outputs through `rf.classes_` (trees predict class indices).
- The forest's own `predict` / `predict_proba` is authoritative. Classification aggregates by
  averaging tree probabilities (soft voting); show the majority-vote tally as an explanation
  and flag disagreement. Regression = mean of tree predictions.
- Any explanation must reproduce the model output (`np.allclose`); otherwise return an error.
- Never hardcode, fabricate or estimate predictions, metrics, trees or paths.

## Architecture
- Backend layers: `api/routes` → `services` → `ml` / `storage`.
  `ml/` contains pure pandas/sklearn logic: no FastAPI, no DB imports.
- All routes live under `/api`. Errors use one envelope:
  `{"error": {"code": "...", "message": "...", "details": {...}}}`.
  Raise `app.errors.AppError` subclasses (no FastAPI imports, usable from any layer);
  `app/api/error_handlers.py` converts them. Unhandled exceptions → 500 `INTERNAL_ERROR`
  with a generic message; details only in the server log.
- SQLite schema changes: append a new entry to `MIGRATIONS` in `app/storage/schema.py`.
  Never edit a released migration. No BEGIN/COMMIT/PRAGMA inside migrations.
- CSV parsing goes only through `app/ml/csv_loader.parse_csv_text` with the encoding and
  delimiter recorded at upload (`load_dataset_frame` for full datasets). Uploads and samples
  share one ingestion pipeline (`DatasetService._ingest_tmp_file`).
- File/DB consistency: write files first, then DB rows; on delete remove DB rows first,
  then files. Clean up on failure. No recovery system (documented in README).
- Frontend: URL holds workflow state (`/datasets/:id`, `/datasets/:id/train`, `/models/:id`,
  `/models/:id/predict`, `/models/:id/forest`, `?tab=`, `?offset=&limit=`, `?tree=`).
  All server data goes through `src/hooks/queries.ts` (TanStack Query) and `src/api/`;
  components never call `fetch`. D3 computes layout, React renders SVG. No global state lib.
- Workspace nav items are links only when their prerequisite exists (dataset / ready model);
  otherwise they are `aria-disabled` text. Never add placeholder buttons or fake data.
- Upload size: `api/upload_limit.UploadLimitMiddleware` (ASGI, counts streamed bytes) +
  exact per-file check in `DatasetService`. Frontend pre-checks 50 MB only.
- Dev: Vite proxies `/api` → `http://localhost:8000`. No CORS middleware unless needed.
- Runtime data lives in `data/` (gitignored): SQLite DB, datasets, model artifacts.
  Files are named by UUID, never by user-supplied filenames.

## Commands
```bash
# backend (run from backend/)
uv run uvicorn app.main:app --reload --port 8000
uv run pytest
uv run ruff check . && uv run ruff format --check .

# frontend (run from frontend/)
npm run dev
npm test
npm run typecheck
npm run build
```

## Definition of done (every milestone)
- Backend: `uv run pytest` and `uv run ruff check .` pass.
- Frontend: `npm test`, `npm run typecheck`, `npm run build` pass.
- New behaviour has tests; ML changes include correctness tests against sklearn output.
- README updated when setup or usage changes.

## Milestones
M0 setup · M1 storage + error envelope · M2 dataset backend · M3 frontend shell + upload/explorer ·
M4 training backend · M5 config + evaluation UI · M6 prediction · M7 forest backend ·
M8 Forest Explorer UI · M9 hardening + README.

Status: M0–M9 implemented (Batch A committed; M3–M9 built autonomously, see
PROJECT_PROGRESS.md). Sample datasets: Iris, Wine, Diabetes only (Titanic deferred).
