export type Tone = { label: string; color: string };

const FALLBACK: Tone = { label: "其他", color: "#9c94bd" };

export const ROLE_META: Record<string, Tone> = {
  entry: { label: "入口", color: "#22d3ee" },
  core: { label: "核心", color: "#a855f7" },
  util: { label: "工具", color: "#818cf8" },
  model: { label: "模型", color: "#2dd4bf" },
  api: { label: "接口", color: "#fbbf24" },
  config: { label: "配置", color: "#60a5fa" },
  test: { label: "测试", color: "#4ade80" },
  doc: { label: "文档", color: "#c4b5fd" },
  data: { label: "数据", color: "#f472b6" },
};

export const LAYER_META: Record<string, Tone> = {
  entry: { label: "入口层", color: "#22d3ee" },
  core: { label: "核心层", color: "#a855f7" },
  data: { label: "数据层", color: "#f472b6" },
  util: { label: "工具层", color: "#818cf8" },
  api: { label: "接口层", color: "#fbbf24" },
  model: { label: "模型层", color: "#2dd4bf" },
  config: { label: "配置层", color: "#60a5fa" },
  test: { label: "测试层", color: "#4ade80" },
  doc: { label: "文档层", color: "#c4b5fd" },
};

/** 层序兜底：真实边方向决定分层顺序，这里只在边数打平时起作用。 */
export const LAYER_PRIORITY = [
  "entry",
  "core",
  "data",
  "util",
  "api",
  "model",
  "config",
  "test",
  "doc",
];

export const LEVEL_META: Record<number, Tone & { name: string }> = {
  1: { label: "第 1 档", name: "热身", color: "#4ade80" },
  2: { label: "第 2 档", name: "进阶", color: "#fbbf24" },
  3: { label: "第 3 档", name: "挑战", color: "#f472b6" },
};

export function roleMeta(role: string): Tone {
  return ROLE_META[role] ?? { label: role || FALLBACK.label, color: FALLBACK.color };
}

export function layerMeta(layer: string): Tone {
  return LAYER_META[layer] ?? { label: layer || "未分层", color: FALLBACK.color };
}

export function levelMeta(level: number): Tone & { name: string } {
  return LEVEL_META[level] ?? { label: `第 ${level} 档`, name: "任务", color: FALLBACK.color };
}