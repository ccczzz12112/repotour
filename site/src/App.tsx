import { useCallback, useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TourRoutePage from "./pages/TourRoutePage";
import TourPage from "./pages/TourPage";
import ArchPage from "./pages/ArchPage";
import ModulesPage from "./pages/ModulesPage";
import TasksPage from "./pages/TasksPage";
import CodeViewer, { type CodeTarget } from "./components/CodeViewer";
import { type SeedData } from "./lib/seed";
import { isKnownSlug, loadRepo, repoLabel } from "./lib/repo";
import { isOnlineSlug } from "./lib/pipeline/store";

const DEFAULT_SLUG = "pallets-click";

const TABS = [
  { value: "route", label: "导览路线" },
  { value: "arch", label: "架构图" },
  { value: "modules", label: "模块地图" },
  { value: "tasks", label: "上手任务" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

type Route =
  | { view: "home" }
  | { view: "tab"; tab: Exclude<TabValue, "route">; slug: string }
  | { view: "tour"; slug: string; order: number };

function parseHash(hash: string): Route {
  const raw = decodeURIComponent(hash.replace(/^#\/?/, ""));
  const [head, arg, num] = raw.split("/");
  if (head === "tour" && arg && isKnownSlug(arg)) {
    return { view: "tour", slug: arg, order: Number(num) || 0 };
  }
  if (head === "arch" || head === "modules" || head === "tasks") {
    return { view: "tab", tab: head, slug: arg && isKnownSlug(arg) ? arg : DEFAULT_SLUG };
  }
  return { view: "home" };
}

function routeToHash(route: Route): string {
  if (route.view === "tour") {
    return route.order > 0 ? `#tour/${route.slug}/${route.order}` : `#tour/${route.slug}`;
  }
  return route.view === "home" ? "#route" : `#${route.tab}/${route.slug}`;
}

const TRIGGER_CLASS =
  "h-full shrink-0 px-[calc(0.5rem*var(--site-space,1))] text-[calc(0.875rem*var(--site-type,1))] " +
  "sm:px-[calc(0.875rem*var(--site-space,1))] sm:text-[calc(0.9375rem*var(--site-type,1))] " +
  "text-muted-foreground hover:text-foreground data-[state=active]:bg-transparent " +
  "data-[state=active]:text-foreground after:bottom-[-1px] after:h-[2px] " +
  "after:bg-[linear-gradient(90deg,var(--site-accent),var(--rt-cyan))]";

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const [seed, setSeed] = useState<{ slug: string; data: SeedData } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<CodeTarget | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const sync = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = routeToHash(next);
    if (window.location.hash === hash) setRoute(next);
    else window.location.hash = hash;
  }, []);

  const openCode = useCallback((target: CodeTarget) => setCode(target), []);
  const closeCode = useCallback(() => setCode(null), []);

  const activeSlug = route.view === "home" ? null : route.slug;

  useEffect(() => {
    if (!activeSlug) return;
    let alive = true;
    setError(null);
    setCode(null);
    loadRepo(activeSlug)
      .then((data) => {
        if (alive) setSeed({ slug: activeSlug, data });
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "导览数据加载失败");
      });
    return () => {
      alive = false;
    };
  }, [activeSlug, attempt]);

  const activeTab: TabValue = route.view === "tab" ? route.tab : "route";
  const stats = seed?.data.result.stats;
  const needsSeed = route.view !== "home";
  const ready = needsSeed && seed?.slug === activeSlug && !error;
  const repo = activeSlug ? repoLabel(activeSlug) : "";
  const pickRepo = (slug: string) => {
    if (route.view === "tab") navigate({ view: "tab", tab: route.tab, slug });
    else if (route.view === "tour") navigate({ view: "tour", slug, order: 0 });
  };

  return (
    <div className="rt-shell">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col px-[calc(1rem*var(--site-space,1))] sm:px-[calc(1.5rem*var(--site-space,1))]">
        <header className="rt-header -mx-[calc(1rem*var(--site-space,1))] px-[calc(1rem*var(--site-space,1))] sm:-mx-[calc(1.5rem*var(--site-space,1))] sm:px-[calc(1.5rem*var(--site-space,1))]">
          <div className="flex flex-wrap items-center justify-between gap-y-[calc(0.5rem*var(--site-space,1))] pt-[calc(0.875rem*var(--site-space,1))]">
            <button
              type="button"
              className="flex items-center gap-[calc(0.625rem*var(--site-space,1))] text-left"
              onClick={() => navigate({ view: "home" })}
            >
              <span className="rt-brand-mark" aria-hidden>
                码
              </span>
              <span className="leading-tight">
                <span className="block text-[calc(1rem*var(--site-type,1))] font-semibold tracking-tight">
                  RepoTour 码途
                </span>
                <span className="rt-hint block">仓库导游 · 2026 Qoder 高校创造力大赛</span>
              </span>
            </button>

            <span
              className="rt-pill"
              data-state={stats ? "ready" : "idle"}
              title={
                stats
                  ? "每条讲解都绑定了真实代码行号并程序校验通过"
                  : "载入某个仓库的导览后，这里显示已验证的代码引用数"
              }
              aria-label={
                stats
                  ? `引用验证 ${stats.evidence_passed}/${stats.evidence_total} 通过`
                  : "引用验证状态：待生成"
              }
            >
              <span className="rt-dot" aria-hidden />
              引用验证 {stats ? `${stats.evidence_passed}/${stats.evidence_total}` : "—/—"}
            </span>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const next = value as TabValue;
              navigate(
                next === "route"
                  ? { view: "home" }
                  : { view: "tab", tab: next, slug: activeSlug ?? DEFAULT_SLUG },
              );
            }}
            className="mt-[calc(0.375rem*var(--site-space,1))]"
          >
            <TabsList
              variant="line"
              className="rt-tablist scrollbar-none h-[calc(2.5rem*var(--site-space,1))] w-full min-w-0 justify-start gap-[calc(0.25rem*var(--site-space,1))] overflow-x-auto p-0"
            >
              {TABS.map((item) => (
                <TabsTrigger key={item.value} value={item.value} className={TRIGGER_CLASS}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </header>

        <main className="flex-1 py-[calc(1.25rem*var(--site-space,1))] sm:py-[calc(1.75rem*var(--site-space,1))]">
          {route.view === "home" && (
            <TourRoutePage
              loadedRepo={seed ? repoLabel(seed.slug) : null}
              onPick={(slug) => navigate({ view: "tour", slug, order: 0 })}
            />
          )}

          {needsSeed && !ready && (
            <div className="rt-card p-[calc(1.5rem*var(--site-space,1))]">
              {error ? (
                <>
                  <h2 className="rt-panel-title">导览数据加载失败</h2>
                  <p className="rt-hint mt-[calc(0.5rem*var(--site-space,1))]">{error}</p>
                  <button
                    type="button"
                    className="rt-tool mt-[calc(0.875rem*var(--site-space,1))]"
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    重试
                  </button>
                </>
              ) : (
                <>
                  <h2 className="rt-panel-title">
                    {activeSlug && isOnlineSlug(activeSlug) ? "正在载入本机保存的在线结果…" : "正在载入预烘焙种子…"}
                  </h2>
                  <p className="rt-hint mt-[calc(0.5rem*var(--site-space,1))]">
                    {repo} · {activeSlug && isOnlineSlug(activeSlug) ? "结果存在本机浏览器，不请求外网。" : "数据随站点一起发布，不请求外网。"}
                  </p>
                  <div className="rt-skeleton mt-[calc(1rem*var(--site-space,1))]" aria-hidden>
                    <span className="rt-bar" style={{ width: "40%" }} />
                    <span className="rt-bar" style={{ width: "72%" }} />
                    <span className="rt-bar" style={{ width: "58%" }} />
                  </div>
                </>
              )}
            </div>
          )}

          {ready && seed && route.view === "tour" && (
            <TourPage
              seed={seed.data}
              order={route.order}
              repo={repo}
              onOrderChange={(order) => navigate({ view: "tour", slug: route.slug, order })}
            />
          )}

          {ready && seed && route.view === "tab" && (
            <>
              {route.tab === "arch" && (
                <ArchPage seed={seed.data} slug={route.slug} repo={repo} onPickRepo={pickRepo} onOpenCode={openCode} />
              )}
              {route.tab === "modules" && (
                <ModulesPage seed={seed.data} slug={route.slug} repo={repo} onPickRepo={pickRepo} onOpenCode={openCode} />
              )}
              {route.tab === "tasks" && (
                <TasksPage seed={seed.data} slug={route.slug} repo={repo} onPickRepo={pickRepo} onOpenCode={openCode} />
              )}
            </>
          )}
        </main>

        <footer className="border-t border-border py-[calc(1rem*var(--site-space,1))]">
          <p className="rt-hint">
            当前版本：预烘焙示例（pallets/click、psf/requests、axios/axios）离线可看；输入任意公开 GitHub 仓库可在线生成——
            依赖边与行号来自浏览器内真实静态解析，模型只补讲解文案，每条引用程序校验后才展示。
          </p>
        </footer>
      </div>

      <CodeViewer
        target={code}
        text={code && seed ? seed.data.files[code.path] : undefined}
        onClose={closeCode}
      />
    </div>
  );
}
