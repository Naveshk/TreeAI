import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { TreeStructure } from "../../api/types";
import { formatNumber, formatPrediction } from "../../lib/format";
import { classColor } from "../../lib/misc";
import { NODE_HEIGHT, NODE_WIDTH, layoutTree, type PositionedNode } from "../../lib/treeLayout";
import { Button } from "../ui/primitives";

const MIN_FIT_SCALE = 0.5;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function nodeFill(tree: TreeStructure, p: PositionedNode, valueRange: [number, number]): string {
  if (tree.task_type === "classification" && tree.classes) {
    return classColor(tree.classes.indexOf(String(p.node.prediction)));
  }
  const [lo, hi] = valueRange;
  const t = hi > lo ? (Number(p.node.prediction) - lo) / (hi - lo) : 0.5;
  return `rgba(45, 212, 191, ${0.25 + 0.75 * t})`;
}

export function TreeCanvas({
  tree,
  expanded,
  path,
  selectedNodeId,
  onSelectNode,
  onToggleNode,
  fitKey,
}: {
  tree: TreeStructure;
  fitKey: string;
  expanded: Set<number>;
  path: number[] | null;
  selectedNodeId: number | null;
  onSelectNode: (id: number) => void;
  onToggleNode: (id: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const layout = useMemo(() => layoutTree(tree.nodes, expanded), [tree.nodes, expanded]);
  const onPath = useMemo(() => new Set(path ?? []), [path]);
  const valueRange = useMemo<[number, number]>(() => {
    const values = tree.nodes.map((n) => Number(n.prediction));
    return [Math.min(...values), Math.max(...values)];
  }, [tree.nodes]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 2.5])
      .on("zoom", (event: { transform: ZoomTransform }) => setTransform(event.transform));
    zoomRef.current = behavior;
    select(svg).call(behavior);
    return () => {
      select(svg).on(".zoom", null);
    };
  }, []);

  const fit = useCallback(() => {
    const svg = svgRef.current;
    const behavior = zoomRef.current;
    if (!svg || !behavior) return;
    const { width, height } = svg.getBoundingClientRect();
    if (!width || !height) return;
    const { minX, maxX, minY, maxY } = layout.bounds;
    const pad = 40;
    const fitScale = Math.min(2, (width - pad) / (maxX - minX || 1), (height - pad) / (maxY - minY || 1));
    // Never shrink below a readable size; when clamped, centre on the root (pan to explore).
    const scale = Math.max(MIN_FIT_SCALE, fitScale);
    const centreX = scale === fitScale ? (minX + maxX) / 2 : (layout.nodes[0]?.x ?? 0);
    const tx = width / 2 - centreX * scale;
    const ty = pad / 2 - minY * scale;
    select(svg).call(behavior.transform, zoomIdentity.translate(tx, ty).scale(scale));
  }, [layout.bounds, layout.nodes]);

  // Fit when a new view is shown (other tree, depth or path) — not on every manual toggle.
  const fittedKey = useRef<string | null>(null);
  useEffect(() => {
    if (fittedKey.current !== fitKey) {
      fittedKey.current = fitKey;
      fit();
    }
  }, [fitKey, fit]);

  const zoomBy = (factor: number) => {
    if (svgRef.current && zoomRef.current) select(svgRef.current).call(zoomRef.current.scaleBy, factor);
  };

  const keySelect = (event: KeyboardEvent, id: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectNode(id);
    }
  };

  return (
    <div className="relative">
      <div className="absolute right-3 top-3 z-10 flex gap-1">
        <Button size="sm" variant="secondary" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</Button>
        <Button size="sm" variant="secondary" onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</Button>
        <Button size="sm" variant="secondary" onClick={fit}>Fit</Button>
      </div>
      <svg
        ref={svgRef}
        role="group"
        aria-label={`Decision tree ${tree.tree_index}`}
        className="h-[560px] w-full cursor-grab touch-none rounded-lg bg-navy-950 active:cursor-grabbing"
      >
        <g transform={transform.toString()}>
          {layout.links.map((link) => {
            const highlighted = onPath.has(link.source.id) && onPath.has(link.target.id);
            const x1 = link.source.x;
            const y1 = link.source.y + NODE_HEIGHT;
            const x2 = link.target.x;
            const y2 = link.target.y;
            const my = (y1 + y2) / 2;
            return (
              <g key={`${link.source.id}-${link.target.id}`}>
                <path
                  d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`}
                  fill="none"
                  stroke={highlighted ? "#2dd4bf" : "#34446a"}
                  strokeWidth={highlighted ? 3.5 : 1.5}
                  data-path={highlighted ? "true" : undefined}
                />
                <text
                  x={(x1 + x2) / 2 + (link.side === "left" ? -6 : 6)}
                  y={my - 4}
                  textAnchor={link.side === "left" ? "end" : "start"}
                  className="fill-ink-faint text-[11px]"
                >
                  {link.side === "left" ? "True" : "False"}
                </text>
              </g>
            );
          })}
          {layout.nodes.map((p) => {
            const n = p.node;
            const highlighted = onPath.has(p.id);
            const selected = selectedNodeId === p.id;
            const color = nodeFill(tree, p, valueRange);
            const title = n.is_leaf
              ? `Leaf ${n.id}: predicts ${formatPrediction(n.prediction)} (${n.n_samples} samples)`
              : `Node ${n.id}: ${n.left_rule} (${n.n_samples} samples)`;
            return (
              <g key={p.id} transform={`translate(${p.x - NODE_WIDTH / 2},${p.y})`}>
                <g
                  role="button"
                  tabIndex={0}
                  aria-label={title}
                  aria-pressed={selected}
                  data-node-id={p.id}
                  data-on-path={highlighted ? "true" : undefined}
                  onClick={() => onSelectNode(p.id)}
                  onKeyDown={(e) => keySelect(e, p.id)}
                  className="cursor-pointer focus:outline-none"
                >
                  <title>{title}</title>
                  <rect
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={10}
                    fill="#111a2e"
                    stroke={selected ? "#f8fafc" : highlighted ? "#2dd4bf" : "#34446a"}
                    strokeWidth={selected || highlighted ? 2.5 : 1}
                  />
                  <rect width={6} height={NODE_HEIGHT} rx={3} fill={color} />
                  <text x={16} y={23} className="fill-ink text-[12px] font-medium">
                    {n.is_leaf ? `→ ${truncate(formatPrediction(n.prediction), 20)}` : truncate(n.left_rule ?? "", 24)}
                  </text>
                  <text x={16} y={43} className="fill-ink-faint text-[11px]">
                    {n.is_leaf
                      ? `leaf · n=${n.n_samples}`
                      : `n=${n.n_samples} · ${tree.criterion.split("_")[0]} ${formatNumber(n.impurity, 3)}`}
                  </text>
                </g>
                {!n.is_leaf && (p.hasHiddenChildren || expanded.has(p.id)) && (
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={p.hasHiddenChildren ? `Expand node ${n.id}` : `Collapse node ${n.id}`}
                    transform={`translate(${NODE_WIDTH / 2},${NODE_HEIGHT})`}
                    onClick={() => onToggleNode(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onToggleNode(p.id);
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <circle r={9} fill="#16213a" stroke={highlighted ? "#2dd4bf" : "#34446a"} />
                    <text textAnchor="middle" dy={4} className="fill-ink text-[12px]">
                      {p.hasHiddenChildren ? "+" : "−"}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <p className="mt-2 text-xs text-ink-faint">
        Drag to pan, scroll to zoom. Each internal node asks “is the condition true?”; the left
        branch is True. Click a node for details, or “+” / “−” to expand or collapse it.
      </p>
    </div>
  );
}
