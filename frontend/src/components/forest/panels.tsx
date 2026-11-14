import type { ExplainResponse, ModelDetail, TreeExplanation, TreeListResponse, TreeStructure } from "../../api/types";
import { formatInteger, formatNumber, formatPercent, formatPrediction } from "../../lib/format";
import { classColor } from "../../lib/misc";
import { ProbabilityList } from "../model/ProbabilityList";
import { Alert, Badge, cx } from "../ui/primitives";
import { BarList } from "../ui/widgets";

// ---- Node inspector ---------------------------------------------------------------------
export function NodeInspector({
  tree,
  nodeId,
  explanation,
}: {
  tree: TreeStructure;
  nodeId: number;
  explanation: TreeExplanation | null;
}) {
  const node = tree.nodes[nodeId];
  if (!node) return null;
  const step = explanation?.steps.find((s) => s.node_id === nodeId);
  const isPathLeaf = explanation?.leaf_id === nodeId;
  const criterion = tree.criterion.replaceAll("_", " ");
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2">
        <Badge tone={node.is_leaf ? "teal" : "neutral"}>{node.is_leaf ? "Leaf" : "Decision node"}</Badge>
        <span className="text-ink-faint">#{node.id} · depth {node.depth}</span>
        {(step || isPathLeaf) && <Badge tone="teal">on your path</Badge>}
      </div>
      {!node.is_leaf ? (
        <div className="rounded-lg bg-navy-900 p-3">
          <p className="text-xs text-ink-faint">Condition (True → left branch)</p>
          <p className="mt-1 font-mono text-ink">{node.left_rule}</p>
          <p className="mt-2 text-xs text-ink-faint">Otherwise (False → right branch)</p>
          <p className="mt-1 font-mono text-ink-muted">{node.right_rule}</p>
          {step && (
            <p className="mt-3 text-teal-200">
              Your value {step.input_value === null ? "(filled from training data)" : <strong>{step.input_value}</strong>} →
              went <strong>{step.went}</strong> because “{step.rule}”.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg bg-navy-900 p-3">
          <p className="text-xs text-ink-faint">This leaf predicts</p>
          <p className="mt-1 text-lg font-semibold text-ink">{formatPrediction(node.prediction)}</p>
        </div>
      )}
      <dl className="tabular grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-ink-faint">Training rows reaching node</dt>
          <dd className="text-ink">{formatInteger(node.n_samples)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">Bootstrap-weighted rows</dt>
          <dd className="text-ink">{formatNumber(node.weighted_n_samples, 1)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-faint">Impurity ({criterion})</dt>
          <dd className="text-ink">{formatNumber(node.impurity)}</dd>
        </div>
        {tree.task_type === "regression" && (
          <div>
            <dt className="text-xs text-ink-faint">Mean target value</dt>
            <dd className="text-ink">{formatNumber(node.value[0] ?? null)}</dd>
          </div>
        )}
      </dl>
      {tree.task_type === "classification" && tree.classes && (
        <div>
          <p className="mb-2 text-xs text-ink-faint">Class distribution of the training rows in this node</p>
          <BarList
            label="Class distribution"
            max={1}
            format={(v) => formatPercent(v)}
            items={tree.classes.map((c, i) => ({
              label: c,
              value: node.value[i] ?? 0,
              color: classColor(i),
              highlight: c === node.prediction,
            }))}
          />
        </div>
      )}
      <p className="text-xs text-ink-faint">
        With bootstrap sampling, a tree sees some rows several times: “training rows” counts
        distinct rows, “bootstrap-weighted rows” counts every draw.
      </p>
    </div>
  );
}

// ---- Path steps -------------------------------------------------------------------------
export function PathSteps({
  explanation,
  tree,
  onSelectNode,
}: {
  explanation: TreeExplanation;
  tree: TreeStructure;
  onSelectNode: (id: number) => void;
}) {
  const leaf = tree.nodes[explanation.leaf_id];
  return (
    <ol className="space-y-2 text-sm">
      {explanation.steps.map((step, i) => (
        <li key={step.node_id}>
          <button
            type="button"
            onClick={() => onSelectNode(step.node_id)}
            className="flex w-full gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-navy-700"
          >
            <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-400/15 text-xs text-teal-200">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-ink">{step.rule}</span>
              <span className="block text-xs text-ink-faint">
                {step.feature} = {step.input_value ?? "filled from training data"} → {step.went} branch
              </span>
            </span>
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={() => onSelectNode(explanation.leaf_id)}
          className="flex w-full gap-3 rounded-lg bg-teal-400/10 px-2 py-2 text-left ring-1 ring-inset ring-teal-400/30"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-400 text-xs font-semibold text-navy-950">
            ✓
          </span>
          <span>
            <span className="block text-ink">
              Leaf #{explanation.leaf_id}: predicts <strong>{formatPrediction(explanation.prediction)}</strong>
            </span>
            {leaf && <span className="block text-xs text-ink-faint">{formatInteger(leaf.n_samples)} training rows ended here</span>}
          </span>
        </button>
      </li>
    </ol>
  );
}

// ---- Tree selector ----------------------------------------------------------------------
export function TreeSelector({
  trees,
  explanation,
  classes,
  selected,
  onSelect,
}: {
  trees: TreeListResponse;
  explanation: ExplainResponse | null;
  classes: string[] | null;
  selected: number;
  onSelect: (index: number) => void;
}) {
  return (
    <ul aria-label="Trees in the forest" className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
      {trees.trees.map((t) => {
        const result = explanation?.trees[t.index];
        const color =
          result && classes ? classColor(classes.indexOf(String(result.prediction))) : undefined;
        const label = result
          ? `Tree ${t.index}: predicts ${formatPrediction(result.prediction)}`
          : `Tree ${t.index}: depth ${t.depth}, ${t.n_leaves} leaves`;
        return (
          <li key={t.index}>
            <button
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={selected === t.index}
              onClick={() => onSelect(t.index)}
              className={cx(
                "tabular flex h-8 min-w-12 items-center justify-center gap-1.5 rounded-md border px-2 text-xs transition-colors",
                selected === t.index
                  ? "border-teal-300 bg-teal-400/15 text-teal-100"
                  : "border-navy-500 bg-navy-900 text-ink-muted hover:border-teal-400/50",
              )}
            >
              {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />}
              {t.index}
              {result && !classes && <span className="text-ink-faint">{formatNumber(Number(result.prediction), 3)}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---- Forest-level explanation -----------------------------------------------------------
export function EnsemblePanel({ explanation, model }: { explanation: ExplainResponse; model: ModelDetail }) {
  const nTrees = explanation.trees.length;
  if (explanation.task_type === "classification" && model.classes) {
    const tally = explanation.vote_tally ?? [];
    const majority = explanation.majority_vote ?? [];
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-teal-400/30 bg-teal-400/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Random Forest prediction</p>
          <p className="mt-1 text-2xl font-semibold text-ink" data-testid="forest-prediction">{String(explanation.prediction)}</p>
          <p className="mt-1 text-xs text-ink-muted">
            Authoritative result of scikit-learn&apos;s predict(): the class with the highest
            probability after averaging all {nTrees} trees&apos; probabilities.
          </p>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink">Averaged class probabilities (used by scikit-learn)</h3>
          <ProbabilityList
            probabilities={explanation.probabilities ?? []}
            classes={model.classes}
            predicted={String(explanation.prediction)}
          />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink">Tree votes (majority-vote view)</h3>
          <BarList
            label="Tree votes"
            max={nTrees}
            format={(v) => `${v} / ${nTrees}`}
            items={tally.map((v) => ({
              label: v.label,
              value: v.count,
              color: classColor(model.classes!.indexOf(v.label)),
              highlight: majority.includes(v.label),
            }))}
          />
          <p className="mt-2 text-xs text-ink-faint">
            Each tree &quot;votes&quot; for the class with the highest probability in its leaf.
            Majority voting is an intuitive way to read the forest, but scikit-learn actually
            averages probabilities, so the two can occasionally differ.
          </p>
        </div>
        {explanation.majority_agrees_with_model ? (
          <Alert tone="success">
            The majority vote ({majority[0]}) agrees with the forest&apos;s averaged-probability prediction.
          </Alert>
        ) : (
          <Alert tone="warning" title="Majority vote and averaged probabilities differ">
            {majority.length > 1
              ? `The vote is tied between ${majority.join(", ")}.`
              : `Most trees voted for ${majority[0]}.`}{" "}
            scikit-learn averages the trees&apos; probabilities instead of counting votes, so the
            final prediction is {String(explanation.prediction)}.
          </Alert>
        )}
      </div>
    );
  }

  const values = explanation.trees.map((t) => Number(t.prediction));
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-teal-400/30 bg-teal-400/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Random Forest prediction</p>
        <p className="tabular mt-1 text-2xl font-semibold text-ink" data-testid="forest-prediction">
          {formatNumber(Number(explanation.prediction))}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Authoritative result of scikit-learn&apos;s predict(): the average of all {nTrees} trees&apos; predictions.
        </p>
      </div>
      <div className="rounded-lg bg-navy-900 p-4 text-sm">
        <p className="text-ink-muted">
          ({values.slice(0, 3).map((v) => formatNumber(v, 2)).join(" + ")}
          {nTrees > 3 ? " + …" : ""}) ÷ {nTrees} ={" "}
          <strong className="text-ink">{formatNumber(explanation.tree_mean)}</strong>
        </p>
        <dl className="tabular mt-3 grid grid-cols-3 gap-3">
          <div><dt className="text-xs text-ink-faint">Lowest tree</dt><dd className="text-ink">{formatNumber(min)}</dd></div>
          <div><dt className="text-xs text-ink-faint">Mean</dt><dd className="text-ink">{formatNumber(explanation.tree_mean)}</dd></div>
          <div><dt className="text-xs text-ink-faint">Highest tree</dt><dd className="text-ink">{formatNumber(max)}</dd></div>
        </dl>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-ink">Individual tree predictions</h3>
        <div className="relative h-10 rounded-md bg-navy-900" aria-label="Distribution of tree predictions" role="img">
          {values.map((v, i) => (
            <span
              key={i}
              className="absolute top-2 h-6 w-0.5 bg-teal-300/60"
              style={{ left: `${max > min ? ((v - min) / (max - min)) * 100 : 50}%` }}
            />
          ))}
          <span
            className="absolute top-0 h-10 w-1 rounded bg-amber-300"
            style={{ left: `${max > min ? ((Number(explanation.prediction) - min) / (max - min)) * 100 : 50}%` }}
            title="Forest prediction (mean)"
          />
        </div>
        <p className="mt-2 text-xs text-ink-faint">Teal ticks are individual trees; the amber bar is their average.</p>
      </div>
    </div>
  );
}
