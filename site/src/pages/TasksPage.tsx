import { useEffect, useMemo, useState } from "react";
import RepoSwitch from "../components/RepoSwitch";
import type { CodeTarget } from "../components/CodeViewer";
import { levelMeta } from "../lib/roles";
import { lineCount, tasksOf, type SeedData } from "../lib/seed";

type TasksPageProps = {
  seed: SeedData;
  slug: string;
  repo: string;
  onPickRepo: (slug: string) => void;
  onOpenCode: (target: CodeTarget) => void;
};

const STORE_KEY = "repotour.tasks.v1";

function readDone(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export default function TasksPage({ seed, slug, repo, onPickRepo, onOpenCode }: TasksPageProps) {
  const tasks = useMemo(() => tasksOf(seed), [seed]);
  const [done, setDone] = useState<Record<string, boolean>>(readDone);
  const [revealed, setRevealed] = useState<Record<string, number>>({});
  const [undo, setUndo] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(done));
    } catch {
      /* 隐私模式下写入失败：打卡仅在本次会话内有效。 */
    }
  }, [done]);

  useEffect(() => {
    setRevealed({});
    setUndo(null);
  }, [slug]);

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), 6000);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const keyOf = (index: number) => `${slug}:${tasks[index].level}:${index}`;
  const completed = tasks.filter((_, index) => done[keyOf(index)]).length;
  const levels = [...new Set(tasks.map((task) => task.level))].sort((a, b) => a - b);

  function toggle(index: number) {
    const key = keyOf(index);
    setDone((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function resetAll() {
    const snapshot: Record<string, boolean> = {};
    for (let i = 0; i < tasks.length; i += 1) {
      const key = keyOf(i);
      if (done[key]) snapshot[key] = true;
    }
    if (Object.keys(snapshot).length === 0) return;
    setUndo(snapshot);
    setDone((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(snapshot)) delete next[key];
      return next;
    });
  }

  return (
    <div className="rt-page">
      <div className="rt-page-head">
        <div className="min-w-0">
          <h1 className="rt-page-title">上手任务</h1>
          <p className="rt-hint">
            <span className="font-mono">{repo}</span> · 三档难度 · 打卡保存在本机浏览器，刷新后保留
          </p>
        </div>
        <RepoSwitch value={slug} onPick={onPickRepo} />
      </div>

      <div className="rt-card rt-progress">
        <div className="rt-progress-top">
          <p className="rt-panel-title">
            完成进度 <span className="font-mono tabular-nums">{completed} / {tasks.length}</span>
          </p>
          <button type="button" className="rt-tool" onClick={resetAll} disabled={completed === 0}>
            清空打卡
          </button>
        </div>
        <div className="rt-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={completed} aria-label="任务完成进度">
          <span className="rt-progress-fill" style={{ width: `${tasks.length ? (completed / tasks.length) * 100 : 0}%` }} />
        </div>
        {undo && (
          <p className="rt-undo">
            已清空本仓库打卡。
            <button
              type="button"
              className="rt-tool"
              onClick={() => {
                setDone((prev) => ({ ...prev, ...undo }));
                setUndo(null);
              }}
            >
              撤销
            </button>
          </p>
        )}
      </div>

      <div className="rt-levels">
        {levels.map((level) => {
        const tone = levelMeta(level);
        const group = tasks
          .map((task, index) => ({ task, index }))
          .filter((item) => item.task.level === level);
        const groupDone = group.filter((item) => done[keyOf(item.index)]).length;
        return (
          <section key={level} className="rt-level">
            <header className="rt-level-head">
              <span className="rt-level-badge" style={{ color: tone.color, borderColor: tone.color }}>
                {tone.label} · {tone.name}
              </span>
              <span className="rt-hint">
                {group.length} 个任务 · 已完成 {groupDone}
              </span>
              <span className="rt-level-dots" aria-hidden>
                {[1, 2, 3].map((n) => (
                  <i key={n} style={{ background: n <= level ? tone.color : undefined }} className={n <= level ? "rt-dot-on" : "rt-dot-off"} />
                ))}
              </span>
            </header>

            <div className="rt-tgrid">
              {group.map(({ task, index }) => {
                const key = keyOf(index);
                const checked = Boolean(done[key]);
                const shown = revealed[key] ?? 0;
                return (
                  <article key={key} className={checked ? "rt-tcard rt-tcard-done" : "rt-tcard"} style={{ animationDelay: `calc(${index * 40}ms * var(--site-motion, 1))` }}>
                    <header className="rt-tcard-head">
                      <h2 className="rt-tcard-title">{task.title}</h2>
                      <label className={checked ? "rt-check rt-check-on" : "rt-check"}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(index)}
                          aria-label={`标记「${task.title}」为已完成`}
                        />
                        <span className="rt-check-box" aria-hidden>
                          {checked ? "✓" : ""}
                        </span>
                        <span className="rt-check-text">{checked ? "已完成" : "我完成了"}</span>
                      </label>
                    </header>

                    <p className="rt-prose">{task.description}</p>

                    <div className="rt-block">
                      <h3 className="rt-block-title">涉及文件</h3>
                      <div className="rt-files">
                        {task.files.map((path) => {
                          const lines = lineCount(seed, path);
                          const missing = lines === 0;
                          return (
                            <button
                              key={path}
                              type="button"
                              className={missing ? "rt-cite rt-cite-off" : "rt-cite"}
                              disabled={missing}
                              onClick={() => onOpenCode({ path, evidence: null, from: `上手任务 · ${task.title}` })}
                              title={missing ? "该文件未收录在离线证据集中" : `打开 ${path}`}
                            >
                              {path}
                              <span className="rt-cite-meta">{missing ? "未收录" : `${lines} 行`}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rt-block">
                      <h3 className="rt-block-title">验收标准</h3>
                      <p className="rt-accept">{task.acceptance}</p>
                    </div>

                    <div className="rt-block">
                      <div className="rt-hint-head">
                        <h3 className="rt-block-title">提示</h3>
                        {shown < task.hints.length ? (
                          <button
                            type="button"
                            className="rt-tool"
                            onClick={() => setRevealed((prev) => ({ ...prev, [key]: shown + 1 }))}
                          >
                            {shown === 0 ? `看提示（${task.hints.length} 条）` : `再看一条（${shown}/${task.hints.length}）`}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="rt-tool"
                            onClick={() => setRevealed((prev) => ({ ...prev, [key]: 0 }))}
                          >
                            收起提示
                          </button>
                        )}
                      </div>
                      {shown === 0 ? (
                        <p className="rt-hint">先自己想一遍，再逐条展开提示。</p>
                      ) : (
                        <ol className="rt-hints">
                          {task.hints.slice(0, shown).map((hint, i) => (
                            <li key={i} className="rt-hint-item">
                              <span className="rt-hint-no font-mono">{i + 1}</span>
                              <span>{hint}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
        })}
      </div>
    </div>
  );
}