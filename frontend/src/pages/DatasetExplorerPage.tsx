import { useNavigate, useParams, useSearchParams } from "react-router";

import { isNotFound } from "../api/client";
import { DeleteButton } from "../components/DeleteButton";
import {
  ColumnsSection,
  DataQualitySection,
  MlSuitabilitySection,
  OverviewSection,
  PAGE_SIZES,
  PreviewSection,
} from "../components/explorer/sections";
import { SlidersIcon } from "../components/ui/icons";
import { ButtonLink, Card, PageHeader } from "../components/ui/primitives";
import { ErrorState, LoadingState } from "../components/ui/states";
import { Tabs, type TabItem } from "../components/ui/widgets";
import { useDataset, useDatasetProfile, useDeleteDataset } from "../hooks/queries";

type TabId = "overview" | "columns" | "preview" | "quality" | "suitability";
const TABS: TabItem<TabId>[] = [
  { id: "overview", label: "Overview" },
  { id: "columns", label: "Columns" },
  { id: "preview", label: "Preview" },
  { id: "quality", label: "Data Quality" },
  { id: "suitability", label: "ML Suitability" },
];

function readInt(value: string | null, fallback: number, allowed?: number[]): number {
  const n = Number(value);
  if (value === null || !Number.isInteger(n) || n < 0) return fallback;
  if (allowed && !allowed.includes(n)) return fallback;
  return n;
}

export default function DatasetExplorerPage() {
  const { datasetId = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const dataset = useDataset(datasetId);
  const profile = useDatasetProfile(datasetId);
  const remove = useDeleteDataset();

  const tabParam = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "overview";
  const limit = readInt(params.get("limit"), PAGE_SIZES[0]!, PAGE_SIZES);
  const offset = readInt(params.get("offset"), 0);

  const update = (next: Record<string, string>) =>
    setParams((prev) => {
      const merged = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(next)) merged.set(k, v);
      return merged;
    });

  const error = dataset.error ?? profile.error;
  if (error) {
    return (
      <Card>
        <ErrorState
          error={error}
          title={isNotFound(error) ? "Dataset not found" : "Could not load this dataset"}
          onRetry={isNotFound(error) ? undefined : () => void Promise.all([dataset.refetch(), profile.refetch()])}
          action={<ButtonLink to="/workspace" variant="secondary">Back to workspace</ButtonLink>}
        />
      </Card>
    );
  }
  if (!dataset.data || !profile.data) return <LoadingState label="Loading dataset…" />;

  const d = dataset.data;
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Dataset Explorer"
        title={d.name}
        description={`${d.n_rows.toLocaleString("en-US")} rows × ${d.n_cols} columns · ${d.original_filename}`}
        actions={
          <>
            <DeleteButton
              size="md"
              label={`Delete ${d.name}`}
              title={`Delete “${d.name}”?`}
              description="This permanently removes the dataset file, its profile and every model trained on it. This cannot be undone."
              pending={remove.isPending}
              error={remove.error}
              onConfirm={() =>
                remove.mutate(d.id, {
                  onSuccess: () =>
                    navigate("/workspace", { state: { notice: `Dataset “${d.name}” was deleted.` } }),
                })
              }
            />
            <ButtonLink to={`/datasets/${d.id}/train`}>
              <SlidersIcon /> Configure a model
            </ButtonLink>
          </>
        }
      />
      <Tabs label="Dataset sections" tabs={TABS} active={tab} onChange={(id) => update({ tab: id })} />
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-6">
        {tab === "overview" && <OverviewSection dataset={d} profile={profile.data} />}
        {tab === "columns" && <ColumnsSection profile={profile.data} />}
        {tab === "preview" && (
          <PreviewSection
            datasetId={d.id}
            offset={offset}
            limit={limit}
            onPageChange={(o, l) => update({ offset: String(o), limit: String(l) })}
          />
        )}
        {tab === "quality" && <DataQualitySection profile={profile.data} />}
        {tab === "suitability" && <MlSuitabilitySection profile={profile.data} />}
      </div>
    </div>
  );
}
