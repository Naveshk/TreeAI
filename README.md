# TreeAI

**An Interactive Random Forest Visualization and Prediction Platform.**

*Upload Your Data. Train Your Model. Understand Your Predictions.*

TreeAI lets you upload a CSV dataset, explore it, train a scikit-learn Random Forest,
evaluate it on held-out data, make predictions, and inspect how the individual decision
trees inside the forest reach their predictions.

> Status: **M0 – project setup.** Only the application skeleton exists so far.

## Tech stack

| Layer    | Technology                                   |
| -------- | -------------------------------------------- |
| Frontend | React, TypeScript, Vite, Tailwind CSS        |
| Backend  | Python 3.12, FastAPI, Uvicorn                |
| ML       | scikit-learn, pandas, NumPy (added in later milestones) |
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

## Project structure

```
TreeAI/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app factory; all routes under /api
│   │   ├── config.py          # settings from environment variables
│   │   └── api/routes/        # HTTP endpoints
│   └── tests/
└── frontend/
    └── src/
        ├── main.tsx · App.tsx
        ├── pages/
        └── test/
```

## Configuration

| Variable          | Default        | Purpose                                         |
| ----------------- | -------------- | ----------------------------------------------- |
| `TREEAI_DATA_DIR` | `<repo>/data`  | Where datasets, models and the SQLite DB live (used from M1) |

## Team

| Name            | Role            |
| --------------- | --------------- |
| *Team Member 1* | *Role*          |
| *Team Member 2* | *Role*          |
| *Team Member 3* | *Role*          |
