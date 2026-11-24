import { LAYER_PRIORITY, layerMeta } from "./roles";
import type { GraphEdge, GraphNode } from "./seed";

export type LayoutNode = GraphNode & {
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
  missing: number;
};

export type LayoutEdge = GraphEdge & {
  d: string;
  mx: number;
  my: number;
  up: boolean;
};

export type LayoutLayer = {
  key: string;
  label: string;
  color: string;
  y: number;
  count: number;
};

export type GraphLayout = {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  layers: LayoutLayer[];
  width: number;
  height: number;
};

const NODE_H = 46;
const GAP_X = 26;
const PAD_X = 30;
const PAD_Y = 34;
const GUTTER = 104;
const ARROW_INSET = 5;

function labelUnits(label: string): number {
  let units = 0;
  for (const ch of label) {
    const code = ch.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xffef);
    units += wide ? 2 : 1;
  }
  return units;
}

function nodeWidth(label: string): number {
  return Math.min(248, Math.max(104, 34 + labelUnits(label) * 7.6));
}

function priorityOf(layer: string): number {
  const index = LAYER_PRIORITY.indexOf(layer);
  return index === -1 ? LAYER_PRIORITY.length : index;
}

/** 层序由真实边方向决定：让尽可能多的边自上而下，避免长距离回绕交叉。 */
function orderLayers(layers: string[], edges: GraphEdge[], layerOf: Map<string, string>): string[] {
  const byPriority = [...layers].sort(
    (a, b) => priorityOf(a) - priorityOf(b) || a.localeCompare(b),
  );
  if (layers.length > 7) return byPriority;

  let best = byPriority;
  let bestBack = Number.POSITIVE_INFINITY;
  let bestPriority = Number.POSITIVE_INFINITY;

  const visit = (fixed: string[], rest: string[]) => {
    if (rest.length === 0) {
      const row = new Map(fixed.map((layer, i) => [layer, i]));
      let back = 0;
      for (const edge of edges) {
        const a = row.get(layerOf.get(edge.source) ?? "");
        const b = row.get(layerOf.get(edge.target) ?? "");
        if (a !== undefined && b !== undefined && a > b) back += 1;
      }
      const priority = fixed.reduce((sum, layer, i) => sum + priorityOf(layer) * (i + 1), 0);
      if (back < bestBack || (back === bestBack && priority < bestPriority)) {
        best = fixed;
        bestBack = back;
        bestPriority = priority;
      }
      return;
    }
    for (let i = 0; i < rest.length; i += 1) {
      visit([...fixed, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
    }
  };

  visit([], byPriority);
  return best;
}

/** 层内重心排序：反复按相邻层邻居的平均位置重排，压低连线交叉。 */
function orderWithinLayers(
  rows: string[][],
  adjacency: Map<string, string[]>,
): string[][] {
  const next = rows.map((row) => [...row]);
  for (let sweep = 0; sweep < 6; sweep += 1) {
    const downward = sweep % 2 === 0;
    const indexes = downward
      ? next.map((_, i) => i).slice(1)
      : next.map((_, i) => i).slice(0, -1).reverse();
    for (const r of indexes) {
      const ref = next[downward ? r - 1 : r + 1];
      const refPos = new Map(ref.map((id, i) => [id, i]));
      const current = new Map(next[r].map((id, i) => [id, i]));
      const barycenter = (id: string) => {
        const spots = (adjacency.get(id) ?? [])
          .map((other) => refPos.get(other))
          .filter((v): v is number => v !== undefined);
        if (spots.length === 0) return current.get(id) ?? 0;
        return spots.reduce((a, b) => a + b, 0) / spots.length;
      };
      next[r] = [...next[r]].sort(
        (a, b) => barycenter(a) - barycenter(b) || a.localeCompare(b),
      );
    }
  }
  return next;
}

export function layoutGraph(
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
  options: { gapY: number; curve: number; hasFile: (path: string) => boolean },
): GraphLayout {
  const { gapY, curve, hasFile } = options;
  const layerOf = new Map(graph.nodes.map((node) => [node.id, node.layer]));
  const layers = [...new Set(graph.nodes.map((node) => node.layer))];
  const orderedLayers = orderLayers(layers, graph.edges, layerOf);
  const rowOf = new Map(orderedLayers.map((layer, i) => [layer, i]));

  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) {
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }

  const grouped = orderedLayers.map((layer) =>
    graph.nodes.filter((node) => node.layer === layer).map((node) => node.id),
  );
  const rows = orderWithinLayers(grouped, adjacency);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));

  const widths = new Map<string, number>();
  for (const node of graph.nodes) widths.set(node.id, nodeWidth(node.label));

  const rowWidths = rows.map((row) =>
    row.reduce((sum, id) => sum + (widths.get(id) ?? 104), 0) + GAP_X * Math.max(0, row.length - 1),
  );
  const maxRowWidth = Math.max(120, ...rowWidths);

  const nodes: LayoutNode[] = [];
  const placed = new Map<string, LayoutNode>();
  rows.forEach((row, r) => {
    let x = GUTTER + PAD_X + (maxRowWidth - rowWidths[r]) / 2;
    const y = PAD_Y + r * (NODE_H + gapY);
    for (const id of row) {
      const source = byId.get(id);
      if (!source) continue;
      const w = widths.get(id) ?? 104;
      const node: LayoutNode = {
        ...source,
        x,
        y,
        w,
        h: NODE_H,
        row: r,
        missing: source.paths.filter((path) => !hasFile(path)).length,
      };
      nodes.push(node);
      placed.set(id, node);
      x += w + GAP_X;
    }
  });

  const edges: LayoutEdge[] = [];
  for (const edge of graph.edges) {
    const a = placed.get(edge.source);
    const b = placed.get(edge.target);
    if (!a || !b) continue;
    const sx = a.x + a.w / 2;
    const tx = b.x + b.w / 2;
    let sy: number;
    let ty: number;
    let d: string;

    if (a.row === b.row) {
      const lift = 44 + curve * 46;
      sy = a.y;
      ty = b.y;
      d = `M ${sx} ${sy} C ${sx} ${sy - lift}, ${tx} ${ty - lift}, ${tx} ${ty}`;
    } else {
      const down = b.row > a.row;
      sy = down ? a.y + a.h : a.y;
      ty = down ? b.y - ARROW_INSET : b.y + b.h + ARROW_INSET;
      const k = curve * (ty - sy) * 0.5;
      d = `M ${sx} ${sy} C ${sx} ${sy + k}, ${tx} ${ty - k}, ${tx} ${ty}`;
    }

    edges.push({
      ...edge,
      d,
      mx: (sx + tx) / 2,
      my: (sy + ty) / 2,
      up: b.row < a.row,
    });
  }

  const layoutLayers: LayoutLayer[] = orderedLayers.map((key, i) => {
    const meta = layerMeta(key);
    return {
      key,
      label: meta.label,
      color: meta.color,
      y: PAD_Y + i * (NODE_H + gapY) + NODE_H / 2,
      count: rows[i].length,
    };
  });

  return {
    nodes,
    edges,
    layers: layoutLayers,
    width: GUTTER + PAD_X * 2 + maxRowWidth,
    height: PAD_Y * 2 + rows.length * NODE_H + Math.max(0, rows.length - 1) * gapY,
  };
}