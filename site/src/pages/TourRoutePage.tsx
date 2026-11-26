import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { loadSeed, type SeedKey } from "../lib/seed";
import { generateRepo } from "../lib/pipeline/generate";
import { loadPat, savePat } from "../lib/pipeline/github";
import { deleteRecent, listRecent, onlineSlug, saveRecent, type RecentEntry } from "../lib/pipeline/store";
import {
  PipelineError,
  STEP_LABELS,
  type GenerateError,
  type PipelineStepKey,
  type StepState,
} from "../lib/pipeline/types";

const EXAMPLES: { key: SeedKey; label: string; note: string }[] = [
  { key: "pallets-click", label: "pallets/click", note: "Python 命令行工具库 · 10 站" },
  { key: "psf-requests", label: "psf/requests", note: "Python HTTP 客户端库 · 10 站" },
  { key: "axios-axios", label: "axios/axios", note: "浏览器与 Node 请求库 · 10 站" },
];

const STEP_KEYS: PipelineStepKey[] = ["fetch", "scan", "rank", "map", "reduce", "tour", "tasks"];

const STEP_MARK: Record<StepState["status"], string> = {
  pending: "○",
  running: "◍",
  done: "✓",
  failed: "✕",
};

type TourRoutePageProps = {
  loadedRepo: string | null;
  onPick: (slug: string) => void;
};

export default function TourRoutePage({ loadedRepo, onPick }: TourRoutePageProps) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [error, setError] = useState<GenerateError | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>(() => listRecent());
  const [pat, setPat] = useState(() => loadPat() ?? "");
  const [patSaved, setPatSaved] = useState(false);

  const started = steps.length > 0;

  async function run() {
    const input = url.trim();
    if (!input || busy) return;
    setBusy(true);
    setError(null);
    setSteps(STEP_KEYS.map((key) => ({ key, status: "pending", detail: "" })));
    try {
      const { data, modelUsed, ref } = await generateRepo(input, (s) => {
        setSteps((prev) => prev.map((p) => (p.key === s.key ? s : p)));
      });
      saveRecent(ref, data, modelUsed);
      setRecent(listRecent());
      onPick(onlineSlug(ref));
    } catch (e) {
      const ge: GenerateError =
        e instanceof PipelineError
          ? { code: e.code, message: e.message, hint: e.hint }
          : { code: "network", message: "生成过程中断", hint: "请稍后重试；若反复失败可换一个更小的仓库" };
      setError(ge);
      setSteps((prev) => prev.map((p) => (p.status === "running" ? { ...p, status: "failed", detail: ge.message } : p)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-[calc(1.5rem*var(--site-space,1))]">
      <header className="max-w-3xl">
        <h1 className="rt-title">
          <span className="whitespace-nowrap">RepoTour 码途</span>{" "}
          <span className="whitespace-nowrap">· 仓库导游</span>
        </h1>
        <p className="mt-[calc(0.625rem*var(--site-space,1))] text-[calc(1.0625rem*var(--site-type,1))] leading-relaxed text-muted-foreground">
          刚接手一个陌生的代码仓库？码途把它变成一条能点着走的阅读路线——
          10 站有序导览，每句讲解都绑定可校验的真实代码行号。
        </p>
      </header>

      <section className="rt-card p-[calc(1.125rem*var(--site-space,1))] sm:p-[calc(1.375rem*var(--site-space,1))]">
        <div className="flex flex-wrap items-center justify-between gap-[calc(0.5rem*var(--site-space,1))]">
          <label htmlFor="repo-url" className="rt-panel-title">
            GitHub 仓库链接
          </label>
          <Badge variant="outline" className="rt-hint">
            在线生成 · 公开仓库
          </Badge>
        </div>

        <form
          className="mt-[calc(0.625rem*var(--site-space,1))] flex flex-col gap-[calc(0.5rem*var(--site-space,1))] sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <Input
            id="repo-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            placeholder="https://github.com/owner/repo"
            aria-describedby="repo-url-note"
            className="h-11 flex-1 bg-background/60 font-mono text-sm sm:h-12"
          />
          <Button type="submit" disabled={busy || !url.trim()} size="lg" className="h-11 shrink-0 sm:h-12">
            {busy ? "生成中…" : "生成导览"}
          </Button>
        </form>

        <p id="repo-url-note" className="rt-hint mt-[calc(0.5rem*var(--site-space,1))]">
          支持 Python / JavaScript / TypeScript 公开仓库（≤500 个源码文件）。依赖边只来自真实 import
          解析，模型只补讲解文案；模型能力经站点后端调用，前端不含任何 Key。
        </p>

        {started && (
          <div className="rt-steps mt-[calc(0.875rem*var(--site-space,1))]" aria-live="polite" aria-label="生成进度">
            {steps.map((s) => (
              <div key={s.key} className="rt-step" data-state={s.status}>
                <span className="rt-step-mark" aria-hidden>
                  {STEP_MARK[s.status]}
                </span>
                <span>{STEP_LABELS[s.key]}</span>
                {s.detail && <span className="rt-step-detail">{s.detail}</span>}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div role="alert" className="mt-[calc(0.875rem*var(--site-space,1))] rounded-[calc(var(--site-radius)*0.8)] border border-[#f87171]/50 bg-[#f87171]/8 p-[calc(0.875rem*var(--site-space,1))]">
            <p className="text-[calc(0.9375rem*var(--site-type,1))] font-semibold text-[#fca5a5]">{error.message}</p>
            <p className="rt-hint mt-[calc(0.375rem*var(--site-space,1))]">下一步：{error.hint}</p>
            <button type="button" className="rt-tool mt-[calc(0.625rem*var(--site-space,1))]" onClick={() => void run()}>
              重试
            </button>
          </div>
        )}

        <details className="mt-[calc(0.875rem*var(--site-space,1))]">
          <summary className="rt-hint cursor-pointer select-none">
            GitHub Token 设置（可选 · 匿名限流 60 次/小时，填自己的 Token 提到 5000 次/小时）
          </summary>
          <div className="mt-[calc(0.5rem*var(--site-space,1))] flex flex-col gap-[calc(0.5rem*var(--site-space,1))] sm:flex-row">
            <Input
              type="password"
              value={pat}
              onChange={(e) => {
                setPat(e.target.value);
                setPatSaved(false);
              }}
              placeholder="ghp_…（只存在本机）"
              aria-label="GitHub 个人访问令牌"
              className="h-10 flex-1 bg-background/60 font-mono text-sm"
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0"
              onClick={() => {
                savePat(pat.trim() || null);
                setPatSaved(true);
              }}
            >
              {pat.trim() ? "保存到本机" : "清除本机 Token"}
            </Button>
          </div>
          <p className="rt-hint mt-[calc(0.375rem*var(--site-space,1))]">
            Token 只保存在你浏览器的 localStorage，绝不上传到任何服务器；生成时仅用于直接请求 GitHub 官方 API。
            {patSaved && <span className="ml-2 text-[color:var(--rt-cyan)]">已保存。</span>}
          </p>
        </details>

        <div className="mt-[calc(1.125rem*var(--site-space,1))] border-t border-border pt-[calc(0.875rem*var(--site-space,1))]">
          <p className="rt-hint">示例仓库 · 点击立刻进入导览，数据随站点一起发布，不请求外网</p>
          <div className="mt-[calc(0.625rem*var(--site-space,1))] grid gap-[calc(0.625rem*var(--site-space,1))] sm:grid-cols-3">
            {EXAMPLES.map((item) => (
              <button
                key={item.key}
                type="button"
                className="rt-example"
                onClick={() => onPick(item.key)}
                onPointerEnter={() => {
                  void loadSeed(item.key).catch(() => {});
                }}
              >
                <span className="font-mono text-[calc(0.9375rem*var(--site-type,1))] font-semibold">
                  {item.label}
                </span>
                <span className="rt-hint">{item.note}</span>
                <span className="rt-example-go">进入导览 →</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="rt-card p-[calc(1.125rem*var(--site-space,1))] sm:p-[calc(1.375rem*var(--site-space,1))]">
          <h2 className="rt-panel-title">最近生成</h2>
          <p className="rt-hint mt-[calc(0.25rem*var(--site-space,1))]">
            结果保存在本机浏览器（最多 6 个），换设备或清理缓存后需重新生成。
          </p>
          <ul className="mt-[calc(0.75rem*var(--site-space,1))] flex flex-col gap-[calc(0.5rem*var(--site-space,1))]">
            {recent.map((entry) => (
              <li
                key={entry.slug}
                className="flex flex-wrap items-center justify-between gap-[calc(0.5rem*var(--site-space,1))] rounded-[calc(var(--site-radius)*0.8)] border border-border px-[calc(0.75rem*var(--site-space,1))] py-[calc(0.5rem*var(--site-space,1))]"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-[calc(0.9375rem*var(--site-type,1))] font-semibold">
                    {entry.repo}
                  </span>
                  <span className="rt-hint">
                    {new Date(entry.savedAt).toLocaleString()} ·{" "}
                    {entry.modelUsed ? "静态骨架 + 模型讲解" : "纯静态分析（模型暂不可用）"} ·{" "}
                    引用验证 {entry.data.result.stats.evidence_passed}/{entry.data.result.stats.evidence_total}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-[calc(0.375rem*var(--site-space,1))]">
                  <button type="button" className="rt-tool" onClick={() => onPick(entry.slug)}>
                    进入导览
                  </button>
                  <button
                    type="button"
                    className="rt-tool"
                    aria-label={`删除 ${entry.repo} 的本地结果`}
                    onClick={() => {
                      deleteRecent(entry.slug);
                      setRecent(listRecent());
                    }}
                  >
                    删除
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        aria-labelledby="tour-result-title"
        className="rt-card p-[calc(1.125rem*var(--site-space,1))] sm:p-[calc(1.375rem*var(--site-space,1))]"
      >
        <div className="flex flex-wrap items-center justify-between gap-[calc(0.5rem*var(--site-space,1))]">
          <h2 id="tour-result-title" className="rt-panel-title">
            导览结果
          </h2>
          <span className="rt-pill" data-state={loadedRepo ? "ready" : "idle"}>
            <span className="rt-dot" aria-hidden />
            {loadedRepo ? "已载入" : "待选择"}
          </span>
        </div>

        {loadedRepo ? (
          <p className="rt-hint mt-[calc(0.5rem*var(--site-space,1))]">
            已载入 <span className="font-mono text-foreground">{loadedRepo}</span> 的导览路线，
            点上方同名仓库可继续，或直接切到导览页逐站阅读。
          </p>
        ) : (
          <p className="rt-hint mt-[calc(0.5rem*var(--site-space,1))]">
            生成或选择仓库后，这里下方会展开三栏导览：左栏站点列表、中栏讲解卡片、右栏真实行号的代码证据。
          </p>
        )}
      </section>
    </div>
  );
}