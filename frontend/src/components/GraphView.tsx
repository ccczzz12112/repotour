import { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  type NodeProps,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import type { Result } from "../types";
import { LAYER_COLOR, layoutEdges, layoutGraph, type TourNodeData } from "../lib/graph";

function TourNode({ data, selected }: NodeProps<TourNodeData>) {
  return (
    <div className={`tnode l-${data.layer}${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="tlabel">{data.label}</div>
      <div className="tmeta">
        {data.layer} · {(data.paths ?? []).length} 文件
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { tourNode: TourNode };

export default function GraphView({ graph }: { graph: Result["graph"] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const { nodes, edges } = useMemo(() => {
    const ns = layoutGraph(graph.nodes);
    const ids = new Set(ns.map((n) => n.id));
    return { nodes: ns, edges: layoutEdges(graph.edges, ids) };
  }, [graph]);

  // 容器尺寸确定后再 fitView，避免首次渲染时节点还没测量导致被裁切
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!rf || !size.w) return;
    const timer = window.setTimeout(() => rf.fitView({ padding: 0.12, duration: 250 }), 60);
    return () => window.clearTimeout(timer);
  }, [rf, size.w, size.h, nodes.length]);

  const current = graph.nodes.find((n) => n.id === selectedId);

  return (
    <div>
      <div className="graphbox" ref={boxRef}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          minZoom={0.15}
          onInit={setRf}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,.10)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <div className="legend">
        {Object.entries(LAYER_COLOR).map(([layer, color]) => (
          <span key={layer}>
            <i style={{ background: color }} />
            {layer}
          </span>
        ))}
        <span>—— 实线：静态 import 已验证</span>
        <span>---- 虚线：合并且未逐条验证</span>
      </div>

      {current && (
        <div className="note-card">
          <div>
            <b>{current.label}</b>{" "}
            <span className="muted">
              · {current.layer} · {current.type}
            </span>
          </div>
          {current.note && <div className="np">{current.note}</div>}
          <div className="np">{current.paths.join("  ·  ")}</div>
        </div>
      )}
    </div>
  );
}
