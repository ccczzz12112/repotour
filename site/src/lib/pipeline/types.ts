export type SourceLang = "python" | "javascript" | "typescript" | "other";

export type ScanFile = {
  path: string;
  lang: SourceLang;
  ext: string;
  size: number;
  lines: number;
};

export type ScanEdge = { src: string; dst: string; kind: "import" };

export type ScanData = {
  files: ScanFile[];
  texts: Record<string, string>;
  edges: ScanEdge[];
  entries: string[];
  tests: string[];
  readme: string;
  symbols: Record<string, string[]>;
  stats: {
    total_files: number;
    languages: Record<string, number>;
    source_files: number;
    edges: number;
    has_ci: boolean;
  };
};

export type RankedFile = { path: string; score: number; reasons: string[] };

export type EvidenceRef = { path: string; start: number; end: number; symbol?: string };

export type ModuleDraft = {
  path: string;
  role: string;
  responsibility: string;
  key_symbols: string[];
  importance: number;
  evidence: EvidenceRef[];
};

export type GroupNode = {
  id: string;
  layer: string;
  paths: string[];
  summaries: string[];
};

export type GroupEdge = { source: string; target: string; count: number };

export type ChainItem = {
  path: string;
  symbols: string[];
  summary: string;
  symbol_count: number;
  inbound: number;
  on_chain: boolean;
  prev: string;
  ev: EvidenceRef | null;
};

export type PipelineStepKey =
  | "fetch"
  | "scan"
  | "rank"
  | "map"
  | "reduce"
  | "tour"
  | "tasks";

export type StepStatus = "pending" | "running" | "done" | "failed";

export type StepState = { key: PipelineStepKey; status: StepStatus; detail: string };

export type GenerateError = {
  code:
    | "invalid_url"
    | "not_found"
    | "rate_limited"
    | "too_large"
    | "network"
    | "empty_repo";
  message: string;
  hint: string;
};

export const STEP_LABELS: Record<PipelineStepKey, string> = {
  fetch: "取文件",
  scan: "静态扫描",
  rank: "关键文件排序",
  map: "模块讲解",
  reduce: "架构聚合",
  tour: "导览路线",
  tasks: "上手任务",
};

export class PipelineError extends Error {
  code: GenerateError["code"];
  hint: string;
  constructor(code: GenerateError["code"], message: string, hint: string) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}