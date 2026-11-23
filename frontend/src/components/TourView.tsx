import { useEffect, useState } from "react";
import type { TourStop } from "../types";
import CodePanel from "./CodePanel";

type Props = { jobId: string; tour: TourStop[] };

export default function TourView({ jobId, tour }: Props) {
  const [active, setActive] = useState(0);
  const [evIndex, setEvIndex] = useState(0);

  const stop = tour[active];

  useEffect(() => setEvIndex(0), [active]);

  if (!tour.length) return <div className="muted">暂无导览站点。</div>;

  return (
    <div className="tour-grid">
      <div className="stoplist">
        {tour.map((s, i) => (
          <button
            key={s.order ?? i}
            className={`stopitem${i === active ? " on" : ""}`}
            onClick={() => setActive(i)}
          >
            <div className="snum">STOP {String(i + 1).padStart(2, "0")}</div>
            <div className="stitle">{s.title}</div>
          </button>
        ))}
      </div>

      <div className="stopcard">
        <div className="muted" style={{ fontSize: 12 }}>
          {active + 1} / {tour.length}
        </div>
        <h2>{stop.title}</h2>
        <div className="narrative">{stop.narrative}</div>
        {stop.why && (
          <div className="why">
            <b>为什么是这一站</b>
            <div>{stop.why}</div>
          </div>
        )}
        {stop.quiz && (
          <div className="quiz">
            <b>自检</b> · {stop.quiz}
          </div>
        )}
        <div className="evlist">
          {stop.files.map((f, i) => (
            <button
              key={`${f.path}:${f.start}-${f.end}`}
              className="evitem"
              onClick={() => setEvIndex(i)}
              style={i === evIndex ? { borderColor: "rgba(57,211,211,.6)" } : undefined}
            >
              <span className="fpath">{f.path}</span>
              {f.symbol && <span className="rane">{f.symbol}</span>}
              <span className="rane">
                L{f.start}–{f.end}
              </span>
            </button>
          ))}
        </div>
      </div>

      <CodePanel jobId={jobId} evidence={stop.files[evIndex] ?? stop.files[0] ?? null} />
    </div>
  );
}
