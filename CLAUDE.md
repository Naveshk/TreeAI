# TreeAI – project rules for Claude Code

TreeAI: upload a CSV → explore → train a scikit-learn Random Forest → evaluate on held-out
data → predict → inspect the real decision trees inside the forest and the real prediction
path for a given input.

## Working agreement
- Work milestone by milestone (M0–M9, see "Milestones"). Stop after each milestone, report
  results (tests, type check, build), and wait for explicit approval before the next one.
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
- No new dependency without approval. Approved plan:
  - Backend: fastapi, uvicorn, python-multipart (M2), pandas, numpy, scikit-learn.
    Dev: pytest, httpx, ruff. SQLite via the standard-library `sqlite3` (no ORM).
  - Frontend: react, react-dom, react-router (M3), @tanstack/react-query (M3), d3 (M8),
    recharts (M5). Dev: vite, typescript, tailwindcss, vitest, jsdom, Testing Library.

## ML rules (non-negotiable)
- Train ONLY `RandomForestClassifier` / `RandomForestRegressor`. Never train a standalone
  DecisionTree. Individual trees come only from `rf.estimators_`.
- One `sklearn.pipeline.Pipeline(preprocessor, forest)` is fitted once and saved as one
  artifact; the same fitted pipeline is used for evaluation and prediction.
- Prevent leakage: drop rows with missing target → `train_test_split` FIRST (stratified for
  classification) → fit the pipeline on the training split only → metrics on the test split only.
- Preprocessing: numeric → `SimpleImputer(median)`; categorical → `SimpleImputer(most_frequent)`
  + `OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1)`.
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
- Frontend: URL holds workflow state (`/datasets/:id`, `/models/:id/...`). D3 computes layout,
  React renders SVG. No global state library.
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

Milestones are grouped into approved batches (Batch A = M1 + M2). M4 adds
`ModelRepository` / `EvaluationRepository` (tables already exist in migration 1).
Sample datasets: Iris, Wine, Diabetes only (Titanic deferred).
