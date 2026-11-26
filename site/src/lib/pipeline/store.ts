import type { SeedData } from "../seed";
import type { RepoRef } from "./github";

export type RecentEntry = {
  slug: string;
  repo: string;
  url: string;
  savedAt: number;
  modelUsed: boolean;
  data: SeedData;
};

const KEY = "repotour.online.v1";
const MAX_ENTRIES = 6;

export function onlineSlug(ref: RepoRef): string {
  return `gh-${ref.owner}-${ref.repo}`.toLowerCase();
}

export function isOnlineSlug(slug: string): boolean {
  return slug.startsWith("gh-");
}

function readAll(): Record<string, RecentEntry> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, RecentEntry>): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** 只保留结果引用到的文件全文，避免 localStorage 超限。 */
function referencedTexts(data: SeedData): Record<string, string> {
  const paths = new Set<string>();
  for (const m of data.result.modules) paths.add(m.path);
  for (const s of data.result.tour) for (const f of s.files) paths.add(f.path);
  for (const t of data.result.tasks) for (const f of t.files) paths.add(f);
  for (const p of data.result.overview.entries) paths.add(p);
  for (const p of data.result.overview.tests) paths.add(p);
  const out: Record<string, string> = {};
  for (const p of paths) if (data.files[p] !== undefined) out[p] = data.files[p];
  return out;
}

export function saveRecent(ref: RepoRef, data: SeedData, modelUsed: boolean): RecentEntry {
  const entry: RecentEntry = {
    slug: onlineSlug(ref),
    repo: `${ref.owner}/${ref.repo}`,
    url: ref.url,
    savedAt: Date.now(),
    modelUsed,
    data,
  };
  const all = readAll();
  all[entry.slug] = entry;
  const sorted = Object.values(all).sort((a, b) => b.savedAt - a.savedAt);
  const keep: Record<string, RecentEntry> = {};
  for (const e of sorted.slice(0, MAX_ENTRIES)) keep[e.slug] = e;
  if (!writeAll(keep)) {
    entry.data = { ...data, files: referencedTexts(data) };
    keep[entry.slug] = entry;
    if (!writeAll(keep)) {
      // 仍超限：只保留这一条
      writeAll({ [entry.slug]: entry });
    }
  }
  return entry;
}

export function listRecent(): RecentEntry[] {
  return Object.values(readAll()).sort((a, b) => b.savedAt - a.savedAt);
}

export function loadRecent(slug: string): RecentEntry | null {
  return readAll()[slug] ?? null;
}

export function deleteRecent(slug: string) {
  const all = readAll();
  delete all[slug];
  writeAll(all);
}