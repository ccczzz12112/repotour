import { useEffect, useMemo, useRef, useState } from "react";
import { LANG_LABEL, langOf, tokenizeFile, type Token } from "../lib/highlight";
import type { Evidence } from "../lib/seed";

const CONTEXT_BEFORE = 40;
const CONTEXT_AFTER = 60;
const HEAD_LINES = 80;
const MORE_CAP = 400;

type CodePanelProps = {
  path: string;
  evidence: Evidence | null;
  text: string;
};

function Line({ n, tokens, on }: { n: number; tokens: Token[]; on: boolean }) {
  return (
    <div className={on ? "rt-line rt-line-on" : "rt-line"} data-line={n}>
      <span className="rt-ln">{n}</span>
      <code className="rt-lc">
        {tokens.length === 0 ? " " : tokens.map((t, i) => <span key={i} className={`tk-${t.cls}`}>{t.text}</span>)}
      </code>
    </div>
  );
}

export default function CodePanel({ path, evidence, text }: CodePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const bodyRef = useRef<HTMLDivElement>(null);

  const lang = langOf(path);
  const total = useMemo(() => text.split("\n").length, [text]);
  const tokens = useMemo(() => tokenizeFile(text, lang), [text, lang]);

  const from = evidence ? (expanded ? Math.max(1, evidence.start - CONTEXT_BEFORE) : evidence.start) : 1;
  const to = evidence
    ? Math.min(total, expanded ? evidence.end + CONTEXT_AFTER : Math.max(evidence.end, evidence.start + 1))
    : Math.min(total, expanded ? MORE_CAP : HEAD_LINES);

  // 换文件或换引用就回到默认窗口，并把起始行滚到面板上方。
  const anchor = evidence ? evidence.start : 1;
  useEffect(() => {
    setExpanded(false);
    setCopied("idle");
    const box = bodyRef.current;
    const target = box?.querySelector<HTMLElement>(`[data-line="${anchor}"]`);
    if (box && target) box.scrollTop = target.offsetTop - 8;
  }, [path, anchor]);

  const visible = useMemo(() => {
    const rows = [];
    for (let n = from; n <= to; n += 1) rows.push({ n, tokens: tokens[n - 1] ?? [] });
    return rows;
  }, [tokens, from, to]);

  const visibleText = useMemo(() => text.split("\n").slice(from - 1, to).join("\n"), [text, from, to]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(visibleText);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    window.setTimeout(() => setCopied("idle"), 1600);
  }

  const capped = !evidence && expanded && total > MORE_CAP;

  return (
    <section className="rt-code" aria-label={`代码证据 ${path}`}>
      <header className="rt-code-head">
        <div className="min-w-0">
          <p className="rt-code-path" title={path}>{path}</p>
          <p className="rt-hint">
            {LANG_LABEL[lang]} · 共 {total} 行 · 显示 {from}–{to} 行
            {evidence?.symbol ? ` · ${evidence.symbol}` : ""}
            {evidence ? "" : " · 未绑定行号"}
            {capped ? ` · 仅列前 ${MORE_CAP} 行` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-[calc(0.375rem*var(--site-space,1))]">
          <button type="button" className="rt-tool" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            {evidence ? (expanded ? "折叠" : "展开上下文") : expanded ? "收起" : "显示更多行"}
          </button>
          <button type="button" className="rt-tool" onClick={copy}>
            {copied === "ok" ? "已复制" : copied === "fail" ? "复制失败" : "复制可见行"}
          </button>
        </div>
      </header>

      <div className="rt-code-body rt-scroll" ref={bodyRef} tabIndex={0}>
        {visible.map((row) => (
          <Line
            key={row.n}
            n={row.n}
            tokens={row.tokens}
            on={evidence !== null && row.n >= evidence.start && row.n <= evidence.end}
          />
        ))}
      </div>
    </section>
  );
}