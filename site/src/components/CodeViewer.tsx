import { useEffect, useRef } from "react";
import CodePanel from "./CodePanel";
import type { Evidence } from "../lib/seed";

export type CodeTarget = {
  path: string;
  evidence: Evidence | null;
  from: string;
};

type CodeViewerProps = {
  target: CodeTarget | null;
  text: string | undefined;
  onClose: () => void;
};

export default function CodeViewer({ target, text, onClose }: CodeViewerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!target) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      returnFocus.current?.focus?.();
    };
  }, [target, onClose]);

  if (!target) return null;

  return (
    <div className="rt-overlay" role="presentation">
      <button type="button" className="rt-scrim" aria-label="关闭代码面板" onClick={onClose} />
      <div
        className="rt-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`代码面板 ${target.path}`}
      >
        <header className="rt-drawer-head">
          <div className="min-w-0">
            <p className="rt-panel-title">代码面板</p>
            <p className="rt-hint truncate">来自{target.from}</p>
          </div>
          <button type="button" className="rt-tool" onClick={onClose} ref={closeRef}>
            关闭 ✕
          </button>
        </header>

        <div className="rt-drawer-body">
          {text === undefined ? (
            <div className="rt-card rt-code-empty">
              <p className="rt-hint">
                {target.path} 未收录在离线证据集中，无法展示全文。
              </p>
            </div>
          ) : (
            <CodePanel
              key={`${target.path}:${target.evidence?.start ?? 0}`}
              path={target.path}
              evidence={target.evidence}
              text={text}
            />
          )}
        </div>
      </div>
    </div>
  );
}