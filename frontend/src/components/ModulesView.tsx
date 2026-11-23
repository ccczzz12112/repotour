import { useState } from "react";
import type { Evidence, ModuleCard } from "../types";
import CodePanel from "./CodePanel";

type Props = { jobId: string; modules: ModuleCard[] };

export default function ModulesView({ jobId, modules }: Props) {
  const [ev, setEv] = useState<Evidence | null>(null);

  if (!modules.length) return <div className="muted">暂无模块卡片。</div>;

  return (
    <>
      <div className="modgrid">
        {modules.map((m) => (
          <div key={m.path} className="modcard">
            <div>
              <span className="mpath">{m.path}</span>
              <span className="mrole">{m.role}</span>
            </div>
            <div className="mresp">{m.responsibility}</div>
            {m.key_symbols?.length > 0 && (
              <div className="msyms">
                {m.key_symbols.map((s) => (
                  <span key={s} className="sym">
                    {s}
                  </span>
                ))}
              </div>
            )}
            <div className="impbar">
              <i style={{ width: `${Math.min(100, Math.max(4, (m.importance ?? 0) * 100))}%` }} />
            </div>
            <div className="evlist">
              {m.evidence?.map((e, i) => (
                <button
                  key={`${e.path}:${e.start}-${e.end}:${i}`}
                  className="evitem"
                  onClick={() => setEv(e)}
                >
                  <span className="fpath">{e.path}</span>
                  <span className="rane">
                    L{e.start}–{e.end}
                  </span>
                </button>
              ))}
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
