import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { lineNumbers } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { api } from "../api";
import type { Evidence, FileSnippet } from "../types";

function langFor(path: string): Extension | null {
  if (path.endsWith(".py")) return python();
  if (/\.(tsx?|jsx?|mjs|cjs)$/.test(path)) {
    return javascript({
      typescript: /\.tsx?$/.test(path),
      jsx: /\.(tsx|jsx)$/.test(path),
    });
  }
  return null;
}

type Props = {
  jobId: string;
  evidence: Evidence | null;
  onClose?: () => void;
};

export default function CodePanel({ jobId, evidence, onClose }: Props) {
  const [snippet, setSnippet] = useState<FileSnippet | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!evidence) {
      setSnippet(null);
      setError("");
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    api
      .getFile(jobId, evidence.path, evidence.start, evidence.end)
      .then((s) => alive && setSnippet(s))
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [jobId, evidence?.path, evidence?.start, evidence?.end]);

  // 行号显示真实文件行号：CodeMirror 从 1 开始，加上片段起始偏移
  const extensions = useMemo<Extension[]>(() => {
    if (!snippet) return [];
    const offset = (snippet.start || 1) - 1;
    const list: Extension[] = [
      lineNumbers({ formatNumber: (n) => String(n + offset) }),
    ];
    const lang = langFor(snippet.path);
    if (lang) list.push(lang);
    return list;
  }, [snippet]);

  const code = snippet ? snippet.lines.map((l) => l.text).join("\n") : "";

  return (
    <div className="codepanel">
      <div className="chead">
        <span className="cpath">{evidence?.path ?? "选择一个代码引用"}</span>
        {snippet && (
          <span className="muted">
            L{snippet.start}–{snippet.end} / {snippet.total_lines}
          </span>
        )}
        {snippet && (
          <button
            className="btn-ghost"
            onClick={() => navigator.clipboard?.writeText(code)}
            title="复制代码"
          >
            复制
          </button>
        )}
        {onClose && (
          <button className="btn-ghost" onClick={onClose}>
            关闭
          </button>
        )}
      </div>
      <div className="cbody">
        {!evidence && <div className="emptycode">点击导览里的文件引用，在这里查看真实源码片段。</div>}
        {loading && <div className="emptycode">加载中…</div>}
        {error && <div className="emptycode">读取失败：{error}</div>}
        {snippet && !loading && (
          <CodeMirror
            value={code}
            height="auto"
            maxHeight="58vh"
            theme={oneDark}
            editable={false}
            extensions={extensions}
            basicSetup={{
              foldGutter: false,
              highlightActiveLine: false,
              lineNumbers: false,
            }}
          />
        )}
      </div>
    </div>
  );
}
