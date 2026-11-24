export type Evidence = {
  path: string;
  start: number;
  end: number;
  symbol?: string;
};

export type TourStop = {
  order: number;
  title: string;
  narrative: string;
  why: string;
  files: Evidence[];
  quiz: string;
};

export type GraphNode = {
  id: string;
  label: string;
  layer: string;
  type: string;
  paths: string[];
  note: string;
};

export type GraphEdge = {
  source: string;
  target: string;
  kind: string;
  verified: boolean;
  note: string;
};

export type ModuleCard = {
  path: string;
  role: string;
  responsibility: string;
  key_symbols: string[];
  importance: number;
  evidence: Evidence[];
};

export type OnboardTask = {
  level: number;
  title: string;
  description: string;
  files: string[];
  acceptance: string;
  hints: string[];
};

export type SeedResult = {
  job_id: string;
  overview: {
    repo_url: string;
    commit: string;
    stats: {
      total_files: number;
      languages: Record<string, number>;
      source_files: number;
      edges: number;
      has_ci: boolean;
    };
    entries: string[];
    tests: string[];
    readme_excerpt: string;
  };
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  tour: TourStop[];
  modules: ModuleCard[];
  tasks: OnboardTask[];
  stats: {
    evidence_total: number;
    evidence_passed: number;
    duration_s: number;
  };
};

export type SeedData = {
  meta: { repo_url: string; commit: string; file_count: number; note: string };
  result: SeedResult;
  files: Record<string, string>;
};

export type SeedKey = "pallets-click" | "psf-requests" | "axios-axios";

export const SEEDS: Record<SeedKey, { repo: string; file: string; note: string }> = {
  "pallets-click": {
    repo: "pallets/click",
    file: "seed/pallets-click.json",
    note: "Python 命令行工具库 · 10 站",
  },
  "psf-requests": {
    repo: "psf/requests",
    file: "seed/psf-requests.json",
    note: "Python HTTP 客户端库 · 10 站",
  },
  "axios-axios": {
    repo: "axios/axios",
    file: "seed/axios-axios.json",
    note: "浏览器与 Node 请求库 · 10 站",
  },
};

export function isSeedKey(value: string): value is SeedKey {
  return Object.prototype.hasOwnProperty.call(SEEDS, value);
}

const cache = new Map<SeedKey, Promise<SeedData>>();

export function loadSeed(key: SeedKey): Promise<SeedData> {
  const hit = cache.get(key);
  if (hit) return hit;

  const pending = fetch(`${import.meta.env.BASE_URL}${SEEDS[key].file}`)
    .then((response) => {
      if (!response.ok) throw new Error(`种子数据加载失败：${response.status}`);
      return response.json() as Promise<SeedData>;
    })
    .catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, pending);
  return pending;
}

export function stopsOf(seed: SeedData): TourStop[] {
  return [...seed.result.tour].sort((a, b) => a.order - b.order);
}

export function modulesOf(seed: SeedData): ModuleCard[] {
  return [...seed.result.modules].sort(
    (a, b) => b.importance - a.importance || a.path.localeCompare(b.path),
  );
}

export function tasksOf(seed: SeedData): OnboardTask[] {
  return [...seed.result.tasks].sort((a, b) => a.level - b.level);
}

export function lineCount(seed: SeedData, path: string): number {
  const text = seed.files[path];
  return text === undefined ? 0 : text.split("\n").length;
}
