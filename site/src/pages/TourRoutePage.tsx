import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { loadSeed, SEEDS, type SeedKey } from "../lib/seed";

const EXAMPLES: { key: SeedKey; label: string; note: string }[] = [
  { key: "pallets-click", label: "pallets/click", note: "Python 命令行工具库 · 10 站" },
  { key: "psf-requests", label: "psf/requests", note: "Python HTTP 客户端库 · 10 站" },
  { key: "axios-axios", label: "axios/axios", note: "浏览器与 Node 请求库 · 10 站" },
];

type TourRoutePageProps = {
  loadedRepo: string | null;
  onPick: (slug: SeedKey) => void;
};

export default function TourRoutePage({ loadedRepo, onPick }: TourRoutePageProps) {
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
            在线生成即将开放
          </Badge>
        </div>

        <div className="mt-[calc(0.625rem*var(--site-space,1))] flex flex-col gap-[calc(0.5rem*var(--site-space,1))] sm:flex-row">
          <Input
            id="repo-url"
            disabled
            placeholder="https://github.com/owner/repo"
            aria-describedby="repo-url-note"
            className="h-11 flex-1 bg-background/60 font-mono text-sm sm:h-12"
          />
          <Button disabled size="lg" className="h-11 shrink-0 sm:h-12">
            生成导览
          </Button>
        </div>

        <p id="repo-url-note" className="rt-hint mt-[calc(0.5rem*var(--site-space,1))]">
          在线解析尚未接入，可先用下方已预烘焙好的示例仓库。
        </p>

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
            点上方同名示例可继续，或直接切到导览页逐站阅读。
          </p>
        ) : (
          <p className="rt-hint mt-[calc(0.5rem*var(--site-space,1))]">
            选择示例后，这里下方会展开三栏导览：左栏站点列表、中栏讲解卡片、右栏真实行号的代码证据。
          </p>
        )}
      </section>
    </div>
  );
}
