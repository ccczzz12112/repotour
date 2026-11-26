import { isSeedKey, loadSeed, SEEDS, type SeedData } from "./seed";
import { isOnlineSlug, loadRecent } from "./pipeline/store";

export function isKnownSlug(slug: string): boolean {
  return isSeedKey(slug) || isOnlineSlug(slug);
}

export function repoLabel(slug: string): string {
  if (isSeedKey(slug)) return SEEDS[slug].repo;
  return loadRecent(slug)?.repo ?? slug.replace(/^gh-/, "");
}

export function loadRepo(slug: string): Promise<SeedData> {
  if (isSeedKey(slug)) return loadSeed(slug);
  const entry = loadRecent(slug);
  if (!entry) {
    return Promise.reject(new Error("这份在线生成结果不在本机浏览器里（可能已清理），请回首页重新生成。"));
  }
  return Promise.resolve(entry.data);
}