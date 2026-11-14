import { Fragment, useState } from "react";

import type {
  ColumnKind,
  ColumnProfile,
  DatasetDetail,
  DatasetProfile,
  JsonScalar,
} from "../../api/types";
import { useDatasetPreview } from "../../hooks/queries";
import {
  delimiterName,
  formatBytes,
  formatDateTime,
  formatInteger,
  formatNumber,
  formatPct100,
} from "../../lib/format";
import { COLUMN_KINDS } from "../../lib/misc";
import { ChevronDownIcon, ChevronRightIcon } from "../ui/icons";
import { Alert, Badge, Card, CardHeader, StatCard, cx } from "../ui/primitives";
import { EmptyState, ErrorState, LoadingState } from "../ui/states";
import { Pagination } from "../ui/widgets";

export function KindBadge({ kind }: { kind: ColumnKind }) {
  const meta = COLUMN_KINDS[kind];
  return (
    <Badge className={meta.className}>
      <span title={meta.description}>{meta.label}</span>
    </Badge>
  );
}

function scalar(value: JsonScalar): string {
  if (value === null) return "—";
  return typeof value === "number" ? formatNumber(value) : String(value);
}

const thClass = "px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-ink-faint";
const tdClass = "px-4 py-2.5 text-sm";

// ---- Overview ---------------------------------------------------------------------------
export function OverviewSection({ dataset, profile }: { dataset: DatasetDetail; profile: DatasetProfile }) {
  const kindCounts = new Map<ColumnKind, number>();
  for (const col of dataset.columns) {
    kindCounts.set(col.inferred_kind, (kindCounts.get(col.inferred_kind) ?? 0) + 1);
  }
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Rows" value={formatInteger(dataset.n_rows)} />
        <StatCard label="Columns" value={dataset.n_cols} />
        <StatCard
          label="Missing cells"
          value={formatInteger(profile.total_missing)}
          hint={`${formatPct100(profile.missing_pct, 2)} of all cells`}
        />
        <StatCard label="Duplicate rows" value={formatInteger(profile.duplicate_rows)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="File information" />
          <dl className="divide-y divide-navy-600 text-sm">
            {[
              ["Name", dataset.name],
              ["Original file", dataset.original_filename],
              ["Source", dataset.source === "sample" ? "Bundled sample" : "Uploaded"],
              ["File size", formatBytes(dataset.file_size_bytes)],
              ["Encoding", dataset.detected_encoding],
              ["Delimiter", delimiterName(dataset.detected_delimiter)],
              ["Added", formatDateTime(dataset.created_at)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 px-5 py-2.5">
                <dt className="text-ink-faint">{label}</dt>
                <dd className="truncate text-right text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Column types" description="Detected automatically from the values." />
          <ul className="space-y-3 p-5">
            {[...kindCounts.entries()].map(([kind, count]) => (
              <li key={kind} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <KindBadge kind={kind} />
                  <span className="text-xs text-ink-faint">{COLUMN_KINDS[kind].description}</span>
                </span>
                <span className="tabular text-sm text-ink">{count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ---- Columns ----------------------------------------------------------------------------
function ColumnDetails({ column }: { column: ColumnProfile }) {
  const stats = column.numeric_stats;
  return (
    <div className="grid gap-6 bg-navy-900/60 px-6 py-5 md:grid-cols-2">
      {stats && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Statistics</h4>
          <dl className="tabular mt-2 grid grid-cols-4 gap-x-4 gap-y-2 text-sm">
            {(
              [
                ["Mean", stats.mean],
                ["Std", stats.std],
                ["Min", stats.min],
                ["Max", stats.max],
                ["Q1", stats.q1],
                ["Median", stats.median],
                ["Q3", stats.q3],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-ink-faint">{label}</dt>
                <dd className="text-ink">{formatNumber(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {column.top_values && column.top_values.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Most frequent values</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {column.top_values.map((tv) => (
              <li key={String(tv.value)} className="flex justify-between gap-4">
                <span className="truncate font-mono text-ink">{scalar(tv.value)}</span>
                <span className="tabular text-ink-muted">{formatInteger(tv.count)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {column.datetime_range && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Date range</h4>
          <p className="mt-2 text-sm text-ink">
            {column.datetime_range.min ?? "—"} → {column.datetime_range.max ?? "—"}
          </p>
        </div>
      )}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Sample values</h4>
        <p className="mt-2 flex flex-wrap gap-1.5">
          {column.sample_values.length === 0 && <span className="text-sm text-ink-faint">No values</span>}
          {column.sample_values.map((v, i) => (
            <code key={i} className="rounded bg-navy-700 px-1.5 py-0.5 text-xs text-ink">
              {scalar(v)}
            </code>
          ))}
        </p>
      </div>
    </div>
  );
}

export function ColumnsSection({ profile }: { profile: DatasetProfile }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (position: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  return (
    <Card>
      <CardHeader title="Columns" description="Expand a column to see the statistics computed by the server." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-navy-600">
            <tr>
              <th className={thClass}>Column</th>
              <th className={thClass}>Type</th>
              <th className={thClass}>Data type</th>
              <th className={cx(thClass, "text-right")}>Missing</th>
              <th className={cx(thClass, "text-right")}>Unique</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-600">
            {profile.columns.map((column) => {
              const expanded = open.has(column.position);
              return (
                <Fragment key={column.position}>
                  <tr className="hover:bg-navy-700/40">
                    <td className={tdClass}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggle(column.position)}
                        className="flex items-center gap-2 font-mono text-ink hover:text-teal-200"
                      >
                        {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        {column.name}
                      </button>
                    </td>
                    <td className={tdClass}>
                      <KindBadge kind={column.inferred_kind} />
                    </td>
                    <td className={cx(tdClass, "font-mono text-ink-muted")}>{column.dtype}</td>
                    <td className={cx(tdClass, "tabular text-right text-ink-muted")}>
                      {formatInteger(column.missing_count)}
                    </td>
                    <td className={cx(tdClass, "tabular text-right text-ink-muted")}>
                      {formatInteger(column.unique_count)}
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <ColumnDetails column={column} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---- Preview ----------------------------------------------------------------------------
export const PAGE_SIZES = [25, 50, 100];

export function PreviewSection({
  datasetId,
  offset,
  limit,
  onPageChange,
}: {
  datasetId: string;
  offset: number;
  limit: number;
  onPageChange: (offset: number, limit: number) => void;
}) {
  const preview = useDatasetPreview(datasetId, offset, limit);
  return (
    <Card>
      <CardHeader title="Data preview" description="Values exactly as written in the file; empty cells are shown as missing." />
      {preview.isLoading && <LoadingState label="Loading rows…" />}
      {preview.isError && <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />}
      {preview.data && preview.data.total_rows === 0 && <EmptyState title="This dataset has no rows" />}
      {preview.data && preview.data.total_rows > 0 && (
        <>
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-navy-850">
                <tr>
                  <th className={cx(thClass, "w-14 text-right")}>#</th>
                  {preview.data.columns.map((c) => (
                    <th key={c} className={cx(thClass, "whitespace-nowrap font-mono normal-case")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-600/70">
                {preview.data.rows.map((row, r) => (
                  <tr key={preview.data.offset + r} className="hover:bg-navy-700/30">
                    <td className="tabular px-4 py-2 text-right text-xs text-ink-faint">
                      {preview.data.offset + r + 1}
                    </td>
                    {row.map((cell, c) => (
                      <td key={c} className="max-w-[16rem] px-4 py-2 font-mono text-xs">
                        {cell === null ? (
                          <span className="italic text-ink-faint">missing</span>
                        ) : (
                          <span className="block truncate text-ink" title={cell} tabIndex={cell.length > 32 ? 0 : -1}>
                            {cell}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-navy-600 px-5 py-3">
            <Pagination
              offset={preview.data.offset}
              limit={limit}
              total={preview.data.total_rows}
              pageSizes={PAGE_SIZES}
              onChange={onPageChange}
              busy={preview.isFetching}
            />
          </div>
        </>
      )}
    </Card>
  );
}

// ---- Data quality -----------------------------------------------------------------------
export function DataQualitySection({ profile }: { profile: DatasetProfile }) {
  const withMissing = profile.columns
    .filter((c) => c.missing_count > 0)
    .sort((a, b) => b.missing_count - a.missing_count);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Missing cells"
          value={formatInteger(profile.total_missing)}
          hint={`${formatPct100(profile.missing_pct, 2)} of ${formatInteger(profile.n_rows * profile.n_cols)} cells`}
        />
        <StatCard
          label="Columns with missing values"
          value={`${withMissing.length} / ${profile.n_cols}`}
        />
        <StatCard
          label="Duplicate rows"
          value={formatInteger(profile.duplicate_rows)}
          hint="Exact copies of an earlier row"
        />
      </div>
      <Card>
        <CardHeader title="Warnings" description="Issues detected by the server while profiling." />
        <div className="space-y-3 p-5">
          {profile.warnings.length === 0 ? (
            <Alert tone="success">No data-quality warnings for this dataset.</Alert>
          ) : (
            profile.warnings.map((w, i) => (
              <Alert key={`${w.code}-${i}`} tone="warning" title={w.code.replaceAll("_", " ").toLowerCase()}>
                {w.message}
              </Alert>
            ))
          )}
        </div>
      </Card>
      <Card>
        <CardHeader
          title="Missing values per column"
          description="Missing feature values are filled from the training data when a model is trained; rows with a missing target are dropped."
        />
        {withMissing.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">No column has missing values.</p>
        ) : (
          <ul className="space-y-3 p-5">
            {withMissing.map((c) => (
              <li key={c.position}>
                <div className="mb-1 flex justify-between gap-4 text-sm">
                  <span className="font-mono text-ink">{c.name}</span>
                  <span className="tabular text-ink-muted">
                    {formatInteger(c.missing_count)} · {formatPct100(c.missing_pct)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-navy-600">
                  <div
                    className={cx("h-full rounded-full", c.missing_pct > 50 ? "bg-amber-400" : "bg-teal-400")}
                    style={{ width: `${Math.min(100, c.missing_pct)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---- ML suitability ---------------------------------------------------------------------
function YesNo({ value }: { value: boolean }) {
  return value ? <Badge tone="green">Yes</Badge> : <Badge>No</Badge>;
}

export function MlSuitabilitySection({ profile }: { profile: DatasetProfile }) {
  const candidates = profile.columns.filter((c) => c.target.classification || c.target.regression);
  return (
    <div className="space-y-6">
      <Alert tone="info" title="These are recommendations, not a model configuration">
        Suggestions are computed from each column&apos;s statistics (type, number of distinct
        values, whether values are whole numbers). You choose and confirm the target column and
        task yourself in Model Configuration.
      </Alert>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Possible targets" value={candidates.length} />
        <StatCard
          label="Classification candidates"
          value={profile.columns.filter((c) => c.target.classification).length}
        />
        <StatCard
          label="Regression candidates"
          value={profile.columns.filter((c) => c.target.regression).length}
        />
      </div>
      <Card>
        <CardHeader title="Target suitability per column" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-navy-600">
              <tr>
                <th className={thClass}>Column</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Classification</th>
                <th className={thClass}>Regression</th>
                <th className={thClass}>Suggested task</th>
                <th className={cx(thClass, "text-right")}>Rows w/o target</th>
                <th className={thClass}>Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-600">
              {profile.columns.map((c) => (
                <tr key={c.position}>
                  <td className={cx(tdClass, "font-mono text-ink")}>{c.name}</td>
                  <td className={tdClass}>
                    <KindBadge kind={c.inferred_kind} />
                  </td>
                  <td className={tdClass}>
                    <YesNo value={c.target.classification} />
                  </td>
                  <td className={tdClass}>
                    <YesNo value={c.target.regression} />
                  </td>
                  <td className={tdClass}>
                    {c.target.suggested_task ? (
                      <Badge tone={c.target.suggested_task === "classification" ? "violet" : "sky"}>
                        {c.target.suggested_task}
                      </Badge>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className={cx(tdClass, "tabular text-right text-ink-muted")}>
                    {formatInteger(c.target.missing_target_rows)}
                  </td>
                  <td className={cx(tdClass, "text-xs text-ink-muted")}>{c.target.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
