# TreeMind AI – implementation progress

Last commit: `3e3cc5d` (Batch A: M1 + M2). M3–M9 below are implemented and verified but
**not committed** (commits need the owner's explicit approval).

## Status
| Milestone | Status |
|---|---|
| M0 setup · M1 storage · M2 dataset backend | ✅ committed |
| M4–M5 training + evaluation (backend + UI) | ✅ implemented, tested |
| M6 Prediction Studio (backend + UI) | ✅ implemented, tested |
| M7–M8 tree extraction, explanations, Forest Explorer | ✅ implemented, tested |
| M3 frontend: Home, Upload, Workspace, Dataset Explorer | ✅ implemented, tested |
| M9 integration, streaming upload limit, code-splitting, docs | ✅ done |

## Verification (final run)
- Backend: `uv run pytest` → 266 passed; `ruff check` / `ruff format --check` clean.
- Frontend: `npm test` → 48 passed; `npm run typecheck` clean; `npm run build` OK
  (main chunk 391 kB / 122 kB gzip; workspace pages lazy-loaded).
- End-to-end through the Vite proxy: Iris, Wine, Diabetes and a messy uploaded CSV
  (trailing commas, missing values, `inf`, booleans, dates, IDs): upload → explore →
  train → evaluate → predict → explain; predict == explain, per-tree consistency checks
  pass; real-browser runs (headless Firefox via WebDriver) reported no JS errors.
- Streaming upload limit verified on a real uvicorn server: a slow 5 MiB chunked upload
  against a 1 MB limit got 413 after 1.06 MiB.

## Decisions (autonomous phase)
- Backend ML built first so the frontend only displays real model output.
- Dependencies added: backend `scikit-learn` 1.9.1 (+ joblib, scipy, threadpoolctl,
  narwhals, cloudpickle); frontend `react-router` 8.5.1, `@tanstack/react-query` 5.107.1,
  `d3-hierarchy`, `d3-zoom`, `d3-selection` (+ `@types`). No chart library.
- No `/api/models/validate`: `POST /api/models` validates and returns 422 codes.
- Categorical/boolean features and class labels normalised to strings
  (`to_category_value`) so inference values always match training categories.
- Imputers use `keep_empty_features=True` (stable transformed-column ↔ feature mapping).
- Data-caused training errors (422) delete the model row; unexpected errors mark it `failed`.
- Workspace nav: model pages link to the URL's model or the dataset's latest ready model;
  without one they are disabled text ("Train a model first"), never fake links.
- Upload limit moved from header-only middleware to an ASGI middleware that counts
  streamed bytes (M9 item from the Batch A review).

## Known limitations
- Orphaned files possible after a crash between file and DB steps (documented, harmless).
- Single uvicorn worker assumed (startup clears `data/tmp/`, runs migrations).
- Training is synchronous (no background jobs / progress bar) — fine for the size limits.
- Frontend upload pre-check assumes the default 50 MB backend limit.
- Text values `NA`/`null`/`None` are treated as missing (pandas defaults).
- `httpx` deprecation warning from Starlette's TestClient (kept by decision).
- Model cache entries of a deleted dataset's models stay in memory until evicted (LRU of 3);
  they are unreachable because the DB rows are gone.

## Next steps (optional, not started)
Commit M3–M9 after review; optional features (feature importance, ROC, batch prediction,
model comparison) remain out of scope.
