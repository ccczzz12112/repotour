import type { EvidenceRef } from "./types";

/** 路径安全：拒绝绝对路径 / .. 穿越 / 盘符 */
export function safeRel(path: unknown): string | null {
  const p = String(path ?? "").replace(/\\/g, "/").trim().replace(/^\/+/, "");
  if (!p || p.split("/").includes("..") || p.includes(":")) return null;
  return p;
}

export function lineCount(text: string): number {
  return text.split("\n").length;
}

/** 证据校验器（灵魂组件）：每条结论必须绑定真实文件 + 合法行号 + 真实符号，否则丢弃。 */
export function validate(ev: unknown, texts: Record<string, string>): boolean {
  if (!ev || typeof ev !== "object") return false;
  const e = ev as { path?: unknown; start?: unknown; end?: unknown; symbol?: unknown };
  const rel = safeRel(e.path);
  if (!rel) return false;
  const text = texts[rel];
  if (text === undefined) return false;
  const s = Number(e.start);
  const t = Number(e.end);
  if (!Number.isInteger(s) || !Number.isInteger(t)) return false;
  const n = lineCount(text);
  if (!(1 <= s && s <= t && t <= n)) return false;
  if (e.symbol && !text.includes(String(e.symbol))) return false;
  return true;
}

/** 返回 [通过校验的证据, 总条数]；被丢弃的引用计入验证统计。 */
export function filterValid(evs: unknown, texts: Record<string, string>): [EvidenceRef[], number] {
  const valid: EvidenceRef[] = [];
  let total = 0;
  for (const ev of Array.isArray(evs) ? evs : []) {
    total++;
    if (!validate(ev, texts)) continue;
    const e = ev as { path: string; start: number; end: number; symbol?: unknown };
    const item: EvidenceRef = { path: safeRel(e.path)!, start: Number(e.start), end: Number(e.end) };
    if (e.symbol) item.symbol = String(e.symbol);
    valid.push(item);
  }
  return [valid, total];
}

export function firstLines(texts: Record<string, string>, rel: string, span = 15): EvidenceRef | null {
  const text = texts[rel];
  if (text === undefined) return null;
  const n = lineCount(text);
  if (n === 0) return null;
  return { path: rel, start: 1, end: Math.min(span, n) };
}

/** 优先取首个符号所在行附近的行段，找不到符号退回文件头 15 行。 */
export function symbolLines(texts: Record<string, string>, rel: string, symbols: string[]): EvidenceRef | null {
  const text = texts[rel];
  if (text === undefined) return firstLines(texts, rel);
  const lines = text.split("\n");
  for (const sym of symbols) {
    const idx = lines.findIndex((l) => l.includes(sym));
    if (idx >= 0) {
      return { path: rel, start: idx + 1, end: Math.min(idx + 12, lines.length), symbol: sym };
    }
  }
  return firstLines(texts, rel);
}