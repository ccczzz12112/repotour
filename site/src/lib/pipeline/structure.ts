import type { GraphEdge, GraphNode, ModuleCard, OnboardTask, TourStop } from "../seed";
import type { ChainItem, EvidenceRef, GroupEdge, GroupNode, RankedFile, ScanData } from "./types";
import { filterValid, firstLines, safeRel } from "./evidence";

const LAYERS = new Set(["entry", "api", "core", "data", "util", "test"]);

export function baseOf(path: string): string {
  return path.split("/").pop() ?? path;
}

export function stemOf(path: string): string {
  const name = baseOf(path);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** 按文件名与目录段判定角色（避免 click 这种包名里含 cli 被误判为入口）。 */
export function guessRole(path: string): string {
  const stem = stemOf(path).toLowerCase();
  const parts = path.split("/").slice(0, -1).map((x) => x.toLowerCase());
  if (stem.startsWith("test_") || stem.endsWith("_test") || stem.endsWith("_tests") || parts.includes("tests") || parts.includes("test")) return "test";
  if (["__main__", "main", "cli", "app", "run", "manage", "server", "wsgi", "asgi", "__init__"].includes(stem)) return "entry";
  if (["model", "schema", "entity", "storage", "db", "dao", "repository"].some((k) => stem.includes(k))) return "data";
  if (["util", "helper", "common", "compat", "converter", "format"].some((k) => stem.includes(k))) return "util";
  if (["api", "route", "view", "handler", "endpoint", "middleware"].some((k) => stem.includes(k))) return "api";
  if (["config", "settings", "constants", "options"].some((k) => stem.includes(k))) return "util";
  return "core";
}

export function docstringOf(text: string, path: string): string {
  if (path.endsWith(".py")) {
    const m = /^[ \t\r\n]*(?:#[^\n]*\n[ \t\r\n]*)*(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/.exec(text);
    return m ? (m[1] ?? m[2] ?? "").trim() : "";
  }
  const m = /\/\*\*([\s\S]*?)\*\//.exec(text);
  return m ? m[1].trim() : "";
}

/** README 片段清洗成可读纯文本：去标签/图片/链接/标题行，按句子边界截断。 */
export function cleanText(text: string, limit = 160): string {
  let t = (text || "").replace(/<[^>]+>/g, " ");
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  t = t.replace(/[*_`|]+/g, "");
  const lines: string[] = [];
  for (const raw of t.split("\n")) {
    const s = raw.replace(/^[#>*\-\s]+/, "").trim();
    if (!s || s.length <= 14) continue;
    lines.push(s);
  }
  t = lines.join(" ").replace(/\s+/g, " ").trim().replace(/^[-: ]+|[-: ]+$/g, "");
  if (t.length > limit) {
    const cut = Math.max(t.lastIndexOf("。", limit), t.lastIndexOf(". ", limit), t.lastIndexOf("；", limit));
    t = cut > Math.floor(limit / 2) ? t.slice(0, cut + 1) : `${t.slice(0, limit).split(" ").slice(0, -1).join(" ")}…`;
  }
  return t;
}

// ---------- Reduce：分组骨架（零模型） ----------

export function groupFiles(scan: ScanData): Map<string, string[]> {
  let g = new Map<string, string[]>();
  for (const f of scan.files) {
    if (f.lang !== "python" && f.lang !== "javascript" && f.lang !== "typescript") continue;
    const key = dirname(f.path) || ".";
    const list = g.get(key) ?? [];
    list.push(f.path);
    g.set(key, list);
  }
  if (g.size > 28) {
    const g2 = new Map<string, string[]>();
    for (const [key, ps] of g) {
      const top = key.split("/")[0];
      g2.set(top, [...(g2.get(top) ?? []), ...ps]);
    }
    g = g2;
  }
  return g;
}

export function guessLayer(gid: string, paths: string[], entries: Set<string>): string {
  if (paths.some((p) => entries.has(p))) return "entry";
  const low = gid.toLowerCase();
  if (low.includes("test")) return "test";
  if (["model", "data", "storage", "db", "dao"].some((k) => low.includes(k))) return "data";
  if (["util", "helper", "common"].some((k) => low.includes(k))) return "util";
  if (["api", "route", "view", "handler"].some((k) => low.includes(k))) return "api";
  return "core";
}

/** 节点分组与组间边完全来自静态分析；模型只命名/分层/注释，无权新增边。 */
export function buildGroups(scan: ScanData, cards: ModuleCard[]): { nodes: GroupNode[]; edges: GroupEdge[] } {
  const groups = groupFiles(scan);
  const entries = new Set(scan.entries);
  const cardsByPath = new Map(cards.map((c) => [c.path, c]));
  const file2group = new Map<string, string>();
  for (const [gid, ps] of groups) for (const p of ps) file2group.set(p, gid);
  const gedges = new Map<string, number>();
  for (const e of scan.edges) {
    const a = file2group.get(e.src);
    const b = file2group.get(e.dst);
    if (a && b && a !== b) {
      const k = `${a}\n${b}`;
      gedges.set(k, (gedges.get(k) ?? 0) + 1);
    }
  }
  const nodes: GroupNode[] = [...groups].map(([gid, ps]) => ({
    id: gid,
    layer: guessLayer(gid, ps, entries),
    paths: ps,
    summaries: ps.filter((p) => cardsByPath.has(p)).map((p) => cardsByPath.get(p)!.responsibility).slice(0, 6),
  }));
  const edges: GroupEdge[] = [...gedges].map(([k, count]) => {
    const [source, target] = k.split("\n");
    return { source, target, count };
  });
  return { nodes, edges };
}

export function mergeReduce(
  skeleton: { nodes: GroupNode[]; edges: GroupEdge[] },
  llmData: unknown,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const data = (llmData && typeof llmData === "object" ? llmData : {}) as { nodes?: unknown; edges?: unknown };
  const llmNodes = new Map<string, Record<string, unknown>>();
  for (const n of Array.isArray(data.nodes) ? data.nodes : []) {
    if (n && typeof n === "object" && typeof (n as { id?: unknown }).id === "string") {
      llmNodes.set((n as { id: string }).id, n as Record<string, unknown>);
    }
  }
  const nodes: GraphNode[] = skeleton.nodes.map((n) => {
    const ln = llmNodes.get(n.id) ?? {};
    let layer = typeof ln.layer === "string" && ln.layer ? ln.layer : n.layer;
    if (!LAYERS.has(layer)) layer = n.layer;
    const label = String(ln.label || n.id.split("/").pop() || n.id).slice(0, 24);
    return { id: n.id, label, layer, type: "module", paths: n.paths, note: String(ln.note || "").slice(0, 80) };
  });
  const llmEdges = new Map<string, Record<string, unknown>>();
  for (const e of Array.isArray(data.edges) ? data.edges : []) {
    if (e && typeof e === "object") {
      const o = e as { source?: unknown; target?: unknown };
      if (typeof o.source === "string" && typeof o.target === "string") llmEdges.set(`${o.source}\n${o.target}`, e as Record<string, unknown>);
    }
  }
  const edges: GraphEdge[] = skeleton.edges.map((e) => {
    const le = llmEdges.get(`${e.source}\n${e.target}`) ?? {};
    return { source: e.source, target: e.target, kind: "import", verified: true, note: String(le.note || "").slice(0, 80) };
  });
  return { nodes, edges };
}

// ---------- Map：逐文件卡片 ----------

export type MapItem = {
  path: string;
  score: number;
  symbols: string[];
  symbol_lines: { name: string; line: number }[];
  doc: string;
  inbound: string[];
  head: string;
  total_lines: number;
  head_ev: EvidenceRef | null;
  first_symbol_ev: EvidenceRef | null;
};

export function buildMapItems(scan: ScanData, ranked: RankedFile[], texts: Record<string, string>): MapItem[] {
  const inbound = new Map<string, string[]>();
  for (const e of scan.edges) {
    const list = inbound.get(e.dst) ?? [];
    list.push(e.src);
    inbound.set(e.dst, list);
  }
  return ranked.map((r) => {
    const p = r.path;
    const text = texts[p] ?? "";
    const lines = text.split("\n");
    const syms = scan.symbols[p] ?? [];
    const head = lines.slice(0, 50).map((l, i) => `${i + 1}: ${l.slice(0, 200)}`).join("\n");
    const symbol_lines: { name: string; line: number }[] = [];
    for (const sym of syms.slice(0, 12)) {
      const idx = lines.findIndex((l) => l.includes(sym));
      if (idx >= 0) symbol_lines.push({ name: sym, line: idx + 1 });
    }
    let firstEv: EvidenceRef | null = null;
    for (let i = 0; i < lines.length; i++) {
      const ls = lines[i].replace(/^\s+/, "");
      if (/^(def |class |async def |function |export )/.test(ls)) {
        firstEv = { path: p, start: i + 1, end: Math.min(i + 15, lines.length) };
        if (syms.length) firstEv.symbol = syms[0];
        break;
      }
    }
    return {
      path: p,
      score: r.score,
      symbols: syms.slice(0, 20),
      symbol_lines,
      doc: docstringOf(text, p).slice(0, 400),
      inbound: (inbound.get(p) ?? []).slice(0, 8),
      head,
      total_lines: lines.length,
      head_ev: firstLines(texts, p),
      first_symbol_ev: firstEv,
    };
  });
}

export function mapFallback(item: MapItem): { role: string; responsibility: string; key_symbols: string[]; evidence: EvidenceRef[] } {
  const flat = item.doc.replace(/\s+/g, " ").trim();
  let resp: string;
  if (flat) {
    resp = flat.split("。")[0];
    if (resp.length > 70) resp = `${resp.slice(0, 70).split(" ").slice(0, -1).join(" ")}…`;
  } else {
    resp = `${stemOf(item.path)} 模块，含 ${item.symbols.length} 个顶层符号`;
  }
  const ev = item.first_symbol_ev ?? item.head_ev;
  return { role: guessRole(item.path), responsibility: resp, key_symbols: item.symbols.slice(0, 6), evidence: ev ? [ev] : [] };
}

export function mergeMap(
  items: MapItem[],
  llmCards: unknown,
  texts: Record<string, string>,
): { cards: ModuleCard[]; evTotal: number; evPassed: number } {
  const byPath = new Map<string, Record<string, unknown>>();
  for (const c of Array.isArray(llmCards) ? llmCards : []) {
    if (c && typeof c === "object" && typeof (c as { path?: unknown }).path === "string") {
      byPath.set((c as { path: string }).path, c as Record<string, unknown>);
    }
  }
  let evTotal = 0;
  let evPassed = 0;
  const cards: ModuleCard[] = items.map((item) => {
    const data = byPath.get(item.path) ?? mapFallback(item);
    let [evs, total] = filterValid(data.evidence, texts);
    evTotal += total;
    if (evs.length === 0) {
      const ev = item.first_symbol_ev ?? item.head_ev;
      if (ev) evs = [ev];
    }
    evPassed += evs.length;
    return {
      path: item.path,
      role: String(data.role || guessRole(item.path)),
      responsibility: String(data.responsibility || "").slice(0, 120),
      key_symbols: (Array.isArray(data.key_symbols) ? data.key_symbols : []).map(String).slice(0, 8),
      importance: item.score,
      evidence: evs,
    };
  });
  return { cards, evTotal, evPassed };
}

// ---------- Tour：真实调用链 ----------

/** 沿 import 边从入口走出一条真实调用链；不足 8 个时按中心度补齐。 */
export function chainOf(scan: ScanData, ranked: RankedFile[]): { chain: string[]; onChain: number; prev: Map<string, string> } {
  const score = new Map(ranked.map((r) => [r.path, r.score]));
  const adj = new Map<string, string[]>();
  for (const e of scan.edges) {
    const list = adj.get(e.src) ?? [];
    list.push(e.dst);
    adj.set(e.src, list);
  }
  const entries = scan.entries;
  let start: string | null = null;
  if (entries.length) {
    start = entries.reduce((best, p) => ((score.get(p) ?? 0) > (score.get(best) ?? 0) ? p : best), entries[0]);
  } else if (ranked.length) {
    start = ranked[0].path;
  }
  const chain: string[] = [];
  const seen = new Set<string>();
  let cur = start;
  while (cur && !seen.has(cur) && chain.length < 8) {
    chain.push(cur);
    seen.add(cur);
    const nxts = (adj.get(cur) ?? []).filter((p) => !seen.has(p) && score.has(p));
    cur = nxts.length ? nxts.reduce((best, p) => ((score.get(p) ?? 0) > (score.get(best) ?? 0) ? p : best), nxts[0]) : null;
  }
  const onChain = chain.length;
  const prev = new Map<string, string>();
  for (let i = 1; i < chain.length; i++) prev.set(chain[i], chain[i - 1]);
  for (const r of ranked) {
    if (chain.length >= 8) break;
    if (!seen.has(r.path)) {
      chain.push(r.path);
      seen.add(r.path);
    }
  }
  return { chain, onChain, prev };
}

function evFor(path: string, cardsByPath: Map<string, ModuleCard>, texts: Record<string, string>): EvidenceRef | null {
  const card = cardsByPath.get(path);
  if (card?.evidence.length) return { ...card.evidence[0] };
  return firstLines(texts, path);
}

export function buildTourItems(scan: ScanData, ranked: RankedFile[], cards: ModuleCard[], texts: Record<string, string>): ChainItem[] {
  const cardsByPath = new Map(cards.map((c) => [c.path, c]));
  const { chain, onChain, prev } = chainOf(scan, ranked);
  const inbound = new Map<string, number>();
  for (const e of scan.edges) inbound.set(e.dst, (inbound.get(e.dst) ?? 0) + 1);
  return chain.map((p, idx) => {
    const c = cardsByPath.get(p);
    return {
      path: p,
      symbols: c?.key_symbols.length ? c.key_symbols : (scan.symbols[p] ?? []).slice(0, 5),
      summary: c?.responsibility ?? "",
      symbol_count: (scan.symbols[p] ?? []).length,
      inbound: inbound.get(p) ?? 0,
      on_chain: idx < onChain,
      prev: idx < onChain ? (prev.get(p) ?? "") : "",
      ev: evFor(p, cardsByPath, texts),
    };
  });
}

type DraftStop = { title: string; narrative: string; why: string; files: EvidenceRef[]; quiz: string };

export function tourFallback(items: ChainItem[]): DraftStop[] {
  return items.map((item, i) => {
    const p = item.path;
    const syms = item.symbols;
    const n = item.symbol_count || syms.length;
    let why: string;
    if (item.prev) why = `它被 ${baseOf(item.prev)} 直接导入，是这条调用链上的第 ${i} 跳。`;
    else if (item.on_chain) why = "这是程序的入口，所有能力都从这里串起来。";
    else why = `按依赖中心度入选：被 ${item.inbound} 个文件引用。`;
    let narr = item.summary || `${stemOf(p)} 模块，含 ${n} 个顶层符号。`;
    if (syms.length) narr = `${narr.replace(/[。；]+$/, "")}；重点看 ${syms.slice(0, 3).join("、")}。`;
    return {
      title: `第${i + 1}站 · ${baseOf(p)}`,
      narrative: cleanText(narr, 200),
      why,
      files: item.ev ? [item.ev] : [],
      quiz: syms.length ? `${syms[0]} 在 ${p} 中的作用是什么？` : `${p} 负责什么？`,
    };
  });
}

export function mergeTour(
  llmStops: unknown,
  items: ChainItem[],
  scan: ScanData,
  ranked: RankedFile[],
  cards: ModuleCard[],
  texts: Record<string, string>,
): { stops: TourStop[]; evTotal: number; evPassed: number } {
  let evTotal = 0;
  let evPassed = 0;
  const data = (llmStops && typeof llmStops === "object" ? llmStops : {}) as { stops?: unknown };
  let stops: DraftStop[] = [];
  for (const s of Array.isArray(data.stops) ? data.stops : []) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const [evs, total] = filterValid(o.files, texts);
    evTotal += total;
    evPassed += evs.length;
    if (evs.length === 0) continue;
    stops.push({
      title: String(o.title || "").slice(0, 40),
      narrative: cleanText(String(o.narrative || ""), 300),
      why: cleanText(String(o.why || ""), 120),
      files: evs,
      quiz: String(o.quiz || "").slice(0, 120),
    });
  }
  if (stops.length < 4) {
    stops = [];
    for (const s of tourFallback(items)) {
      const [evs, total] = filterValid(s.files, texts);
      evTotal += total;
      evPassed += evs.length;
      if (evs.length) stops.push({ ...s, files: evs });
    }
  }
  const cardsByPath = new Map(cards.map((c) => [c.path, c]));
  let headEv: EvidenceRef | null = null;
  for (const r of ranked) {
    headEv = evFor(r.path, cardsByPath, texts);
    if (headEv) break;
  }
  const readmeLine = cleanText(scan.readme, 150);
  const overview: DraftStop = {
    title: "第0站 · 全景与入口",
    narrative: readmeLine
      ? `${readmeLine} 全仓共 ${scan.stats.source_files} 个源码文件、${scan.stats.edges} 条模块依赖边。`
      : "先看 README 与目录结构，建立整体印象。",
    why: "读细节之前，先建立全局地图。",
    files: headEv ? [headEv] : [],
    quiz: "这个仓库解决什么问题？",
  };
  let all = [overview, ...stops];
  if (scan.tests.length) {
    const tev = firstLines(texts, scan.tests[0]);
    if (tev) {
      all.push({
        title: "最后一站 · 测试与质量",
        narrative: `全仓共 ${scan.tests.length} 个测试文件；先跑通它们，再动手改代码，是验证理解最可靠的方式。`,
        why: "测试是可执行的文档。",
        files: [tev],
        quiz: "哪个测试覆盖了核心模块？",
      });
    }
  }
  all = all.slice(0, 10);
  return { stops: all.map((s, i) => ({ ...s, order: i + 1 })), evTotal, evPassed };
}

// ---------- Tasks：分级上手任务 ----------

export type TasksPayload = { modules: { path: string; responsibility: string }[]; tests: string[]; entry: string };

export function buildTasksPayload(cards: ModuleCard[], scan: ScanData): TasksPayload {
  const mods = cards.slice(0, 10).map((c) => ({ path: c.path, responsibility: c.responsibility }));
  return {
    modules: mods,
    tests: scan.tests.slice(0, 8),
    entry: scan.entries[0] ?? mods[0]?.path ?? "",
  };
}

export function tasksFallback(payload: TasksPayload): OnboardTask[] {
  const { modules: mods, tests, entry } = payload;
  const core = mods.length > 1 ? mods[1].path : (mods[0]?.path ?? entry);
  const testCmd = tests.some((t) => t.endsWith(".py")) ? "pytest" : "npm test";
  const tasks: OnboardTask[] = [
    {
      level: 1, title: "找到入口与启动流程",
      description: `打开 ${entry}，列出它导入的前 3 个内部模块。`,
      files: entry ? [entry] : [],
      acceptance: "能口头说出启动流程与对应文件", hints: ["看 import 区"],
    },
    {
      level: 2, title: "画出一条调用链",
      description: `从 ${entry} 出发，画出到 ${core} 的依赖路径。`,
      files: [entry, core].filter(Boolean),
      acceptance: "路径与真实 import 关系一致", hints: ["用架构图核对"],
    },
  ];
  if (tests.length) {
    tasks.push({
      level: 3, title: "为核心模块补一条测试",
      description: `为 ${core} 中的一个函数补充边界用例，加到 ${tests[0]}。`,
      files: [core, tests[0]],
      acceptance: `运行 ${testCmd} 全部通过`,
      hints: ["先跑通现有测试确认环境"],
    });
  }
  return tasks;
}

export function mergeTasks(llmTasks: unknown, payload: TasksPayload, texts: Record<string, string>): OnboardTask[] {
  const data = (llmTasks && typeof llmTasks === "object" ? llmTasks : {}) as { tasks?: unknown };
  let tasks: OnboardTask[] = [];
  for (const t of Array.isArray(data.tasks) ? data.tasks : []) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    const files = (Array.isArray(o.files) ? o.files : [])
      .map((f) => safeRel(f))
      .filter((f): f is string => !!f && texts[f] !== undefined);
    if (files.length === 0) continue;
    const level = o.level === 1 || o.level === 2 || o.level === 3 ? o.level : 1;
    tasks.push({
      level,
      title: String(o.title || "").slice(0, 40),
      description: String(o.description || "").slice(0, 200),
      files,
      acceptance: String(o.acceptance || "").slice(0, 120),
      hints: (Array.isArray(o.hints) ? o.hints : []).map((h) => String(h).slice(0, 80)).slice(0, 3),
    });
  }
  if (tasks.length < 3) tasks = tasksFallback(payload).filter((t) => t.files.length > 0);
  return tasks.slice(0, 5);
}