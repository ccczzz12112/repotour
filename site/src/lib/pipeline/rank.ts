import type { RankedFile, ScanData } from "./types";

export const TOP_K_FILES = 60;

/** 步骤3 Rank：PageRank-lite + 入口加成 + 规模因子。控制模型 token 成本的关键闸门。 */
export function rank(scanData: ScanData, topK = TOP_K_FILES): RankedFile[] {
  const files = new Map(scanData.files.map((f) => [f.path, f]));
  const src = scanData.files
    .filter((f) => f.lang === "python" || f.lang === "javascript" || f.lang === "typescript")
    .map((f) => f.path);
  const tests = new Set(scanData.tests);
  let cand = src.filter((p) => !tests.has(p));
  if (cand.length === 0) cand = src.length ? src : [...files.keys()];
  const edges = scanData.edges.filter((e) => files.has(e.src) && files.has(e.dst));
  const outDeg = new Map<string, number>();
  const inbound = new Map<string, string[]>();
  for (const e of edges) {
    outDeg.set(e.src, (outDeg.get(e.src) ?? 0) + 1);
    const list = inbound.get(e.dst) ?? [];
    list.push(e.src);
    inbound.set(e.dst, list);
  }
  const n = Math.max(cand.length, 1);
  let score = new Map<string, number>(cand.map((p) => [p, 1 / n]));
  for (let round = 0; round < 12; round++) {
    const next = new Map<string, number>();
    for (const p of cand) {
      let s = 0.15 / n;
      for (const q of inbound.get(p) ?? []) {
        const qs = score.get(q);
        if (qs !== undefined) s += (0.85 * qs) / Math.max(outDeg.get(q) ?? 1, 1);
      }
      next.set(p, s);
    }
    score = next;
  }
  const entries = new Set(scanData.entries);
  const ranked: RankedFile[] = cand.map((p) => {
    let s = score.get(p) ?? 0;
    const reasons: string[] = [];
    if (entries.has(p)) {
      s *= 3.0;
      reasons.push("入口文件");
    }
    const inb = inbound.get(p);
    if (inb?.length) reasons.push(`被 ${inb.length} 个文件导入`);
    const size = files.get(p)?.size ?? 0;
    s *= 1.0 + Math.min(Math.log10(Math.max(size, 1)) / 10.0, 0.5);
    return { path: p, score: Math.round(s * 1e6) / 1e6, reasons };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, topK);
}

export function inboundCounts(scanData: ScanData): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of scanData.edges) counts.set(e.dst, (counts.get(e.dst) ?? 0) + 1);
  return counts;
}