import { useId, useRef, useState, type DragEvent } from "react";
import { useNavigate } from "react-router";

import { userMessage } from "../api/client";
import type { SampleInfo } from "../api/types";
import { FileIcon, UploadIcon } from "../components/ui/icons";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ProgressBar,
  Spinner,
  cx,
} from "../components/ui/primitives";
import { ErrorState, LoadingState } from "../components/ui/states";
import { MAX_UPLOAD_BYTES } from "../config/limits";
import { useLoadSample, useSamples } from "../hooks/queries";
import { useUploadDataset, type UploadState } from "../hooks/useUploadDataset";
import { formatBytes } from "../lib/format";
import { validateCsvFile } from "../lib/misc";

function UploadStatus({ state, onRetry }: { state: UploadState; onRetry: () => void }) {
  switch (state.phase) {
    case "uploading":
      return (
        <div className="space-y-2" aria-live="polite">
          <div className="flex justify-between text-sm">
            <span className="text-ink">Uploading file…</span>
            <span className="tabular text-ink-muted">{state.percent}%</span>
          </div>
          <ProgressBar value={state.percent} label="File upload progress" />
        </div>
      );
    case "processing":
      return (
        <p aria-live="polite" className="flex items-center gap-2 text-sm text-ink">
          <Spinner className="text-teal-300" />
          Processing on server… validating and profiling your CSV.
        </p>
      );
    case "success":
      return (
        <Alert tone="success" title="Upload completed">
          {state.dataset.name} · {state.dataset.n_rows.toLocaleString("en-US")} rows ×{" "}
          {state.dataset.n_cols} columns. Opening the Dataset Explorer…
        </Alert>
      );
    case "error":
      return (
        <Alert
          tone="error"
          title="Upload failed"
          action={
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Retry
            </Button>
          }
        >
          {state.message}
        </Alert>
      );
    default:
      return null;
  }
}

function UploadCard() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { state, upload, reset } = useUploadDataset();
  const [file, setFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = state.phase === "uploading" || state.phase === "processing";

  const choose = (selected: File | undefined) => {
    if (!selected) return;
    reset();
    setFile(selected);
    setClientError(validateCsvFile(selected));
  };

  const start = async () => {
    if (!file || clientError) return;
    const dataset = await upload(file);
    if (dataset) navigate(`/datasets/${dataset.id}`);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!busy) choose(event.dataTransfer.files[0]);
  };

  return (
    <Card>
      <CardHeader
        title="Upload a CSV file"
        description={`CSV files up to ${formatBytes(MAX_UPLOAD_BYTES)}. The server validates the structure, encoding and size limits.`}
      />
      <div className="space-y-4 p-5">
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-teal-400 bg-teal-400/5" : "border-navy-500 hover:border-teal-400/60",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-navy-700 text-teal-300">
            <UploadIcon width={22} height={22} />
          </span>
          <span className="mt-4 text-sm font-medium text-ink">
            Drag and drop a CSV here, or <span className="text-teal-300 underline">browse</span>
          </span>
          <span className="mt-1 text-xs text-ink-faint">Comma, semicolon, tab or pipe separated</span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>

        {file && (
          <div className="flex items-center gap-3 rounded-lg bg-navy-900 px-4 py-3">
            <FileIcon className="shrink-0 text-ink-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink" data-testid="selected-file">
                {file.name}
              </p>
              <p className="text-xs text-ink-faint">{formatBytes(file.size)}</p>
            </div>
            <Button onClick={start} disabled={busy || Boolean(clientError) || state.phase === "success"}>
              {busy ? "Uploading…" : "Upload"}
            </Button>
          </div>
        )}

        {clientError && <Alert tone="error">{clientError}</Alert>}
        <UploadStatus state={state} onRetry={start} />
      </div>
    </Card>
  );
}

function SampleCard({ sample }: { sample: SampleInfo }) {
  const navigate = useNavigate();
  const load = useLoadSample();
  return (
    <li className="flex flex-col rounded-xl border border-navy-600 bg-navy-900/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-ink">{sample.name}</h3>
        <Badge tone={sample.task_type === "classification" ? "violet" : "sky"}>
          {sample.task_type === "classification" ? "Classification" : "Regression"}
        </Badge>
      </div>
      <p className="mt-2 flex-1 text-sm text-ink-muted">{sample.description}</p>
      <p className="mt-3 text-xs text-ink-faint">
        Target: <span className="font-mono text-ink-muted">{sample.target_column}</span>
      </p>
      {load.isError && (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {userMessage(load.error)}
        </p>
      )}
      <Button
        variant="secondary"
        className="mt-4"
        disabled={load.isPending}
        onClick={() =>
          load.mutate(sample.id, { onSuccess: (dataset) => navigate(`/datasets/${dataset.id}`) })
        }
      >
        {load.isPending ? (
          <>
            <Spinner /> Loading…
          </>
        ) : (
          `Load ${sample.name}`
        )}
      </Button>
    </li>
  );
}

function SamplesCard() {
  const samples = useSamples();
  return (
    <Card>
      <CardHeader
        title="Or start with a sample dataset"
        description="Bundled datasets that go through exactly the same validation and profiling as uploads."
      />
      <div className="p-5">
        {samples.isLoading && <LoadingState label="Loading sample datasets…" />}
        {samples.isError && <ErrorState error={samples.error} onRetry={() => void samples.refetch()} />}
        {samples.data && (
          <ul className="grid gap-4 md:grid-cols-3">
            {samples.data.map((sample) => (
              <SampleCard key={sample.id} sample={sample} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-300">Step 1</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">Add a dataset</h1>
        <p className="mt-2 text-ink-muted">
          Upload your own CSV or load a sample. You will land in the Dataset Explorer once it is
          ready.
        </p>
      </div>
      <UploadCard />
      <SamplesCard />
    </div>
  );
}
