/**
 * Layout for a REAL extracted tree (from GET /api/models/{id}/trees/{index}).
 * D3 only computes positions; React renders the SVG.
 */
import { hierarchy, tree as d3tree } from "d3-hierarchy";

import type { TreeNode } from "../api/types";

export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 60;
const GAP_X = 24;
const GAP_Y = 56;

interface Datum {
  id: number;
  children?: Datum[];
}

export interface PositionedNode {
  id: number;
  x: number; // centre
  y: number; // top
  node: TreeNode;
  hasHiddenChildren: boolean;
}

export interface PositionedLink {
  source: PositionedNode;
  target: PositionedNode;
  side: "left" | "right";
}

export interface TreeLayout {
  nodes: PositionedNode[];
  links: PositionedLink[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/** Internal nodes shallower than `depth`, plus every node on the highlighted path. */
export function defaultExpanded(nodes: TreeNode[], depth: number, path: number[] | null): Set<number> {
  const expanded = new Set<number>();
  for (const n of nodes) {
    if (!n.is_leaf && n.depth < depth) expanded.add(n.id);
  }
  for (const id of path ?? []) {
    const n = nodes[id];
    if (n && !n.is_leaf) expanded.add(id);
  }
  return expanded;
}

export function visibleCount(nodes: TreeNode[], expanded: Set<number>): number {
  let count = 0;
  const stack = [0];
  while (stack.length) {
    const id = stack.pop()!;
    const n = nodes[id];
    if (!n) continue;
    count += 1;
    if (!n.is_leaf && expanded.has(id) && n.left !== null && n.right !== null) {
      stack.push(n.left, n.right);
    }
  }
  return count;
}

export function layoutTree(nodes: TreeNode[], expanded: Set<number>): TreeLayout {
  const build = (id: number): Datum => {
    const n = nodes[id]!;
    if (n.is_leaf || !expanded.has(id) || n.left === null || n.right === null) return { id };
    return { id, children: [build(n.left), build(n.right)] };
  };
  const root = d3tree<Datum>().nodeSize([NODE_WIDTH + GAP_X, NODE_HEIGHT + GAP_Y])(hierarchy(build(0)));

  const byId = new Map<number, PositionedNode>();
  const positioned: PositionedNode[] = [];
  for (const d of root.descendants()) {
    const node = nodes[d.data.id]!;
    const p: PositionedNode = {
      id: d.data.id,
      x: d.x ?? 0,
      y: d.y ?? 0,
      node,
      hasHiddenChildren: !node.is_leaf && !d.children,
    };
    byId.set(p.id, p);
    positioned.push(p);
  }
  const links: PositionedLink[] = root.links().map((l) => {
    const source = byId.get(l.source.data.id)!;
    const target = byId.get(l.target.data.id)!;
    return { source, target, side: source.node.left === target.id ? "left" : "right" };
  });
  const xs = positioned.map((p) => p.x);
  const ys = positioned.map((p) => p.y);
  return {
    nodes: positioned,
    links,
    bounds: {
      minX: Math.min(...xs) - NODE_WIDTH / 2,
      maxX: Math.max(...xs) + NODE_WIDTH / 2,
      minY: Math.min(...ys),
      maxY: Math.max(...ys) + NODE_HEIGHT,
    },
  };
}
