import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import type { DatasetSummary, ModelSummary } from "../api/types";
import { DeleteButton } from "../components/DeleteButton";
import { GridIcon, UploadIcon } from "../components/ui/icons";
import { Alert, Badge, ButtonLink, Card, PageHeader } from "../components/ui/primitives";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/states";
import { useDatasetList, useDeleteDataset, useModelList } from "../hooks/queries";
import { formatBytes, formatDateTime, formatInteger } from "../lib/format";

function DatasetCard({ dataset, models }: { dataset: DatasetSummary; models: ModelSummary[] }) {
  const remove = useDeleteDataset();
  const ready = models.filter((m) => m.status === "ready").length;
  return (
    <li>
      <Card className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <Link
            to={`/datasets/${dataset.id}`}
            className="min-w-0 truncate text-base font-semibold text-ink hover:text-teal-200"
          >
            {dataset.name}
          </Link>
          <Badge tone={dataset.source === "sample" ? "teal" : "neutral"}>
            {dataset.source === "sample" ? "Sample" : "Uploaded"}
          </Badge>
        </div>
        <p className="mt-1 truncate text-xs text-ink-faint">{dataset.original_filename}</p>
        <dl className="tabular mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-ink-faint">Rows</dt>
            <dd className="text-ink">{formatInteger(dataset.n_rows)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Columns</dt>
            <dd className="text-ink">{dataset.n_cols}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Size</dt>
            <dd className="text-ink">{formatBytes(dataset.file_size_bytes)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Trained models</dt>
            <dd className="text-ink">{ready}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-ink-faint">Added {formatDateTime(dataset.created_at)}</p>
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-navy-600 pt-4">
          <ButtonLink to={`/datasets/${dataset.id}`} size="sm">
            Open
          </ButtonLink>
          <DeleteButton
            label={`Delete ${dataset.name}`}
            title={`Delete “${dataset.name}”?`}
            description="This permanently removes the dataset file, its profile and every model trained on it."
            pending={remove.isPending}
            error={remove.error}
            onConfirm={(close) => remove.mutate(dataset.id, { onSuccess: close })}
          />
        </div>
      </Card>
    </li>
  );
}

export default function WorkspacePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const datasets = useDatasetList();
  const models = useModelList();
  const [notice, setNotice] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null,
  );

  const dismiss = () => {
    setNotice(null);
    navigate(location.pathname, { replace: true, state: null });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Workspace"
        title="Your datasets"
        description="Open a dataset to explore it, train Random Forest models and inspect their trees."
        actions={
          <ButtonLink to="/upload">
            <UploadIcon /> Add dataset
          </ButtonLink>
        }
      />
      {notice && (
        <div className="mb-6">
          <Alert
            tone="success"
            action={
              <button type="button" className="text-xs underline" onClick={dismiss}>
                Dismiss
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      )}
      {datasets.isLoading && <LoadingState label="Loading datasets…" />}
      {datasets.isError && (
        <Card>
          <ErrorState error={datasets.error} onRetry={() => void datasets.refetch()} />
        </Card>
      )}
      {datasets.data && datasets.data.length === 0 && (
        <Card>
          <EmptyState
            icon={<GridIcon />}
            title="No datasets yet"
            description="Upload a CSV or load one of the sample datasets to get started."
            action={<ButtonLink to="/upload">Add a dataset</ButtonLink>}
          />
        </Card>
      )}
      {datasets.data && datasets.data.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {datasets.data.map((dataset) => (
            <DatasetCard
              key={dataset.id}
              dataset={dataset}
              models={(models.data ?? []).filter((m) => m.dataset_id === dataset.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
