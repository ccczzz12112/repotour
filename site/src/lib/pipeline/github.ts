import { PipelineError } from "./types";
import { BINARY_EXT, LANG_BY_EXT, SKIP_DIRS, SKIP_NAMES } from "./scan";

export type RepoRef = { owner: string; repo: string; url: string };

export type TreeEntry = { path: string; size: number };

const MAX_FILES = 2000;
const MAX_SOURCE_FILES = 500;
export const MAX_READ = 200_000;
const CONCURRENCY = 7;

export function parseRepoUrl(input: string): RepoRef {
  const raw = input.trim();
  const bare = /^([\w.-]+)\/([\w.-]+)$/;
  const m = bare.exec(raw);
  if (m) {
    return { owner: m[1], repo: m[2].replace(/\.git$/, ""), url: `https://github.com/${m[1]}/${m[2].replace(/\.git$/, "")}` };
  }
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new PipelineError("invalid_url", "这不是一个合法的 GitHub 仓库链接", "形如 https://github.com/owner/repo，或直接输入 owner/repo");
  }
  if (u.hostname !== "github.com" && u.hostname !== "www.github.com") {
    throw new PipelineError("invalid_url", "目前只支持 github.com 的公开仓库", "把链接换成 https://github.com/owner/repo 的形式");
  }
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new PipelineError("invalid_url", "链接里缺少 owner/repo 两段", "形如 https://github.com/pallets/click");
  }
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

function apiHeaders(pat: string | null): HeadersInit {
  const h: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (pat) h.Authorization = `Bearer ${pat}`;
  return h;
}

async function ghApi(path: string, pat: string | null): Promise<unknown> {
  let resp: Response;
  try {
    resp = await fetch(`https://api.github.com${path}`, { headers: apiHeaders(pat) });
  } catch {
    throw new PipelineError("network", "连不上 GitHub API", "检查网络后重试；国内网络偶尔需要代理");
  }
  if (resp.status === 404) {
    throw new PipelineError("not_found", "仓库不存在，或者是私有仓库", "确认链接拼写；私有仓库无法匿名读取，请换公开仓库");
  }
  if (resp.status === 403 || resp.status === 429) {
    const remaining = resp.headers.get("x-ratelimit-remaining");
    if (remaining === "0" || resp.status === 429) {
      throw new PipelineError("rate_limited", "触发了 GitHub 匿名访问限流（60 次/小时）", "稍后再试，或在下方设置里粘贴你自己的 GitHub Token 提高限额（只存在本机）");
    }
    throw new PipelineError("not_found", "GitHub 拒绝了访问（403）", "可能是私有仓库或访问受限，请换公开仓库");
  }
  if (!resp.ok) {
    throw new PipelineError("network", `GitHub API 返回 ${resp.status}`, "稍后重试");
  }
  return resp.json();
}

export type RepoTree = {
  ref: RepoRef;
  branch: string;
  files: TreeEntry[];
  hasCi: boolean;
  totalBlobs: number;
};

export async function fetchRepoTree(ref: RepoRef, pat: string | null): Promise<RepoTree> {
  const meta = (await ghApi(`/repos/${ref.owner}/${ref.repo}`, pat)) as { default_branch?: string };
  const branch = meta.default_branch || "main";
  const tree = (await ghApi(
    `/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    pat,
  )) as { tree?: { path: string; type: string; size?: number }[]; truncated?: boolean };
  if (tree.truncated) {
    throw new PipelineError("too_large", "仓库文件树太大，GitHub 拒绝完整返回", "换一个更小的仓库（建议 2000 文件以内）");
  }
  const blobs = (tree.tree ?? []).filter((t) => t.type === "blob");
  if (blobs.length > MAX_FILES) {
    throw new PipelineError("too_large", `仓库共 ${blobs.length} 个文件，超过 ${MAX_FILES} 的上限`, "换一个更小的仓库");
  }
  const files: TreeEntry[] = [];
  let hasCi = false;
  for (const b of blobs) {
    if (b.path.startsWith(".github/workflows/")) hasCi = true;
    const parts = b.path.split("/");
    if (parts.slice(0, -1).some((p) => SKIP_DIRS.has(p))) continue;
    const name = parts[parts.length - 1];
    if (SKIP_NAMES.has(name) || name.includes(".min.")) continue;
    const ext = extOf(name);
    if (BINARY_EXT.has(ext)) continue;
    files.push({ path: b.path, size: b.size ?? 0 });
  }
  const sourceCount = files.filter((f) => LANG_BY_EXT[extOf(f.path)] !== undefined).length;
  if (sourceCount === 0) {
    throw new PipelineError("empty_repo", "仓库里没有 Python / JavaScript / TypeScript 源码", "目前支持这三种语言的仓库");
  }
  if (sourceCount > MAX_SOURCE_FILES) {
    throw new PipelineError("too_large", `源码文件 ${sourceCount} 个，超过 ${MAX_SOURCE_FILES} 的上限`, "换一个更小的仓库");
  }
  return { ref, branch, files, hasCi, totalBlobs: blobs.length };
}

export function extOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot).toLowerCase();
}

async function fetchRaw(ref: RepoRef, branch: string, path: string): Promise<string | null> {
  const urls = [
    `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${branch}/${path}`,
    `https://cdn.jsdelivr.net/gh/${ref.owner}/${ref.repo}@${branch}/${path}`,
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return await resp.text();
    } catch {
      /* 试备用源 */
    }
  }
  return null;
}

/** 并发拉取文件全文（raw CDN，不占 API 限额）。返回 路径->全文。 */
export async function fetchTexts(
  ref: RepoRef,
  branch: string,
  paths: string[],
  sizeOf: Map<string, number>,
  onDone: (done: number, total: number) => void,
): Promise<Record<string, string>> {
  const texts: Record<string, string> = {};
  let done = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < paths.length) {
      const p = paths[cursor++];
      if ((sizeOf.get(p) ?? 0) <= MAX_READ) {
        const text = await fetchRaw(ref, branch, p);
        if (text !== null && text.length <= MAX_READ) texts[p] = text;
      }
      done++;
      onDone(done, paths.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker));
  return texts;
}

export function loadPat(): string | null {
  try {
    return localStorage.getItem("repotour.ghpat") || null;
  } catch {
    return null;
  }
}

export function savePat(pat: string | null) {
  try {
    if (pat) localStorage.setItem("repotour.ghpat", pat);
    else localStorage.removeItem("repotour.ghpat");
  } catch {
    /* 隐私模式忽略 */
  }
}