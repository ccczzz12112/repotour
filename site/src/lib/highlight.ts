export type Lang = "python" | "javascript" | "typescript" | "other";

export type TokenCls = "plain" | "com" | "str" | "num" | "kw" | "bi" | "fn" | "cls";

export type Token = { text: string; cls: TokenCls };

type StringRule = { delim: string; multi: boolean };

type Spec = {
  line: string[];
  block?: { open: string; close: string };
  strings: StringRule[];
};

const PYTHON: Spec = {
  line: ["#"],
  strings: [
    { delim: '"""', multi: true },
    { delim: "'''", multi: true },
    { delim: '"', multi: false },
    { delim: "'", multi: false },
  ],
};

const ESM: Spec = {
  line: ["//"],
  block: { open: "/*", close: "*/" },
  strings: [
    { delim: "`", multi: true },
    { delim: '"', multi: false },
    { delim: "'", multi: false },
  ],
};

const PLAIN: Spec = { line: [], strings: [] };

const KEYWORDS: Record<Lang, Set<string>> = {
  python: new Set(
    "and as assert async await break class continue def del elif else except finally for from if import in is lambda None not or pass raise return try while with yield match case".split(
      " ",
    ),
  ),
  javascript: new Set(
    "async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while yield".split(
      " ",
    ),
  ),
  typescript: new Set(
    "abstract as declare enum implements interface keyof namespace private protected public readonly type satisfies get set async await break case catch class const constructor continue default delete do else export extends finally for from function if import in instanceof let new of return set static super switch this throw try typeof var void while yield".split(
      " ",
    ),
  ),
  other: new Set(),
};

const BUILTINS: Record<Lang, Set<string>> = {
  python: new Set(
    "abs all any bool bytes dict dir enumerate Exception filter float format getattr hasattr hash int isinstance issubclass iter len list map max min next object open print property range repr reversed round set setattr slice sorted str sum tuple type zip self cls".split(
      " ",
    ),
  ),
  javascript: new Set(
    "Array Boolean console Date Error JSON Map Math Number Object Promise RegExp Set Symbol window document module process require globalThis undefined NaN Infinity setTimeout setInterval".split(
      " ",
    ),
  ),
  typescript: new Set(),
  other: new Set(),
};

BUILTINS.typescript = BUILTINS.javascript;

const SPECS: Record<Lang, Spec> = {
  python: PYTHON,
  javascript: ESM,
  typescript: ESM,
  other: PLAIN,
};

export function langOf(path: string): Lang {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "py") return "python";
  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "javascript";
  return "other";
}

export const LANG_LABEL: Record<Lang, string> = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  other: "纯文本",
};

const ID_START = /[A-Za-z_$]/;
const ID_BODY = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;

type ScanState = { block: boolean; quote: string | null };

/** 逐行扫描，跨行的块注释与三引号字符串通过 state 传递，保证窗口渲染时颜色连续。 */
function scanLine(src: string, lang: Lang, state: ScanState): Token[] {
  const spec = SPECS[lang];
  const keywords = KEYWORDS[lang];
  const builtins = BUILTINS[lang];
  const out: Token[] = [];
  const push = (text: string, cls: TokenCls) => {
    if (text) out.push({ text, cls });
  };

  let i = 0;

  if (state.block && spec.block) {
    const end = src.indexOf(spec.block.close);
    if (end < 0) {
      push(src, "com");
      return out;
    }
    push(src.slice(0, end + spec.block.close.length), "com");
    i = end + spec.block.close.length;
    state.block = false;
  } else if (state.quote) {
    const close = findStringEnd(src, 0, state.quote);
    if (close === null) {
      push(src, "str");
      return out;
    }
    push(src.slice(0, close), "str");
    i = close;
    state.quote = null;
  }

  let plain = "";

  while (i < src.length) {
    const comment = spec.line.find((mark) => src.startsWith(mark, i));
    if (comment) {
      push(plain, "plain");
      push(src.slice(i), "com");
      return out;
    }

    if (spec.block && src.startsWith(spec.block.open, i)) {
      const end = src.indexOf(spec.block.close, i + spec.block.open.length);
      if (end < 0) {
        push(plain, "plain");
        push(src.slice(i), "com");
        state.block = true;
        return out;
      }
      push(plain, "plain");
      push(src.slice(i, end + spec.block.close.length), "com");
      plain = "";
      i = end + spec.block.close.length;
      continue;
    }

    const quote = spec.strings.find((rule) => src.startsWith(rule.delim, i));
    if (quote) {
      const end = findStringEnd(src, i + quote.delim.length, quote.delim);
      push(plain, "plain");
      if (end === null) {
        push(src.slice(i), "str");
        if (quote.multi) state.quote = quote.delim;
        return out;
      }
      push(src.slice(i, end), "str");
      plain = "";
      i = end;
      continue;
    }

    if (DIGIT.test(src[i])) {
      push(plain, "plain");
      plain = "";
      let j = i;
      while (j < src.length && /[0-9a-fA-FxXoObB._]/.test(src[j])) j += 1;
      push(src.slice(i, j), "num");
      i = j;
      continue;
    }

    if (ID_START.test(src[i])) {
      push(plain, "plain");
      plain = "";
      let j = i;
      while (j < src.length && ID_BODY.test(src[j])) j += 1;
      const word = src.slice(i, j);
      let cls: TokenCls = "plain";
      if (keywords.has(word)) cls = "kw";
      else if (builtins.has(word)) cls = "bi";
      else if (src[j] === "(") cls = "fn";
      else if (/^[A-Z]/.test(word)) cls = "cls";
      push(word, cls);
      i = j;
      continue;
    }

    plain += src[i];
    i += 1;
  }

  push(plain, "plain");
  return out;
}

function findStringEnd(src: string, from: number, delim: string): number | null {
  let i = from;
  while (i < src.length) {
    if (src[i] === "\\") {
      i += 2;
      continue;
    }
    if (src.startsWith(delim, i)) return i + delim.length;
    if (delim.length === 1 && src[i] === "\n") return null;
    i += 1;
  }
  return null;
}

export function tokenizeFile(text: string, lang: Lang): Token[][] {
  const lines = text.split("\n");
  const state: ScanState = { block: false, quote: null };
  const result: Token[][] = [];
  for (const line of lines) result.push(scanLine(line, lang, state));
  return result;
}
