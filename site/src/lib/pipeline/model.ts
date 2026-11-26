export type ModelAction = "map-reduce" | "tour-tasks";

export class ModelUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnavailable";
  }
}

const MODEL_TIMEOUT_MS = 150_000;

/** 模型能力只走同源站点后端（Qoder Cloud Agents），前端零 Key。 */
export async function callModel(action: ModelAction, payload: unknown): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(`${import.meta.env.BASE_URL}functions/v1/app/generate?action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    throw new ModelUnavailable("模型服务连不上");
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) throw new ModelUnavailable(`模型服务返回 ${resp.status}`);
  let body: { ok?: boolean; data?: unknown };
  try {
    body = await resp.json();
  } catch {
    throw new ModelUnavailable("模型服务响应异常");
  }
  if (!body.ok || !body.data || typeof body.data !== "object") throw new ModelUnavailable("模型服务未返回结果");
  return body.data as Record<string, unknown>;
}