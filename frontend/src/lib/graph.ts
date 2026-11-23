import { MarkerType, type Edge, type Node } from "reactflow";
import type { GraphEdge, GraphNode } from "../types";

export type TourNodeData = {
  label: string;
  layer: string;
  note?: string;
  paths?: string[];
};

export const LAYER_ORDER = ["entry", "api", "core", "data", "util", "test", "other"];

const NODE_W = 176;
const NODE_H = 58;
const GAP_X = 120;
const GAP_Y = 26;

export const LAYER_COLOR: Record<string, string> = {
  entry: "#fbbf24",
  api: "#60a5fa",
  core: "#8b7cff",
  data: "#39d3d3",
  util: "#94a3b8",
  test: "#4ade80",
  other: "#64748b",
};

/** 按 layer 分列排布：入口在左，测试在右，同列纵向堆叠。 */
export function layoutGraph(nodes: GraphNode[]): Node<TourNodeData>[] {
  const layers = [
    ...LAYER_ORDER.filter((l) => nodes.some((n) => n.layer === l)),
    ...[...new Set(nodes.map((n) => n.layer))].filter((l) => !LAYER_ORDER.includes(l)),
  ];
  const columns = layers.map((layer) => nodes.filter((n) => n.layer === layer));
  const tallest = Math.max(1, ...columns.map((c) => c.length));
  const totalH = tallest * (NODE_H + GAP_Y);

  return columns.flatMap((col, ci) =>
    col.map((n, ri) => ({
      id: n.id,
      type: "tourNode",
      position: {
        x: ci * (NODE_W + GAP_X),
        y: 20 + (totalH - col.length * (NODE_H + GAP_Y)) / 2 + ri * (NODE_H + GAP_Y),
      },
      data: { label: n.label, layer: n.layer, note: n.note, paths: n.paths },
    })),
  );
}

export function layoutEdges(edges: GraphEdge[], nodeIds: Set<string>): Edge[] {
  const seen = new Set<string>();
  return edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target) && e.source !== e.target)
    .filter((e) => {
      const k = `${e.source}->${e.target}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((e) => ({
      id: `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      animated: false,
      style: e.verified
        ? { stroke: "rgba(57,211,211,.55)", strokeWidth: 1.6 }
        : { stroke: "rgba(150,170,220,.35)", strokeWidth: 1.2, strokeDasharray: "4 4" },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: e.verified ? "rgba(57,211,211,.75)" : "rgba(150,170,220,.5)",
        width: 14,
        height: 14,
      },
    }));
}

