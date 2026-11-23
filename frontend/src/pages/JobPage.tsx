import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, subscribeJob } from "../api";
import GraphView from "../components/GraphView";
import ModulesView from "../components/ModulesView";
import TasksView from "../components/TasksView";
import TourView from "../components/TourView";
import type { Result } from "../types";

type Tab = "tour" | "graph" | "modules" | "tasks";

function shortRepo(url: string) {
  return url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
}

export default function JobPage() {
  const { jobId = "" } = useParams();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [tab, setTab] = useState<Tab>("tour");

  useEffect(() => {
    let alive = true;
    let stop: (() => void) | undefined;

    setResult(null);
    setError("");
    setWaiting(false);

    api
      .getResult(jobId)
      .then((r) => alive && setResult(r))
      .catch((err: Error) => {
        if (!alive) return;
        if (!err.message.startsWith("409")) {
          setError(err.message);
          return;
        }
        // 任务还没跑完：订阅 SSE，done 后再取结果
        setWaiting(true);
        stop = subscribeJob(jobId, (evt) => {
          if (evt.type === "done") {
            api
              .getResult(jobId)
              .then((r) => alive && setResult(r))
              .catch((e: Error) => alive && setError(e.message))
              .finally(() => alive && setWaiting(false));
          }
          if (evt.type === "error") {
            setWaiting(false);
            setError(evt.message ?? "任务失败");
          }
        });
        api
          .getJob(jobId)
          .then((j) => {
            if (j.status === "done") api.getResult(jobId).then((r) => alive && setResult(r));
            if (j.status === "failed") setError(j.error ?? "任务失败");
          })
          .catch(() => undefined);
      });

    return () => {
      alive = false;
      stop?.();
    };
  }, [jobId]);

  if (error) {
    return (
      <div style={{ padding: "40px 0" }}>
        <div className="errbox">加载失败：{error}</div>
        <p>
          <Link to="/" className="ghost-link">
            ← 返回首页
          </Link>
        </p>
      </div>
    );
  }

  if (!result) {
    return <div className="loading">{waiting ? "任务仍在运行，完成后会自动刷新…" : "正在读取结果…"}</div>;
  }

  const ov = result.overview ?? ({} as Result["overview"]);
  const scan = ov.stats ?? {};
  const st = result.stats;
  const passRate = st.evidence_total ? Math.round((st.evidence_passed / st.evidence_total) * 100) : 0;

  return (
    <main>
      <section className="jobhead">
        <div className="meta">
          <Link to="/" className="ghost-link" style={{ paddingLeft: 0 }}>
            ← 新建导览
          </Link>
        </div>
        <h1>{shortRepo(ov.repo_url) || "导览结果"}</h1>
        <div className="meta">
          {ov.commit && <span className="mono">commit {ov.commit.slice(0, 10)}</span>}
          <span className="mono">job {result.job_id}</span>
          <a className="ghost-link" href={api.previewUrl(result.job_id)} target="_blank" rel="noreferrer">
            打开分享页 ↗
          </a>
        </div>

        <div className="chips">
          <div className="chip">
            <div className="k">文件</div>
            <div className="v">{ov.file_count ?? scan.total_files ?? "—"}</div>
          </div>
          <div className="chip">
            <div className="k">源码文件</div>
            <div className="v">{scan.source_files ?? "—"}</div>
          </div>
          <div className="chip">
            <div className="k">依赖边</div>
            <div className="v">{scan.edges ?? "—"}</div>
          </div>
          <div className="chip">
            <div className="k">导览站点</div>
            <div className="v">{result.tour.length}</div>
          </div>
          <div className={`chip${passRate === 100 ? " ok" : ""}`}>
            <div className="k">引用验证通过率</div>
            <div className="v">
              {st.evidence_passed}/{st.evidence_total}
            </div>
          </div>
        </div>
      </section>

      <nav className="tabs">
        <button className={tab === "tour" ? "on" : ""} onClick={() => setTab("tour")}>
          导览路线
        </button>
        <button className={tab === "graph" ? "on" : ""} onClick={() => setTab("graph")}>
          架构图
        </button>
        <button className={tab === "modules" ? "on" : ""} onClick={() => setTab("modules")}>
          模块卡片
        </button>
        <button className={tab === "tasks" ? "on" : ""} onClick={() => setTab("tasks")}>
          上手任务
        </button>
      </nav>

      {tab === "tour" && <TourView jobId={result.job_id} tour={result.tour} />}
      {tab === "graph" && (
        <section>
          <div className="sec-h">
            <h2>架构分层</h2>
            <span className="hint">依赖边来自静态 import 分析，点击节点看说明</span>
          </div>
          <GraphView graph={result.graph} />
        </section>
      )}
      {tab === "modules" && <ModulesView jobId={result.job_id} modules={result.modules} />}
      {tab === "tasks" && <TasksView jobId={result.job_id} tasks={result.tasks} />}
    </main>
  );
}
