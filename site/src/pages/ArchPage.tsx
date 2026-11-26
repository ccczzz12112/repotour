import { useEffect, useMemo, useState } from "react";
import GraphView from "../components/GraphView";
import RepoSwitch from "../components/RepoSwitch";
import type { CodeTarget } from "../components/CodeViewer";
import { layerMeta } from "../lib/roles";
import { lineCount, type GraphNode, type SeedData } from "../lib/seed";

type ArchPageProps = {
  seed: SeedData;
  slug: string;
  repo: string;
  onPickRepo: (slug: string) => void;
  onOpenCode: (target: CodeTarget) => void;
};

export default function ArchPage({ seed, slug, repo, onPickRepo, onOpenCode }: ArchPageProps) {
  const [active, setActive] = useState<GraphNode | null>(null);
  const [filter, setFilter] = useState("");
  const graph = seed.result.graph;

  const verified = graph.edges.filter((edge) => edge.verified).length;
  const layerCount = new Set(graph.nodes.map((node) => node.layer)).size;

  useEffect(() => {
    setActive(null);
    setFilter("");
  }, [slug]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const paths = useMemo(() => {
    if (!active) return [];
    const keyword = filter.trim().toLowerCase();
    return keyword ? active.paths.filter((path) => path.toLowerCase().includes(keyword)) : active.paths;
  }, [active, filter]);

  function openPath(path: string) {
    onOpenCode({ path, evidence: null, from: `架构图 · ${active?.label ?? ""}` });
    setActive(null);
  }

  return (
    <div className="rt-page">
      <div className="rt-page-head">
        <div className="min-w-0">
          <h1 className="rt-page-title">架构图</h1>
          <p className="rt-hint">
            <span className="font-mono">{repo}</span> · {graph.nodes.length} 个模块节点 · {graph.edges.length} 条依赖边 · {layerCount} 层
          </p>
        </div>
        <RepoSwitch value={slug} onPick={onPickRepo} />
      </div>

      <div className="rt-claim">
        <svg viewBox="0 0 24 24" className="rt-claim-icon" aria-hidden>
          <path
            d="M12 2.6 4.6 5.4v6.1c0 4.4 3 8.2 7.4 9.9 4.4-1.7 7.4-5.5 7.4-9.9V5.4Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="m8.6 12.1 2.4 2.4 4.5-4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="rt-claim-text">所有依赖边来自真实 import 静态解析，不是模型推测</p>
        <span className="rt-pill rt-pill-ok">已验证 {verified}/{graph.edges.length}</span>
      </div>

      <GraphView seed={seed} onOpenNode={setActive} />

      <div className="rt-legend">
        <span className="rt-legend-item"><i className="rt-legend-line" aria-hidden />实线 = 已验证 import</span>
        <span className="rt-legend-item"><i className="rt-legend-line rt-legend-dash" aria-hidden />虚线 = 未验证</span>
        <span className="rt-legend-item"><i className="rt-legend-arrow" aria-hidden />箭头 = 导入方 → 被导入方</span>
        <span className="rt-legend-item">悬停节点高亮邻边，点节点看包含文件</span>
      </div>

      {active && (
        <div className="rt-overlay rt-overlay-center" role="presentation">
          <button type="button" className="rt-scrim" aria-label="关闭节点详情" onClick={() => setActive(null)} />
          <div className="rt-modal" role="dialog" aria-modal="true" aria-label={`节点详情 ${active.label}`}>
            <header className="rt-modal-head">
              <div className="min-w-0">
                <p className="rt-modal-title font-mono">{active.label}</p>
                <p className="rt-hint">
                  <span className="rt-role" style={{ color: layerMeta(active.layer).color, borderColor: layerMeta(active.layer).color }}>
                    {layerMeta(active.layer).label}
                  </span>
                  <span className="ml-[calc(0.5rem*var(--site-space,1))]">{active.paths.length} 个文件 · {active.type}</span>
                </p>
              </div>
              <button type="button" className="rt-tool" onClick={() => setActive(null)}>关闭 ✕</button>
            </header>

            <div className="rt-modal-body rt-scroll">
              <p className="rt-prose">
                {(active.note ?? "").trim() ? active.note : "种子未提供该节点的说明文字。"}
              </p>
              <p className="rt-hint font-mono break-all">{active.id}</p>

              {active.paths.length > 8 && (
                <input
                  className="rt-input mt-[calc(0.75rem*var(--site-space,1))]"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="筛选文件路径…"
                  aria-label="筛选节点内的文件路径"
                />
              )}

              <ul className="rt-pathlist">
                {paths.map((path) => {
                  const lines = lineCount(seed, path);
                  const missing = lines === 0;
                  return (
                    <li key={path}>
                      <button
                        type="button"
                        className={missing ? "rt-path rt-path-off" : "rt-path"}
                        disabled={missing}
                        onClick={() => openPath(path)}
                        title={missing ? "该文件未收录在离线证据集中" : `打开 ${path}`}
                      >
                        <span className="rt-path-name font-mono">{path}</span>
                        <span className="rt-path-meta">{missing ? "未收录" : `${lines} 行`}</span>
                      </button>
                    </li>
                  );
                })}
                {paths.length === 0 && <li className="rt-hint">没有匹配的文件。</li>}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}