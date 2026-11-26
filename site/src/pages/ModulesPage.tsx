import { useEffect, useMemo, useState } from "react";
import RepoSwitch from "../components/RepoSwitch";
import type { CodeTarget } from "../components/CodeViewer";
import { roleMeta } from "../lib/roles";
import { modulesOf, type SeedData } from "../lib/seed";

type ModulesPageProps = {
  seed: SeedData;
  slug: string;
  repo: string;
  onPickRepo: (slug: string) => void;
  onOpenCode: (target: CodeTarget) => void;
};

const SYMBOL_LIMIT = 6;

export default function ModulesPage({ seed, slug, repo, onPickRepo, onOpenCode }: ModulesPageProps) {
  const [role, setRole] = useState("all");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    setRole("all");
    setKeyword("");
  }, [slug]);

  const modules = useMemo(() => modulesOf(seed), [seed]);
  const maxImportance = modules[0]?.importance ?? 1;

  const roles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of modules) counts.set(item.role, (counts.get(item.role) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [modules]);

  const visible = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return modules.filter(
      (item) =>
        (role === "all" || item.role === role) &&
        (text === "" || item.path.toLowerCase().includes(text)),
    );
  }, [modules, role, keyword]);

  return (
    <div className="rt-page">
      <div className="rt-page-head">
        <div className="min-w-0">
          <h1 className="rt-page-title">模块地图</h1>
          <p className="rt-hint">
            <span className="font-mono">{repo}</span> · {modules.length} 个模块 · 按重要度降序 · 点卡片直达代码证据
          </p>
        </div>
        <RepoSwitch value={slug} onPick={onPickRepo} />
      </div>

      <div className="rt-toolbar">
        <input
          className="rt-input rt-search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="按路径搜索，例如 core.py"
          aria-label="按路径搜索模块"
          type="search"
        />
        <div className="rt-roles" role="group" aria-label="按职责筛选">
          <button
            type="button"
            className={role === "all" ? "rt-chip rt-chip-on" : "rt-chip"}
            aria-pressed={role === "all"}
            onClick={() => setRole("all")}
          >
            全部 <span className="rt-chip-n">{modules.length}</span>
          </button>
          {roles.map(([key, count]) => {
            const tone = roleMeta(key);
            const on = role === key;
            return (
              <button
                key={key}
                type="button"
                className={on ? "rt-chip rt-chip-on" : "rt-chip"}
                aria-pressed={on}
                onClick={() => setRole(on ? "all" : key)}
                style={on ? { borderColor: tone.color, color: tone.color } : undefined}
              >
                <i className="rt-chip-dot" style={{ background: tone.color }} aria-hidden />
                {tone.label} <span className="rt-chip-n">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="rt-hint">
        显示 {visible.length} / {modules.length} 个模块
        {role !== "all" ? ` · 职责「${roleMeta(role).label}」` : ""}
        {keyword.trim() ? ` · 路径含「${keyword.trim()}」` : ""}
      </p>

      {visible.length === 0 ? (
        <div className="rt-card rt-empty">
          <p className="rt-panel-title">没有匹配的模块</p>
          <p className="rt-hint">换个关键词，或清除职责筛选。</p>
          <button
            type="button"
            className="rt-tool mt-[calc(0.75rem*var(--site-space,1))]"
            onClick={() => {
              setRole("all");
              setKeyword("");
            }}
          >
            清除筛选
          </button>
        </div>
      ) : (
        <div className="rt-mgrid">
          {visible.map((item, index) => {
            const tone = roleMeta(item.role);
            const symbols = [...new Set(item.key_symbols)];
            const evidence = item.evidence[0] ?? null;
            const available = evidence !== null && seed.files[evidence.path] !== undefined;
            const ratio = maxImportance > 0 ? item.importance / maxImportance : 0;
            return (
              <button
                key={item.path}
                type="button"
                className={available ? "rt-mcard" : "rt-mcard rt-mcard-off"}
                disabled={!available}
                style={{ animationDelay: `calc(${Math.min(index, 12) * 26}ms * var(--site-motion, 1))` }}
                onClick={() => {
                  if (evidence) {
                    onOpenCode({ path: evidence.path, evidence, from: `模块地图 · ${item.path}` });
                  }
                }}
                title={available ? `打开 ${evidence?.path}:${evidence?.start}-${evidence?.end}` : "该文件未收录在离线证据集中"}
              >
                <span className="rt-mcard-top">
                  <span className="rt-role" style={{ color: tone.color, borderColor: tone.color }}>
                    {tone.label}
                  </span>
                  <span className="rt-mimp font-mono">{item.importance.toFixed(4)}</span>
                </span>

                <span className="rt-mpath font-mono">{item.path}</span>
                <span className="rt-mresp">{item.responsibility}</span>

                {symbols.length > 0 && (
                  <span className="rt-symbols">
                    {symbols.slice(0, SYMBOL_LIMIT).map((symbol) => (
                      <span key={symbol} className="rt-symbol font-mono">{symbol}</span>
                    ))}
                    {symbols.length > SYMBOL_LIMIT && (
                      <span className="rt-symbol rt-symbol-more">+{symbols.length - SYMBOL_LIMIT}</span>
                    )}
                  </span>
                )}

                <span className="rt-mbar" aria-hidden>
                  <span className="rt-mbar-fill" style={{ width: `${Math.max(3, ratio * 100)}%`, background: tone.color }} />
                </span>

                <span className="rt-mfoot">
                  {available ? (
                    <>
                      <span className="rt-mfoot-cta">看代码 →</span>
                      <span className="rt-hint font-mono truncate">
                        {evidence?.path}:{evidence?.start}-{evidence?.end}
                      </span>
                    </>
                  ) : (
                    <span className="rt-hint">未收录离线证据，无法跳转</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p className="rt-hint">重要度条按本仓库最高值归一化，数值为种子给出的原始中心度。</p>
    </div>
  );
}