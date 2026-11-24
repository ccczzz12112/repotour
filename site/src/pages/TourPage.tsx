import { useEffect, useMemo, useState } from "react";
import CodePanel from "../components/CodePanel";
import { stopsOf, type SeedData } from "../lib/seed";

type TourPageProps = {
  seed: SeedData;
  order: number;
  onOrderChange: (order: number) => void;
  repo: string;
};

export default function TourPage({ seed, order, onOrderChange, repo }: TourPageProps) {
  const stops = useMemo(() => stopsOf(seed), [seed]);
  const index = Math.max(0, stops.findIndex((s) => s.order === order));
  const stop = stops[index] ?? stops[0];
  const [refIndex, setRefIndex] = useState(0);

  useEffect(() => setRefIndex(0), [stop?.order]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const typing =
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.closest('[role="tablist"]') !== null;
      if (typing) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onOrderChange(stops[Math.max(0, index - 1)].order);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onOrderChange(stops[Math.min(stops.length - 1, index + 1)].order);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, stops, onOrderChange]);

  if (!stop) return null;

  const evidence = stop.files[Math.min(refIndex, stop.files.length - 1)];
  const text = evidence ? seed.files[evidence.path] : undefined;
  const total = stops.length;

  return (
    <div className="flex flex-col gap-[calc(1rem*var(--site-space,1))]">
      <div className="rt-card flex flex-wrap items-center justify-between gap-[calc(0.625rem*var(--site-space,1))] px-[calc(0.875rem*var(--site-space,1))] py-[calc(0.625rem*var(--site-space,1))]">
        <div className="flex items-baseline gap-[calc(0.625rem*var(--site-space,1))] min-w-0">
          <p className="font-mono text-[calc(1.0625rem*var(--site-type,1))] font-semibold tabular-nums">
            第 {index + 1} / {total} 站
          </p>
          <p className="rt-hint truncate font-mono">{repo}</p>
        </div>
        <div className="flex items-center gap-[calc(0.375rem*var(--site-space,1))]">
          <button
            type="button"
            className="rt-tool"
            onClick={() => onOrderChange(stops[Math.max(0, index - 1)].order)}
            disabled={index === 0}
          >
            ← 上一站
          </button>
          <button
            type="button"
            className="rt-tool"
            onClick={() => onOrderChange(stops[Math.min(total - 1, index + 1)].order)}
            disabled={index === total - 1}
          >
            下一站 →
          </button>
        </div>
      </div>

      <div className="rt-tour">
        <nav className="rt-stations" aria-label="导览站点列表">
          {stops.map((s, i) => {
            const on = s.order === stop.order;
            return (
              <button
                key={s.order}
                type="button"
                onClick={() => onOrderChange(s.order)}
                aria-current={on ? "step" : undefined}
                className={on ? "rt-station rt-station-on" : "rt-station"}
              >
                <span className="rt-station-no">{i + 1}</span>
                <span className="rt-station-title">{s.title}</span>
              </button>
            );
          })}
        </nav>

        <article className="rt-card rt-stop-card">
          <h2 className="text-[calc(1.3rem*var(--site-type,1))] font-semibold tracking-tight">
            {stop.title}
          </h2>

          <section className="rt-block">
            <h3 className="rt-block-title">为什么先读这里</h3>
            <p className="rt-prose">{stop.why}</p>
          </section>

          <section className="rt-block">
            <h3 className="rt-block-title">讲解</h3>
            <p className="rt-prose">{stop.narrative}</p>
          </section>

          <section className="rt-block">
            <h3 className="rt-block-title">代码证据</h3>
            <div className="flex flex-wrap gap-[calc(0.375rem*var(--site-space,1))]">
              {stop.files.map((file, i) => {
                const on = i === refIndex;
                return (
                  <button
                    key={`${file.path}:${file.start}`}
                    type="button"
                    className={on ? "rt-cite rt-cite-on" : "rt-cite"}
                    title={file.symbol ? `${file.symbol} · 第 ${file.start}–${file.end} 行` : undefined}
                    aria-pressed={on}
                    onClick={() => setRefIndex(i)}
                  >
                    {file.path}:{file.start}-{file.end}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rt-block">
            <h3 className="rt-block-title">读完自问</h3>
            <p className="rt-prose">{stop.quiz}</p>
          </section>
        </article>

        <div className="rt-code-col">
          {evidence && text !== undefined ? (
            <CodePanel key={`${evidence.path}:${evidence.start}`} path={evidence.path} evidence={evidence} text={text} />
          ) : (
            <div className="rt-card rt-code-empty">
              <p className="rt-hint">
                {evidence ? `种子数据中没有 ${evidence.path} 的全文。` : "这一站没有代码引用。"}
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="rt-hint">
        提示：← → 方向键可切换站点；点击「代码证据」里的引用，右栏会跳到该文件的真实行号并高亮。
      </p>
    </div>
  );
}
