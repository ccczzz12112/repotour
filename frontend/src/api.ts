import type { FileSnippet, Job, Result, StepEvent } from "./types";

// 开发环境走 vite 代理（见 vite.config.ts），生产环境可注入 VITE_API_BASE
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // 非 JSON 错误体，保留 statusText
    }
    throw new Error(`${res.status} ${detail}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => req<{ ok: boolean; llm_mode: string }>("/api/health"),

  listJobs: () => req<Job[]>("/api/jobs"),

  createJob: (repoUrl: string) =>
    req<{ job_id: string; reused: boolean }>("/api/jobs", {
      method: "POST",
      body: JSON.stringify({ repo_url: repoUrl }),
    }),

  getJob: (id: string) => req<Job>(`/api/jobs/${id}`),

  getResult: (id: string) => req<Result>(`/api/jobs/${id}/result`),

  getFile: (id: string, path: string, start: number, end: number) =>
    req<FileSnippet>(
      `/api/jobs/${id}/file?path=${encodeURIComponent(path)}&start=${start}&end=${end}`,
    ),

  previewUrl: (id: string) => `${BASE}/api/jobs/${id}/preview`,
};

/**
 * SSE 进度订阅。断线重连后后端会从头回放事件，调用方需保证按 step 幂等更新。
 * 返回取消函数（组件卸载时必须调用）。
 */
export function subscribeJob(
  jobId: string,
  onEvent: (evt: StepEvent) => void,
): () => void {
  const es = new EventSource(`${BASE}/api/jobs/${jobId}/events`);
  es.onmessage = (e) => {
    try {
      const evt = JSON.parse(e.data) as StepEvent;
      onEvent(evt);
      if (evt.type === "done" || evt.type === "error") es.close();
    } catch {
      // 忽略单条坏事件
    }
  };
  es.onerror = () => {
    // 浏览器会自动重连；任务结束后后端关闭连接属正常
  };
  return () => es.close();
}
