import { useState } from "react";
import type { Evidence, Task } from "../types";
import CodePanel from "./CodePanel";

type Props = { jobId: string; tasks: Task[] };

export default function TasksView({ jobId, tasks }: Props) {
  const [ev, setEv] = useState<Evidence | null>(null);

  if (!tasks.length) return <div className="muted">暂无上手任务。</div>;

  return (
    <>
      <div className="tasklist">
        {tasks.map((t, i) => (
          <div key={`${t.level}-${t.title}-${i}`} className="taskcard">
            <div className="thead">
              <span className={`lv l${t.level}`}>L{t.level}</span>
              <h4>{t.title}</h4>
            </div>
            <div className="tdesc">{t.description}</div>
            <div className="taskmeta">
              <div className="row">
                <b>涉及文件</b>
                <span className="taskfiles">
                  {t.files?.map((f) => (
                    <button
                      key={f}
                      className="filelink"
                      onClick={() => setEv({ path: f, start: 1, end: 80 })}
                    >
                      {f}
                    </button>
                  ))}
                </span>
              </div>
              <div className="row">
                <b>验收标准</b>
                <span>{t.acceptance}</span>
              </div>
              {t.hints?.length > 0 && (
                <div className="row">
                  <b>提示</b>
                  <span>
                    {t.hints.map((h, j) => (
                      <div key={j}>· {h}</div>
                    ))}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {ev && (
        <>
          <div className="drawer-mask" onClick={() => setEv(null)} />
          <div className="drawer">
            <div className="dbody">
              <CodePanel jobId={jobId} evidence={ev} onClose={() => setEv(null)} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
