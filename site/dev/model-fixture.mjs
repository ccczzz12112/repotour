// 本地开发桩（非真实模型）：模拟站点后端 /functions/v1/app/generate 的响应形状，
// 用于在没有云端凭据时联调前端合并/证据校验逻辑。返回内容全部由入参确定性推导。
// 用法: node dev/model-fixture.mjs  （Vite 已把 /functions/v1/app 代理到 127.0.0.1:8000）
import { createServer } from "node:http";

const roleOf = (path) => {
  const stem = (path.split("/").pop() ?? "").replace(/\.[^.]+$/, "").toLowerCase();
  if (stem.startsWith("test_") || stem.includes("test")) return "test";
  if (["main", "cli", "app", "__main__", "__init__", "index", "server"].includes(stem)) return "entry";
  if (["util", "helper", "compat", "format"].some((k) => stem.includes(k))) return "util";
  if (["api", "route", "view", "handler"].some((k) => stem.includes(k))) return "api";
  return "core";
};

function mockMapReduce(payload) {
  const cards = (payload.items ?? []).map((it) => {
    const line = it.symbol_lines?.[0]?.line ?? 1;
    return {
      path: it.path,
      role: roleOf(it.path),
      responsibility: `【开发桩】${it.path.split("/").pop()} 模块，含 ${(it.symbols ?? []).length} 个顶层符号`,
      key_symbols: (it.symbols ?? []).slice(0, 6),
      evidence: [{ path: it.path, start: line, end: Math.min(line + 10, it.total_lines ?? line + 10) }],
    };
  });
  const graph = {
    nodes: (payload.groups?.nodes ?? []).map((n) => ({
      id: n.id,
      label: `【桩】${n.id.split("/").pop() || n.id}`.slice(0, 24),
      layer: n.layer,
      note: "开发桩注释",
    })),
    edges: (payload.groups?.edges ?? []).map((e) => ({ source: e.source, target: e.target, note: "开发桩注释" })),
  };
  return { cards, graph };
}

function mockTourTasks(payload) {
  const stops = (payload.chain ?? []).map((it, i) => ({
    title: `第${i + 1}站 · ${it.path.split("/").pop()}`,
    narrative: `【开发桩】${it.summary || it.path + " 模块讲解"}`,
    why: it.prev ? `被 ${it.prev.split("/").pop()} 导入` : "调用链起点",
    files: it.ev ? [it.ev] : [],
    quiz: `${it.path} 负责什么？`,
  }));
  const entry = payload.entry || payload.modules?.[0]?.path || "";
  const core = payload.modules?.[1]?.path ?? entry;
  const tasks = [
    { level: 1, title: "【桩】找到入口", description: `打开 ${entry}`, files: [entry], acceptance: "说出启动流程", hints: ["看 import"] },
    { level: 2, title: "【桩】画调用链", description: `${entry} -> ${core}`, files: [entry, core].filter(Boolean), acceptance: "与 import 一致", hints: ["看架构图"] },
    { level: 3, title: "【桩】补一条测试", description: `为 ${core} 补用例`, files: [core, ...(payload.tests ?? []).slice(0, 1)], acceptance: "现有测试全部通过", hints: ["先跑通现有测试"] },
  ];
  return { tour: { stops }, tasks: { tasks } };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname.replace(/^\/functions\/v1/, "").replace(/^\/app/, "") || "/";
  const send = (body, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && (path === "/" || path === "/health")) {
    return send({ ok: true, service: "repotour-generate-FIXTURE", modelConfigured: true });
  }
  if (req.method === "POST" && path === "/generate") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return send({ ok: false, code: "bad_json" }, 400);
    }
    const action = url.searchParams.get("action");
    if (action === "map-reduce") return send({ ok: true, data: mockMapReduce(payload) });
    if (action === "tour-tasks") return send({ ok: true, data: mockTourTasks(payload) });
    return send({ ok: false, code: "bad_action" }, 400);
  }
  send({ ok: false, code: "not_found" }, 404);
});

server.listen(8001, "127.0.0.1", () => {
  console.log("[fixture] 开发桩模型后端 http://127.0.0.1:8001 （非真实模型，仅供本地联调）");
});