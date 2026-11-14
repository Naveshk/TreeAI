import { useEffect, useId, useState, type ComponentType, type SVGProps } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { BRAND_NAME } from "../../config/site";
import { useDatasetList } from "../../hooks/queries";
import { Logo } from "../brand/Logo";
import {
  ChartIcon,
  CloseIcon,
  GridIcon,
  MenuIcon,
  SlidersIcon,
  TableIcon,
  TargetIcon,
  TreeIcon,
  UploadIcon,
} from "../ui/icons";
import { ButtonLink, cx, inputBaseClass } from "../ui/primitives";
import { SkipLink } from "./PublicLayout";
import { useWorkspaceContext } from "./workspaceContext";

interface NavItem {
  label: string;
  to: string | null;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  hint: string;
  end?: boolean;
}

function DatasetSelector({ datasetId }: { datasetId: string | undefined }) {
  const id = useId();
  const navigate = useNavigate();
  const datasets = useDatasetList();
  if (!datasets.data || datasets.data.length === 0) return null;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor={id} className="hidden text-xs text-ink-faint sm:block">
        Dataset
      </label>
      <select
        id={id}
        className={cx(inputBaseClass, "h-9 max-w-56 truncate")}
        value={datasetId ?? ""}
        onChange={(e) => e.target.value && navigate(`/datasets/${e.target.value}`)}
      >
        {!datasetId && <option value="">Select a dataset…</option>}
        {datasets.data.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Sidebar({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  return (
    <nav aria-label="Workspace" className="space-y-1 p-3">
      {items.map((item) => {
        const Icon = item.icon;
        if (!item.to) {
          return (
            <div
              key={item.label}
              aria-disabled="true"
              title={item.hint}
              className="flex cursor-not-allowed items-start gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-faint/70"
            >
              <Icon className="mt-0.5 shrink-0" />
              <span>
                <span className="block">{item.label}</span>
                <span className="block text-xs text-ink-faint/80">{item.hint}</span>
              </span>
            </div>
          );
        }
        return (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.end ?? true}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                isActive
                  ? "bg-teal-400/10 font-medium text-teal-200 ring-1 ring-inset ring-teal-400/25"
                  : "text-ink-muted hover:bg-navy-700 hover:text-ink",
              )
            }
          >
            <Icon className="shrink-0" />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function WorkspaceLayout() {
  const { datasetId, modelId, modelsLoading, contextLoading } = useWorkspaceContext();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const needsModel = modelsLoading ? "Loading…" : "Train a model first";
  const needsDataset = contextLoading ? "Loading…" : "Select a dataset first";
  const items: NavItem[] = [
    { label: "All datasets", to: "/workspace", icon: GridIcon, hint: "" },
    {
      label: "Dataset Explorer",
      to: datasetId ? `/datasets/${datasetId}` : null,
      icon: TableIcon,
      hint: needsDataset,
    },
    {
      label: "Model Configuration",
      to: datasetId ? `/datasets/${datasetId}/train` : null,
      icon: SlidersIcon,
      hint: needsDataset,
    },
    {
      label: "Training & Evaluation",
      to: modelId ? `/models/${modelId}` : null,
      icon: ChartIcon,
      hint: needsModel,
    },
    {
      label: "Prediction Studio",
      to: modelId ? `/models/${modelId}/predict` : null,
      icon: TargetIcon,
      hint: needsModel,
    },
    {
      label: "Forest Explorer",
      to: modelId ? `/models/${modelId}/forest` : null,
      icon: TreeIcon,
      hint: needsModel,
    },
  ];

  return (
    <div className="min-h-screen">
      <SkipLink />
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-navy-600 bg-navy-900/95 px-3 backdrop-blur sm:px-5">
        <button
          type="button"
          className="rounded-md p-2 text-ink-muted hover:bg-navy-700 lg:hidden"
          aria-label={drawerOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          {drawerOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
        <Link to="/" aria-label={`${BRAND_NAME} home`} className="shrink-0">
          <Logo />
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <DatasetSelector datasetId={datasetId} />
          <ButtonLink to="/upload" variant="secondary" size="sm">
            <UploadIcon /> <span className="hidden sm:inline">Upload</span>
          </ButtonLink>
        </div>
      </header>

      <div className="flex">
        <aside
          className={cx(
            "fixed inset-y-0 left-0 top-14 z-30 w-64 shrink-0 border-r border-navy-600 bg-navy-850 transition-transform lg:sticky lg:h-[calc(100vh-3.5rem)] lg:translate-x-0",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <Sidebar items={items} onNavigate={() => setDrawerOpen(false)} />
        </aside>
        {drawerOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-0 top-14 z-20 bg-navy-950/60 lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
        )}
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
