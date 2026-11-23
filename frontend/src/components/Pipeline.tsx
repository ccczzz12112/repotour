import { STEP_LABEL, STEP_ORDER, type StepName } from "../types";

export type StepState = "waiting" | "running" | "done";

type Props = {
  steps: Record<string, StepState>;
  logs: string[];
};

export default function Pipeline({ steps, logs }: Props) {
  return (
    <div>
      <div className="pipeline">
        {STEP_ORDER.map((step: StepName, i) => {
          const st = steps[step] ?? "waiting";
          return (
            <div key={step} className={`pstep ${st}`}>
              <div className="num">
                <span className="dot" />
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="name">{STEP_LABEL[step] ?? step}</div>
            </div>
          );
        })}
      </div>
      {logs.length > 0 && (
        <div className="logs">{logs.slice(-8).join("\n")}</div>
      )}
    </div>
  );
}
