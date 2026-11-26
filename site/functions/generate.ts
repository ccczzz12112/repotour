// RepoTour 模型讲解后端：浏览器只传结构化数据，提示词模板固定在本 Function 内。
// QODER_PAT 由平台注入，只在这里读取；前端与 Git 均不出现任何 Key。
import { CloudAgentsError, createCloudAgentsClient, ensureCloudResources } from "./cloud-agents.mjs";
import { readSSE } from "./sse.mjs";
import { createDbCoordinator } from "./coordinator.ts";

const APPLICATION_SCOPE = "repotour-kqnwk5p977n-prod";
const TURN_BUDGET_MS = 75_000;
const MAX_BODY_CHARS = 900_000;

const SYSTEM =
  "你是 RepoTour 的源码讲解员，为仓库新人讲解代码结构。你只输出一个 JSON 对象，" +
  "不输出任何其他文字、解释或 Markdown 代码围栏。所有结论必须基于给定数据，" +
  "证据行号必须来自给定的带行号内容，不得编造文件、符号或行号。";

type Cloud = ReturnType<typeof createCloudAgentsClient>;
type Binding = { agent: { type: string; id: string; version: number }; environment_id: string };

let cloudClient: Cloud | null = null;
let bindingPromise: Promise<Binding> | null = null;
let cachedModelId: string | null = null;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function modelConfigured(): boolean {
  return Boolean(Deno.env.get("QODER_PAT")) && Boolean(Deno.env.get("QODER_DATABASE"));
}

function getClient(): Cloud {
  if (!cloudClient) {
    const origin = Deno.env.get("QODER_CLOUD_AGENTS_ORIGIN") ?? "https://api.qoder.com.cn";
    cloudClient = createCloudAgentsClient({ origin });
  }
  return cloudClient;
}

async function selectModel(cloud: Cloud): Promise<string> {
  if (cachedModelId) return cachedModelId;
  const result = (await cloud.request("/api/v1/cloud/models")) as { data?: unknown } | unknown[];
  const list = Array.isArray(result) ? result : Array.isArray(result?.data) ? result.data : [];
  for (const m of list) {
    const o = m as { id?: unknown; enabled?: unknown; status?: unknown };
    if (typeof o.id === "string" && o.id && o.enabled !== false && o.status !== "disabled") {
      cachedModelId = o.id;
      return o.id;
    }
  }
  throw new CloudAgentsError("ai_model_unavailable", 503, "not_sent");
}

function ensureBinding(cloud: Cloud): Promise<Binding> {
  if (!bindingPromise) {
    bindingPromise = (async () => {
      const model = await selectModel(cloud);
      const coordinator = createDbCoordinator();
      return (await ensureCloudResources({
        client: cloud,
        coordinator,
        applicationScope: APPLICATION_SCOPE,
        agent: {
          name: "RepoTour 讲解助手",
          model,
          system: SYSTEM,
          tools: [],
          metadata: { app: "repotour", purpose: "repo-guide" },
        },
        environment: { name: "repotour-env", config: { type: "cloud" } },
      })) as Binding;
    })().catch((e) => {
      bindingPromise = null;
      throw e;
    });
  }
  return bindingPromise;
}

function parseJsonReply(text: string): Record<string, unknown> {
  let t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new CloudAgentsError("ai_reply_invalid", 503, "unknown");
  try {
    const parsed = JSON.parse(t.slice(start, end + 1));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    /* 落入下方统一错误 */
  }
  throw new CloudAgentsError("ai_reply_invalid", 503, "unknown");
}

function messageText(ev: Record<string, unknown>): string {
  const blocks = (ev.content ?? (ev.message as Record<string, unknown>)?.content) as unknown;
  if (Array.isArray(blocks)) {
    return blocks
      .filter((b) => (b as { type?: string })?.type === "text")
      .map((b) => String((b as { text?: unknown }).text ?? ""))
      .join("");
  }
  return typeof ev.text === "string" ? ev.text : "";
}

/** 一次模型回合：新建会话 -> 发送提示词 -> 读流等待完整 agent.message -> 解析 JSON。 */
async function runTurn(cloud: Cloud, binding: Binding, prompt: string): Promise<Record<string, unknown>> {
  const session = (await cloud.request("/api/v1/cloud/sessions", {
    method: "POST",
    body: { ...binding, title: "repotour-generate" },
  })) as { id?: string };
  if (typeof session?.id !== "string" || !/^sess_[A-Za-z0-9_-]+$/.test(session.id)) {
    throw new CloudAgentsError("ai_response_invalid", 503, "unknown");
  }
  await cloud.request(`/api/v1/cloud/sessions/${session.id}/events`, {
    method: "POST",
    body: { events: [{ type: "user.message", content: [{ type: "text", text: prompt }] }] },
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURN_BUDGET_MS);
  const upstream = await cloud.openStream(session.id, { signal: controller.signal });
  try {
    for await (const frame of readSSE(upstream.body, { signal: controller.signal })) {
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(frame.data);
      } catch {
        continue;
      }
      const type = String(ev.type ?? frame.event ?? "");
      if (type === "agent.message") {
        const text = messageText(ev);
        if (text.trim()) return parseJsonReply(text);
      } else if (type.includes("error")) {
        throw new CloudAgentsError("ai_generation_failed", 503, "unknown");
      } else if (type.includes("status")) {
        const status = String(ev.status ?? ev.state ?? (ev.data as Record<string, unknown>)?.status ?? "");
        if (status === "idle" || status === "failed" || status === "interrupted") {
          throw new CloudAgentsError("ai_no_reply", 503, "unknown");
        }
      }
    }
    throw new CloudAgentsError("ai_no_reply", 503, "unknown");
  } finally {
    clearTimeout(timer);
    upstream.close();
  }
}

// ---------- 提示词模板（固定，浏览器无权注入指令） ----------

function mapPrompt(items: Record<string, unknown>[]): string {
  const compact = items.map((it) => ({
    path: it.path,
    symbols: it.symbols,
    symbol_lines: it.symbol_lines,
    doc: it.doc,
    inbound: it.inbound,
    total_lines: it.total_lines,
    head: it.head,
  }));
  return (
    "为下列每个仓库文件生成一张模块卡片。role 候选: entry/core/data/util/api/test。\n" +
    "responsibility 为 <=60 字中文职责说明；key_symbols 从 symbols 中挑选最重要的最多 6 个。\n" +
    "evidence 每卡至少 1 条：path 必须是该文件自身，start/end 必须来自 head 中的行号或 " +
    "symbol_lines 给出的符号行号附近，end 不得超过 total_lines，不得编造。\n" +
    '只输出 JSON: {"cards":[{"path":"...","role":"...","responsibility":"...",' +
    '"key_symbols":["..."],"evidence":[{"path":"...","start":1,"end":10}]}]}\n' +
    `文件清单:\n${JSON.stringify(compact)}`
  );
}

function reducePrompt(groups: { nodes: Record<string, unknown>[]; edges: unknown[] }, cards: Record<string, unknown>[]): string {
  const respByPath = new Map<string, string>();
  for (const c of cards) {
    if (typeof c.path === "string") respByPath.set(c.path, String(c.responsibility ?? ""));
  }
  const nodes = groups.nodes.map((n) => ({
    id: n.id,
    layer: n.layer,
    paths: n.paths,
    summaries: (Array.isArray(n.paths) ? n.paths : [])
      .filter((p) => respByPath.has(String(p)))
      .map((p) => respByPath.get(String(p)))
      .slice(0, 6),
  }));
  return (
    "以下是仓库的模块分组与【已静态验证】的组间依赖边。\n" +
    `分组: ${JSON.stringify(nodes).slice(0, 6000)}\n` +
    `依赖边: ${JSON.stringify(groups.edges).slice(0, 3000)}\n\n` +
    "为每个分组给出简短中文 label（<=24字）、层级 layer(entry/api/core/data/util/test)、一句话 note（<=80字）；" +
    "为每条已有边补充 note。禁止新增边或节点。\n" +
    '只输出 JSON: {"nodes":[{"id":"...","label":"...","layer":"...","note":"..."}],' +
    '"edges":[{"source":"...","target":"...","note":"..."}]}'
  );
}

function tourPrompt(payload: Record<string, unknown>): string {
  return (
    "为仓库新人规划源码导览路线，6-10 站，沿给定调用链前进。\n" +
    `调用链: ${JSON.stringify(payload.chain).slice(0, 6000)}\n` +
    `测试: ${JSON.stringify(payload.tests)}\n` +
    `README 摘要: ${String(payload.readme ?? "").slice(0, 600)}\n\n` +
    "每站: title(简短中文)、narrative(<=150字)、why(为什么重要)、" +
    "files(证据，path/start/end 必须来自上面的调用链数据，优先复用 ev 字段)、quiz(一个理解问题)。\n" +
    '只输出 JSON: {"stops":[{"title":"...","narrative":"...","why":"...",' +
    '"files":[{"path":"...","start":1,"end":10}],"quiz":"..."}]}'
  );
}

function tasksPrompt(payload: Record<string, unknown>): string {
  return (
    "为仓库新人生成 3-5 个分级上手任务：L1 观察、L2 理解、L3 微改。\n" +
    `核心模块: ${JSON.stringify(payload.modules).slice(0, 2500)}\n` +
    `现有测试: ${JSON.stringify(payload.tests)}\n入口: ${payload.entry}\n` +
    "L3 的验收必须是跑现有测试命令全部通过，不得要求新增基础设施。files 必须来自上面给出的路径。\n" +
    '只输出 JSON: {"tasks":[{"level":1,"title":"...","description":"...",' +
    '"files":["..."],"acceptance":"...","hints":["..."]}]}'
  );
}

// ---------- 入参校验 ----------

const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const strArray = (v: unknown, maxLen: number, maxItem: number): boolean =>
  Array.isArray(v) && v.length <= maxLen && v.every((s) => isStr(s, maxItem));

function validPayload(action: string, p: Record<string, unknown>): boolean {
  if (action === "map-reduce") {
    const items = p.items;
    const groups = p.groups as Record<string, unknown> | undefined;
    if (!Array.isArray(items) || items.length < 1 || items.length > 60) return false;
    for (const it of items) {
      const o = it as Record<string, unknown>;
      if (!isStr(o.path, 300) || (o.path as string).includes("..")) return false;
      if (!isStr(o.head, 20000) && o.head !== "") return false;
      if (!strArray(o.symbols, 30, 120)) return false;
      if (!strArray(o.inbound, 8, 300)) return false;
      if (typeof o.doc !== "string" || (o.doc as string).length > 1000) return false;
      if (!Number.isInteger(o.total_lines)) return false;
      if (!Array.isArray(o.symbol_lines) || (o.symbol_lines as unknown[]).length > 20) return false;
    }
    if (!groups || !Array.isArray(groups.nodes) || groups.nodes.length < 1 || groups.nodes.length > 120) return false;
    if (!Array.isArray(groups.edges) || groups.edges.length > 3000) return false;
    for (const n of groups.nodes as Record<string, unknown>[]) {
      if (!isStr(n.id, 300) || !strArray(n.paths, 600, 300)) return false;
    }
    return true;
  }
  const chain = p.chain;
  if (!Array.isArray(chain) || chain.length < 1 || chain.length > 8) return false;
  for (const it of chain) {
    const o = it as Record<string, unknown>;
    if (!isStr(o.path, 300) || !strArray(o.symbols, 8, 120)) return false;
    if (typeof o.summary !== "string" || (o.summary as string).length > 300) return false;
  }
  if (!strArray(p.tests, 8, 300)) return false;
  if (typeof p.readme !== "string" || (p.readme as string).length > 1000) return false;
  if (!Array.isArray(p.modules) || p.modules.length > 10) return false;
  for (const m of p.modules as Record<string, unknown>[]) {
    if (!isStr(m.path, 300) || typeof m.responsibility !== "string" || (m.responsibility as string).length > 200) return false;
  }
  return typeof p.entry === "string" && (p.entry as string).length <= 300;
}

export async function handleGenerate(request: Request, url: URL): Promise<Response> {
  const action = url.searchParams.get("action");
  if (action !== "map-reduce" && action !== "tour-tasks") {
    return json({ ok: false, code: "bad_action" }, 400);
  }
  if (!modelConfigured()) return json({ ok: false, code: "model_not_configured" }, 503);
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return json({ ok: false, code: "payload_too_large" }, 413);
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text);
  } catch {
    return json({ ok: false, code: "bad_json" }, 400);
  }
  if (!payload || typeof payload !== "object" || !validPayload(action, payload)) {
    return json({ ok: false, code: "bad_payload" }, 400);
  }
  try {
    const cloud = getClient();
    const binding = await ensureBinding(cloud);
    if (action === "map-reduce") {
      const mapData = await runTurn(cloud, binding, mapPrompt(payload.items as Record<string, unknown>[]));
      const cards = Array.isArray(mapData.cards) ? (mapData.cards as Record<string, unknown>[]) : [];
      const graph = await runTurn(
        cloud,
        binding,
        reducePrompt(payload.groups as { nodes: Record<string, unknown>[]; edges: unknown[] }, cards),
      );
      return json({ ok: true, data: { cards, graph } });
    }
    const [tour, tasks] = await Promise.all([
      runTurn(cloud, binding, tourPrompt(payload)),
      runTurn(cloud, binding, tasksPrompt(payload)),
    ]);
    return json({ ok: true, data: { tour, tasks } });
  } catch (e) {
    if (e instanceof CloudAgentsError) return json({ ok: false, code: e.code }, e.status >= 400 ? e.status : 503);
    const code = String((e as Error)?.message ?? "");
    if (code.startsWith("coordinator_")) return json({ ok: false, code: "ai_initialization_pending" }, 503);
    return json({ ok: false, code: "ai_service_unavailable" }, 503);
  }
}

export function handleHealth(): Response {
  return json({ ok: true, service: "repotour-generate", modelConfigured: modelConfigured() });
}