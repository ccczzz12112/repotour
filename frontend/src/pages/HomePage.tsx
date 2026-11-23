import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, subscribeJob } from "../api";
import Pipeline, { type StepState } from "../components/Pipeline";
import type { Job, StepEvent } from "../types";

const EXAMPLES = [
  { label: "pallets/click · Python CLI", url: "https://github.com/pallets/click" },
  { label: "psf/requests · HTTP 客户端", url: "https://github.com/psf/requests" },
  { label: "pallets/flask · Web 框架", url: "https://github.com/pallets/flask" },
];

function shortRepo(url: string) {
  return url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
}

function fmtTime(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function HomePage() {
  const nav = useNavigate();
  const [url, setUrl] = useState("https://github.com/pallets/click");
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState("");
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [reused, setReused] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [health, setHealth] = useState("");

  const stopRef = useRef<null | (() => void)>(null);

  const loadJobs = () => api.listJobs().then(setJobs).catch(() => undefined);

  useEffect(() => {
    loadJobs();
    api.health().then((h) => setHealth(h.llm_mode)).catch(() => setHealth("offline"));
    return () => stopRef.current?.();
  }, []);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const target = url.trim();
    if (!target || busy) return;

    stopRef.current?.();
    setBusy(true);
    setError("");
    setSteps({});
    setLogs([]);
    setReused(false);

    try {
      const { job_id, reused } = await api.createJob(target);
      setJobId(job_id);
      setReused(reused);

      if (reused) {
        loadJobs();
        nav(`/job/${job_id}`);
        return;
      }

      stopRef.current = subscribeJob(job_id, (evt: StepEvent) => {
        if (evt.type === "start") setLogs((l) => [...l, evt.message ?? "开始"]);
        if (evt.type === "step" && evt.step) {
          setSteps((s) => ({ ...s, [evt.step!]: evt.status === "done" ? "done" : "running" }));
        }
        if (evt.type === "log" && evt.message) setLogs((l) => [...l, evt.message!]);
        if (evt.type === "done") {
          setBusy(false);
          loadJobs();
          nav(`/job/${job_id}`);
        }
        if (evt.type === "error") {
          setBusy(false);
          setError(evt.message ?? "分析失败");
          loadJobs();
        }
      });
    } catch (err) {
      setBusy(false);
      setError((err as Error).message);
    }
  }

  const doneCount = Object.values(steps).filter((s) => s === "done").length;

  return (
    <main>
      <section className="hero">
        <h1>
          把陌生仓库，变成
          <br />
          <span className="grad">一条能走通的新人路线</span>
        </h1>
        <p className="lead">
          输入 GitHub 仓库地址，RepoTour 会生成架构图、模块卡片、6–10 站真实调用链导览和分级上手任务。
          每一条结论都能点回源码，每一条依赖边都经过静态 import 校验。
        </p>
        <div className="sellpoints">
          <span className="sellpoint">
            <b>路线</b> · 不只是文档，而是按顺序走
          </span>
          <span className="sellpoint">
            <b>可溯源</b> · 证据绑定 path:line，程序校验
          </span>
          <span className="sellpoint">
            <b>不编造</b> · 架构边只来自静态依赖图
          </span>
        </div>

        <form className="searchbar" onSubmit={submit}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            spellCheck={false}
            disabled={busy}
          />
          <button className="btn-primary" type="submit" disabled={busy || !url.trim()}>
            {busy ? `分析中 ${doneCount}/7` : "生成导览"}
          </button>
        </form>

        <div className="examples">
          <span>试试：</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.url}
              type="button"
              className="example-chip"
              onClick={() => setUrl(ex.url)}
              disabled={busy}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </section>

      {(busy || jobId) && (
        <section className="panel" style={{ marginTop: 8 }}>
          <h3>
            {busy ? "流水线运行中" : reused ? "命中缓存，直接复用结果" : "任务已创建"}
            {jobId && <span className="mono" style={{ marginLeft: 10 }}>job {jobId}</span>}
          </h3>
          <Pipeline steps={steps} logs={logs} />
          {reused && <div className="muted" style={{ marginTop: 10 }}>该仓库已分析过，正在打开结果页…</div>}
        </section>
      )}

      {error && (
        <div className="errbox" style={{ marginTop: 14 }}>
          <b>分析失败：</b>
          {error}
        </div>
      )}

      <section style={{ marginTop: 34 }}>
        <div className="sec-h">
          <h2>最近的导览</h2>
          <span className="hint">
            当前 LLM 模式：{health || "…"}（mock 模式为规则生成，答辩前建议切 live）
          </span>
        </div>
        {jobs.length === 0 ? (
          <div className="muted" style={{ fontSize: 13.5 }}>还没有任务，先跑一个试试。</div>
        ) : (
          <div className="joblist">
            {jobs.slice(0, 8).map((j) => (
              <a key={j.id} className="jobrow" href={`/job/${j.id}`}>
                <span className={`status ${j.status}`}>{j.status}</span>
                <span className="repo">{shortRepo(j.repo_url)}</span>
                <span className="mono">{j.id}</span>
                <span className="time">{fmtTime(j.created_at)}</span>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

