import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router";

import { userMessage } from "../api/client";
import type { ModelDetail } from "../api/types";
import { EnsemblePanel, NodeInspector, PathSteps, TreeSelector } from "../components/forest/panels";
import { TreeCanvas } from "../components/forest/TreeCanvas";
import {
  InputForm,
  loadSavedInputs,
  saveInputs,
  toPredictionInputs,
  type InputValues,
} from "../components/model/InputForm";
import { ModelGate } from "../components/model/ModelGate";
import { ChevronLeftIcon, ChevronRightIcon } from "../components/ui/icons";
import { Alert, Button, Card, CardHeader, PageHeader, cx, inputBaseClass } from "../components/ui/primitives";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/states";
import { useExplain, useInputSchema, useTree, useTreeList } from "../hooks/queries";
import { formatPrediction } from "../lib/format";
import { defaultExpanded, visibleCount } from "../lib/treeLayout";

const DEPTH_OPTIONS = [2, 3, 4, 5, 6];
const MAX_VISIBLE_FOR_EXPAND_ALL = 600;

function ForestContent({ model }: { model: ModelDetail }) {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const schema = useInputSchema(model.id);
  const trees = useTreeList(model.id);
  const explain = useExplain(model.id);
  const routeState = location.state as { inputs?: InputValues; explain?: boolean } | null;
  const [values, setValues] = useState<InputValues>(() => routeState?.inputs ?? loadSavedInputs(model.id) ?? {});
  const autoRan = useRef(false);

  const nTrees = trees.data?.n_trees ?? 0;
  const rawIndex = Number(params.get("tree") ?? "0");
  const treeIndex = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < Math.max(nTrees, 1) ? rawIndex : 0;
  const tree = useTree(model.id, treeIndex, nTrees > 0);
  const explanation = explain.data?.trees[treeIndex] ?? null;
  const path = explanation?.path ?? null;

  const [depth, setDepth] = useState(3);
  // The view resets whenever the tree, the explained path or the depth choice changes.
  // Defaults are derived synchronously (so the first layout is complete and "fit" is
  // correct); the user's own expand/collapse and node selection are kept per view.
  const viewKey = `${model.id}:${treeIndex}:${depth}:${path?.join(",") ?? ""}`;
  const baseExpanded = useMemo(
    () => (tree.data ? defaultExpanded(tree.data.nodes, depth, path) : new Set<number>()),
    [tree.data, depth, path],
  );
  const [expandedOverride, setExpandedOverride] = useState<{ key: string; set: Set<number> } | null>(null);
  const expanded = expandedOverride?.key === viewKey ? expandedOverride.set : baseExpanded;
  const setExpanded = (update: (prev: Set<number>) => Set<number>) =>
    setExpandedOverride({ key: viewKey, set: update(expanded) });
  const [selectionOverride, setSelectionOverride] = useState<{ key: string; id: number } | null>(null);
  const selectedNode =
    selectionOverride?.key === viewKey ? selectionOverride.id : path ? path[path.length - 1]! : 0;
  const setSelectedNode = (id: number) => setSelectionOverride({ key: viewKey, id });

  const runExplain = () => {
    if (!schema.data) return;
    saveInputs(model.id, values);
    explain.mutate(toPredictionInputs(schema.data.features, values));
  };

  useEffect(() => {
    if (routeState?.explain && schema.data && !autoRan.current) {
      autoRan.current = true;
      runExplain();
    }
  }); // runs after each render until the first automatic explanation was started

  const selectTree = (index: number) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tree", String(index));
      return next;
    });
  };

  const allCount = useMemo(() => tree.data?.n_nodes ?? 0, [tree.data]);

  if (schema.isLoading || trees.isLoading) return <LoadingState label="Loading the forest…" />;
  const loadError = schema.error ?? trees.error;
  if (loadError || !schema.data || !trees.data) {
    return <Card><ErrorState error={loadError} onRetry={() => { void schema.refetch(); void trees.refetch(); }} /></Card>;
  }

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => {
    if (!tree.data) return;
    const all = new Set(tree.data.nodes.filter((n) => !n.is_leaf).map((n) => n.id));
    setExpanded(() => all);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <PageHeader
        eyebrow="Forest Explorer"
        title={model.name}
        description={`Look inside all ${nTrees} decision trees of this forest. Every node, threshold and leaf is read from the trained scikit-learn model; enter an input to highlight the exact path each tree takes.`}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Input to explain" description="The same inputs as Prediction Studio. Empty fields are filled from the training data." />
          <div className="p-5">
            <InputForm
              features={schema.data.features}
              values={values}
              onChange={setValues}
              onSubmit={runExplain}
              submitting={explain.isPending}
              submitLabel="Explain prediction"
            />
            {explain.isError && <div className="mt-4"><Alert tone="error" title="Explanation failed">{userMessage(explain.error)}</Alert></div>}
          </div>
        </Card>
        <Card>
          <CardHeader title="How the forest decides" />
          <div className="p-5">
            {explain.data ? (
              <>
                <EnsemblePanel explanation={explain.data} model={model} />
                {explain.data.imputed_features.length > 0 && (
                  <p className="mt-4 text-xs text-ink-faint">
                    Filled from training data: {explain.data.imputed_features.map((f) => `${f.feature} = ${f.value}`).join(", ")}.
                  </p>
                )}
                {explain.data.warnings.map((w) => <p key={w} className="mt-2 text-xs text-amber-200">{w}</p>)}
              </>
            ) : (
              <EmptyState title="No input explained yet" description="Enter values and press “Explain prediction” to see every tree's vote and path." />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={`Trees (${nTrees})`}
          description={explain.data ? "Colored by each tree's own prediction for your input. Select a tree to inspect it." : "Select a tree to inspect its structure."}
        />
        <div className="p-5">
          <TreeSelector trees={trees.data} explanation={explain.data ?? null} classes={model.classes} selected={treeIndex} onSelect={selectTree} />
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Button size="sm" variant="ghost" aria-label="Previous tree" disabled={treeIndex === 0} onClick={() => selectTree(treeIndex - 1)}><ChevronLeftIcon /></Button>
                Tree {treeIndex}
                <Button size="sm" variant="ghost" aria-label="Next tree" disabled={treeIndex >= nTrees - 1} onClick={() => selectTree(treeIndex + 1)}><ChevronRightIcon /></Button>
              </span>
            }
            description={tree.data ? `${tree.data.n_nodes} nodes · depth ${tree.data.depth} · ${tree.data.n_leaves} leaves${explanation ? ` · this tree predicts ${formatPrediction(explanation.prediction)}` : ""}` : undefined}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-ink-faint" htmlFor="depth-select">Show levels</label>
                <select id="depth-select" className={cx(inputBaseClass, "h-8 w-20")} value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
                  {DEPTH_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <Button size="sm" variant="secondary" onClick={expandAll} disabled={!tree.data || allCount > MAX_VISIBLE_FOR_EXPAND_ALL}
                  title={allCount > MAX_VISIBLE_FOR_EXPAND_ALL ? "This tree is too large to show completely; expand nodes individually." : undefined}>
                  Expand all
                </Button>
              </div>
            }
          />
          <div className="p-4">
            {tree.isLoading && <LoadingState label="Loading tree…" />}
            {tree.isError && <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />}
            {tree.data && (
              <>
                <TreeCanvas
                  tree={tree.data}
                  expanded={expanded}
                  path={path}
                  selectedNodeId={selectedNode}
                  fitKey={viewKey}
                  onSelectNode={setSelectedNode}
                  onToggleNode={toggle}
                />
                <p className="mt-1 text-xs text-ink-faint">
                  Showing {visibleCount(tree.data.nodes, expanded)} of {tree.data.n_nodes} nodes.
                  {path && " The highlighted teal route is this tree's real decision path for your input."}
                </p>
              </>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Node details" />
            <div className="p-5">
              {tree.data && selectedNode !== null ? (
                <NodeInspector tree={tree.data} nodeId={selectedNode} explanation={explanation} />
              ) : (
                <p className="text-sm text-ink-muted">Select a node in the tree.</p>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Prediction path" description={explanation ? `${explanation.steps.length} decisions from root to leaf in tree ${treeIndex}.` : undefined} />
            <div className="p-5">
              {explanation && tree.data ? (
                <PathSteps explanation={explanation} tree={tree.data} onSelectNode={setSelectedNode} />
              ) : (
                <p className="text-sm text-ink-muted">Explain an input to see the step-by-step path through this tree.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ForestExplorerPage() {
  const { modelId = "" } = useParams();
  return <ModelGate modelId={modelId}>{(model) => <ForestContent model={model} />}</ModelGate>;
}
