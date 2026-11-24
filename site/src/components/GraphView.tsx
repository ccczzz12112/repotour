import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { layoutGraph } from "../lib/graphLayout";
import { layerMeta } from "../lib/roles";
import type { GraphNode, SeedData } from "../lib/seed";

type GraphViewProps = {
  seed: SeedData;
  onOpenNode: (node: GraphNode) => void;
};

type View = { scale: number; x: number; y: number };

const MIN_SCALE = 0.12;
const MAX_SCALE = 2.5;
const DEFAULT_GAP = 132;
const DEFAULT_CURVE = 0.55;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export default function GraphView({ seed, onOpenNode }: GraphViewProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const [autoFit, setAutoFit] = useState(false);
  const [gapY, setGapY] = useState(DEFAULT_GAP);
  const [curve, setCurve] = useState(DEFAULT_CURVE);
  const [showCounts, setShowCounts] = useState(true);
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);

  const graph = seed.result.graph;
  const layout = useMemo(
    () => layoutGraph(graph, { gapY, curve, hasFile: (path) => seed.files[path] !== undefined }),
    [graph, gapY, curve, seed.files],
  );
  const edges = useMemo(
    () => (onlyVerified ? layout.edges.filter((edge) => edge.verified) : layout.edges),
    [layout.edges, onlyVerified],
  );

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setSize({ w: box.clientWidth, h: box.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setView(null);
    setAutoFit(false);
  }, [seed]);

  const fit = useMemo<View>(() => {
    if (size.w === 0 || size.h === 0) return { scale: 1, x: 0, y: 0 };
    const scale = clampScale(Math.min((size.w - 20) / layout.width, (size.h - 20) / layout.height));
    return {
      scale,
      x: (size.w - layout.width * scale) / 2,
      y: (size.h - layout.height * scale) / 2,
    };
  }, [size, layout.width, layout.height]);

  // 窄屏全览会把字缩到看不清：默认停在可读比例，「回到全览」再真正缩到整图。
  const auto = useMemo<View>(
    () => (autoFit || fit.scale >= 0.5 ? fit : { scale: 0.6, x: 14, y: 14 }),
    [autoFit, fit],
  );
  const current = view ?? auto;

  const zoomTo = useCallback(
    (next: number, ax: number, ay: number) => {
      const scale = clampScale(next);
      setView((prev) => {
        const base = prev ?? auto;
        const k = scale / base.scale;
        return { scale, x: ax - (ax - base.x) * k, y: ay - (ay - base.y) * k };
      });
    },
    [auto],
  );

  const latest = useRef({ view, auto });
  latest.current = { view, auto };

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * 0.0016);
      const base = latest.current.view ?? latest.current.auto;
      zoomTo(base.scale * factor, event.clientX - rect.left, event.clientY - rect.top);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  const neighbours = useMemo(() => {
    if (!hoverId) return null;
    const set = new Set<string>([hoverId]);
    for (const edge of edges) {
      if (edge.source === hoverId) set.add(edge.target);
      if (edge.target === hoverId) set.add(edge.source);
    }
    return set;
  }, [hoverId, edges]);

  const verifiedCount = layout.edges.filter((edge) => edge.verified).length;

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    const base = view ?? auto;
    drag.current = { px: event.clientX, py: event.clientY, ox: base.x, oy: base.y, moved: false };
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.px;
    const dy = event.clientY - state.py;
    // 指针捕获会改写 click 的目标，所以只在真正开始拖拽后才捕获，保证点节点仍能选中。
    if (!state.moved && Math.abs(dx) + Math.abs(dy) > 3) {
      state.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (state.moved) setView({ scale: (view ?? auto).scale, x: state.ox + dx, y: state.oy + dy });
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => {
      drag.current = null;
    }, 0);
  }

  function openNode(node: GraphNode) {
    if (drag.current?.moved) return;
    onOpenNode(node);
  }

  return (
    <div className="rt-graph">
      <div className="rt-graph-controls">
        <div className="rt-ctl-row">
          <button
            type="button"
            className="rt-tool"
            onClick={() => zoomTo(current.scale / 1.25, size.w / 2, size.h / 2)}
            aria-label="缩小"
          >
            −
          </button>
          <label className="rt-ctl">
            <span className="rt-ctl-name">缩放</span>
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.05}
              value={current.scale}
              onChange={(event) => zoomTo(Number(event.target.value), size.w / 2, size.h / 2)}
              aria-label="缩放比例"
            />
            <span className="rt-ctl-val">{Math.round(current.scale * 100)}%</span>
          </label>
          <button
            type="button"
            className="rt-tool"
            onClick={() => zoomTo(current.scale * 1.25, size.w / 2, size.h / 2)}
            aria-label="放大"
          >
            ＋
          </button>
          <button
            type="button"
            className="rt-tool"
            onClick={() => {
              setView(null);
              setAutoFit(true);
            }}
          >
            回到全览
          </button>
          <button
            type="button"
            className="rt-tool"
            onClick={() => {
              setGapY(DEFAULT_GAP);
              setCurve(DEFAULT_CURVE);
              setShowCounts(true);
              setOnlyVerified(false);
              setView(null);
              setAutoFit(false);
            }}
          >
            重置参数
          </button>
        </div>

        <div className="rt-ctl-row">
          <label className="rt-ctl">
            <span className="rt-ctl-name">层间距</span>
            <input
              type="range"
              min={80}
              max={240}
              step={4}
              value={gapY}
              onChange={(event) => setGapY(Number(event.target.value))}
              aria-label="层间距"
            />
            <span className="rt-ctl-val">{gapY}</span>
          </label>
          <label className="rt-ctl">
            <span className="rt-ctl-name">连线弧度</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={curve}
              onChange={(event) => setCurve(Number(event.target.value))}
              aria-label="连线弧度"
            />
            <span className="rt-ctl-val">{curve.toFixed(2)}</span>
          </label>
          <button
            type="button"
            className={showCounts ? "rt-chip rt-chip-on" : "rt-chip"}
            aria-pressed={showCounts}
            onClick={() => setShowCounts((v) => !v)}
          >
            文件数
          </button>
          <button
            type="button"
            className={onlyVerified ? "rt-chip rt-chip-on" : "rt-chip"}
            aria-pressed={onlyVerified}
            onClick={() => setOnlyVerified((v) => !v)}
            title={verifiedCount === layout.edges.length ? "本仓库所有依赖边均已验证" : "隐藏未验证的依赖边"}
          >
            只看已验证
          </button>
        </div>
      </div>

      <div className="rt-graph-canvas rt-scroll" ref={boxRef}>
        {size.w > 0 && (
          <svg
            width={size.w}
            height={size.h}
            viewBox={`0 0 ${size.w} ${size.h}`}
            role="group"
            aria-label={`模块依赖分层图，${layout.nodes.length} 个节点，${layout.edges.length} 条依赖边`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => setHoverId(null)}
          >
            <defs>
              <marker id="rt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--rt-edge)" />
              </marker>
              <marker id="rt-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--rt-cyan)" />
              </marker>
              <pattern id="rt-grid" width="26" height="26" patternUnits="userSpaceOnUse">
                <circle cx="1.2" cy="1.2" r="1.2" fill="color-mix(in srgb, var(--site-border) 75%, transparent)" />
              </pattern>
            </defs>

            <rect width={size.w} height={size.h} fill="url(#rt-grid)" />

            <g transform={`translate(${current.x},${current.y}) scale(${current.scale})`}>
              {layout.layers.map((layer) => (
                <g key={layer.key}>
                  <rect
                    x={10}
                    y={layer.y - 34}
                    width={layout.width - 20}
                    height={68}
                    rx={16}
                    fill={layer.color}
                    opacity={0.05}
                  />
                  <text x={20} y={layer.y - 2} className="rt-glayer" fill={layer.color}>
                    {layer.label}
                  </text>
                  <text x={20} y={layer.y + 16} className="rt-glayer-sub">
                    {layer.count} 个模块
                  </text>
                </g>
              ))}

              {edges.map((edge) => {
                const hot = hoverId !== null && (edge.source === hoverId || edge.target === hoverId);
                const dim = neighbours !== null && !hot;
                const cls = `rt-gedge${hot ? " rt-gedge-hot" : ""}${dim ? " rt-gdim" : ""}`;
                return (
                  <g key={`${edge.source}->${edge.target}`} className={cls}>
                    <path
                      d={edge.d}
                      fill="none"
                      stroke={hot ? "var(--rt-cyan)" : "var(--rt-edge)"}
                      strokeWidth={hot ? 2.4 : 1.5}
                      strokeDasharray={edge.verified ? undefined : "7 5"}
                      markerEnd={hot ? "url(#rt-arrow-hot)" : "url(#rt-arrow)"}
                    >
                      <title>{`${edge.source} → ${edge.target} · ${edge.kind}${edge.verified ? " · 已验证" : " · 未验证"}`}</title>
                    </path>
                    {!edge.verified && (
                      <g transform={`translate(${edge.mx},${edge.my})`}>
                        <rect x={-27} y={-11} width={54} height={20} rx={9} className="rt-gunverified-bg" />
                        <text className="rt-gunverified" textAnchor="middle" y={3}>未验证</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {layout.nodes.map((node) => {
                const tone = layerMeta(node.layer);
                const hot = hoverId === node.id;
                const dim = neighbours !== null && !neighbours.has(node.id);
                const cls = `rt-gnode${hot ? " rt-gnode-hot" : ""}${dim ? " rt-gdim" : ""}`;
                return (
                  <g
                    key={node.id}
                    className={cls}
                    transform={`translate(${node.x},${node.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.label}，${tone.label}，包含 ${node.paths.length} 个文件，查看详情`}
                    onPointerEnter={() => setHoverId(node.id)}
                    onPointerLeave={() => setHoverId((id) => (id === node.id ? null : id))}
                    onFocus={() => setHoverId(node.id)}
                    onBlur={() => setHoverId(null)}
                    onClick={() => openNode(node)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenNode(node);
                      }
                    }}
                  >
                    <rect width={node.w} height={node.h} rx={13} className="rt-gnode-box" style={{ stroke: tone.color }} />
                    <rect width={4} height={node.h - 16} x={7} y={8} rx={2} fill={tone.color} opacity={0.85} />
                    <text x={19} y={showCounts ? 20 : 28} className="rt-gnode-label">{node.label}</text>
                    {showCounts && (
                      <text x={19} y={35} className="rt-gnode-sub">
                        {node.paths.length} 个文件{node.missing > 0 ? ` · ${node.missing} 未收录` : ""}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
        <p className="rt-graph-hint">拖拽平移 · 滚轮缩放 · 点节点看包含文件</p>
      </div>
    </div>
  );
}