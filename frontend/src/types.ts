// 与 docs/API.md 对齐的数据契约（后端 A 部分产出）
export type Evidence = { path: string; start: number; end: number; symbol?: string };

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
  note?: string;
};

export type TourStop = {
  order: number;
  title: string;
  narrative: string;
  why: string;
  files: Evidence[];
  quiz?: string;
};

export type Task = {
  level: number;
  title: string;
  description: string;
  files: string[];
  acceptance: string;
  hints: string[];
};

export type ModuleCard = {
  path: string;
  role: string;
  responsibility: string;
  key_symbols: string[];
  importance: number;
  evidence: Evidence[];
};

export type RunStats = {
  llm_calls?: number;
  cache_hits?: number;
  fallbacks?: number;
  evidence_total: number;
  evidence_passed: number;
  duration_s?: number;
};

export type ScanStats = {
  total_files?: number;
  source_files?: number;
  edges?: number;
  has_ci?: boolean;
  languages?: Record<string, number>;
};

export type Result = {
  job_id: string;
  overview: {
    repo_url: string;
    commit?: string;
    file_count?: number;
    stats?: ScanStats;
    entries?: string[];
    tests?: string[];
    readme_excerpt?: string;
  };
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  tour: TourStop[];
  tasks: Task[];
  modules: ModuleCard[];
  stats: RunStats;
};

export type Job = {
  id: string;
  repo_url: string;
  status: "pending" | "running" | "done" | "failed";
  step?: string;
  error?: string;
  created_at?: number;
};

export type FileSnippet = {
  path: string;
  start: number;
  end: number;
  total_lines: number;
  lines: { n: number; text: string }[];
};

export type StepEvent = {
  type: "start" | "step" | "log" | "done" | "error";
  step?: string;
  status?: "running" | "done";
  message?: string;
  stats?: Record<string, unknown>;
  ts?: number;
};

export const STEP_ORDER = ["fetch", "scan", "rank", "map", "reduce", "tour", "tasks"] as const;
export type StepName = (typeof STEP_ORDER)[number];

export const STEP_LABEL: Record<string, string> = {
  fetch: "拉取仓库",
  scan: "静态扫描",
  rank: "文件排序",
  map: "模块卡片",
  reduce: "架构归并",
  tour: "生成导览",
  tasks: "上手任务",
};

export const LAYER_LABEL: Record<string, string> = {
  entry: "入口",
  api: "接口",
  core: "核心",
  data: "数据",
  util: "工具",
  test: "测试",
  other: "其他",
};

