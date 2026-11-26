// 开发期冒烟：在 Node 里跑完整七步流水线（模型调用在 Node 下必然失败 -> 验证确定性兜底全链路）。
import { generateRepo } from "../src/lib/pipeline/generate";
import { validate } from "../src/lib/pipeline/evidence";

const repo = process.argv[2] ?? "https://github.com/pallets/flask";
const { data, modelUsed } = await generateRepo(repo, (s) => {
  console.log(`[${s.key}] ${s.status} ${s.detail}`);
});

const r = data.result;
const badEvidence: string[] = [];
for (const m of r.modules) for (const ev of m.evidence) if (!validate(ev, data.files)) badEvidence.push(`module ${m.path}`);
for (const s of r.tour) for (const ev of s.files) if (!validate(ev, data.files)) badEvidence.push(`tour ${s.title}`);

console.log(JSON.stringify({
  modelUsed,
  meta: data.meta,
  overviewStats: r.overview.stats,
  entries: r.overview.entries,
  tests: r.overview.tests.length,
  rankedTop5: r.modules.slice(0, 5).map((m) => `${m.path} (${m.role}) ${m.responsibility}`),
  graph: { nodes: r.graph.nodes.length, edges: r.graph.edges.length, allVerified: r.graph.edges.every((e) => e.verified) },
  tour: r.tour.map((t) => `${t.order}. ${t.title} [${t.files.length} 证据]`),
  tasks: r.tasks.map((t) => `L${t.level} ${t.title} -> ${t.acceptance}`),
  stats: r.stats,
  storedFiles: Object.keys(data.files).length,
  badEvidence,
}, null, 2));

const assert = (ok: boolean, msg: string) => {
  if (!ok) {
    console.error(`ASSERT FAIL: ${msg}`);
    process.exitCode = 1;
  }
};
assert(r.overview.stats.edges > 0, "依赖边应大于 0");
assert(r.tour.length >= 6 && r.tour.length <= 10, "导览应 6-10 站");
assert(r.tour[0].title.includes("全景"), "第 0 站应为全景");
assert(r.graph.edges.every((e) => e.verified), "所有架构边必须已验证");
assert(badEvidence.length === 0, "所有证据必须通过校验");
assert(r.tasks.length >= 3, "任务应 >= 3");
assert(r.stats.evidence_passed <= r.stats.evidence_total, "验证统计合法");
console.log(process.exitCode ? "SMOKE FAILED" : "SMOKE OK");