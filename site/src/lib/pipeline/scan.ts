import type { ScanData, ScanEdge, ScanFile, SourceLang } from "./types";
import type { TreeEntry } from "./github";
import { extOf } from "./github";

export const LANG_BY_EXT: Record<string, SourceLang> = {
  ".py": "python",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
};

export const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".pdf", ".zip", ".gz", ".whl",
  ".so", ".dll", ".exe", ".bin", ".woff", ".woff2", ".ttf", ".mp4", ".mp3",
  ".pyc", ".class", ".jar", ".wasm",
]);

export const SKIP_NAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
  "Cargo.lock", "composer.lock",
]);

export const SKIP_DIRS = new Set([
  ".git", "node_modules", "vendor", "dist", "build", "__pycache__", ".venv", "venv",
  ".next", ".nuxt", "target", ".idea", ".vscode", "coverage", ".tox", ".mypy_cache",
  ".pytest_cache", "bower_components", ".gradle", "out", "obj",
]);

const PY_ENTRY_NAMES = new Set(["main.py", "app.py", "manage.py", "cli.py", "__main__.py", "run.py", "server.py"]);

const JS_PATTERNS = [
  /(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]/g,
  /import\s*['"]([^'"]+)['"]/g,
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\(\s*['"]([^'"]+)['"]\s*\)/g,
];
const JS_SYMBOL = /(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/g;
const JS_CONST = /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;

const PY_IMPORT = /^[ \t]*import[ \t]+([\w., \t]+)/gm;
const PY_FROM_PAREN = /^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+\(([\s\S]*?)\)/gm;
const PY_FROM_LINE = /^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+([^\n(]+)/gm;
const PY_SYMBOL = /^(?:async[ \t]+)?(?:def|class)[ \t]+([A-Za-z_]\w*)/gm;

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

function normPath(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function joinPath(base: string, rel: string): string {
  return normPath(base ? `${base}/${rel}` : rel);
}

function isTest(rel: string): boolean {
  const parts = rel.split("/");
  const name = parts[parts.length - 1];
  return (
    parts.slice(0, -1).some((p) => p === "tests" || p === "test" || p === "__tests__") ||
    name.startsWith("test_") || name.endsWith("_test.py") ||
    name.includes(".test.") || name.includes(".spec.")
  );
}

function importNames(raw: string): string[] {
  const noComment = raw.split("#")[0];
  return noComment
    .split(",")
    .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
    .filter((s) => /^[\w.]+$/.test(s));
}

function pyEdges(pyFiles: string[], texts: Record<string, string>, symbols: Record<string, string[]>): ScanEdge[] {
  const pySet = new Set(pyFiles);
  const roots = new Set<string>([""]);
  if (pyFiles.some((p) => p.startsWith("src/"))) roots.add("src");
  for (const f of pyFiles) {
    if (!f.endsWith("__init__.py")) continue;
    const parts = f.split("/").slice(0, -1);
    let i = parts.length - 1;
    while (i >= 0 && pySet.has(`${parts.slice(0, i + 1).join("/")}/__init__.py`)) i--;
    roots.add(parts.slice(0, i + 1).join("/"));
  }
  const modmap = new Map<string, string>();
  for (const f of pyFiles) {
    for (const r of roots) {
      const pre = r ? `${r}/` : "";
      if (!f.startsWith(pre)) continue;
      const rel = f.slice(pre.length);
      let name: string;
      if (rel === "__init__.py") continue;
      if (rel.endsWith("/__init__.py")) name = rel.slice(0, -12).replace(/\//g, ".");
      else if (rel.endsWith(".py")) name = rel.slice(0, -3).replace(/\//g, ".");
      else continue;
      if (name && !modmap.has(name)) modmap.set(name, f);
    }
  }
  function resolve(name: string): string | null {
    const parts = name.split(".");
    for (let i = parts.length; i > 0; i--) {
      const cand = parts.slice(0, i).join(".");
      const hit = modmap.get(cand);
      if (hit) return hit;
    }
    return null;
  }

  const edges: ScanEdge[] = [];
  const push = (src: string, dst: string | null) => {
    if (dst) edges.push({ src, dst, kind: "import" });
  };
  for (const f of pyFiles) {
    const text = texts[f] ?? "";
    symbols[f] = [...text.matchAll(PY_SYMBOL)].map((m) => m[1]);
    if (!text) continue;
    const pkgParts = f.split("/").slice(0, -1);

    for (const m of text.matchAll(PY_IMPORT)) {
      for (const name of importNames(m[1])) push(f, resolve(name));
    }
    const froms: { dots: string; mod: string; namesRaw: string }[] = [];
    for (const m of text.matchAll(PY_FROM_PAREN)) froms.push({ dots: m[1], mod: m[2], namesRaw: m[3] });
    for (const m of text.matchAll(PY_FROM_LINE)) froms.push({ dots: m[1], mod: m[2], namesRaw: m[3] });
    for (const { dots, mod, namesRaw } of froms) {
      const names = importNames(namesRaw);
      const level = dots.length;
      if (level > 0) {
        const up = level - 1;
        if (up > pkgParts.length) continue;
        const baseDir = up ? pkgParts.slice(0, pkgParts.length - up).join("/") : pkgParts.join("/");
        const cands: string[] = [];
        if (mod) {
          const d = joinPath(baseDir, mod.replace(/\./g, "/"));
          cands.push(`${d}.py`, `${d}/__init__.py`);
          for (const a of names) cands.push(`${d}/${a}.py`, `${d}/${a}/__init__.py`);
        } else {
          for (const a of names) {
            const d = joinPath(baseDir, a);
            cands.push(`${d}.py`, `${d}/__init__.py`);
          }
        }
        for (const c of cands) if (pySet.has(c)) push(f, c);
      } else {
        if (mod) push(f, resolve(mod));
        if (mod) for (const a of names) push(f, resolve(`${mod}.${a}`));
      }
    }
  }
  return edges;
}

function jsEdges(
  jsFiles: string[],
  texts: Record<string, string>,
  fileSet: Set<string>,
  symbols: Record<string, string[]>,
): ScanEdge[] {
  const edges: ScanEdge[] = [];
  for (const f of jsFiles) {
    const text = texts[f] ?? "";
    const syms = [...text.matchAll(JS_SYMBOL), ...text.matchAll(JS_CONST)].map((m) => m[1]);
    symbols[f] = [...new Set(syms)].slice(0, 30);
    if (!text) continue;
    const specs: string[] = [];
    for (const pat of JS_PATTERNS) specs.push(...[...text.matchAll(pat)].map((m) => m[1]));
    for (const spec of specs) {
      if (!spec.startsWith(".")) continue;
      const base = joinPath(dirname(f), spec);
      const cands = [
        base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.cjs`,
        `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`, `${base}/index.jsx`,
      ];
      for (const cand of cands) {
        if (fileSet.has(cand) && cand !== f) {
          edges.push({ src: f, dst: cand, kind: "import" });
          break;
        }
      }
    }
  }
  return edges;
}

function detectEntries(texts: Record<string, string>, pyFiles: string[], fileSet: Set<string>): string[] {
  const entries: string[] = [];
  for (const f of pyFiles) {
    const name = f.split("/").pop() ?? "";
    const text = texts[f] ?? "";
    if (PY_ENTRY_NAMES.has(name) || (text.includes("__name__") && text.includes("__main__"))) entries.push(f);
  }
  const pkgText = texts["package.json"];
  if (pkgText) {
    let meta: { main?: unknown; bin?: unknown } = {};
    try {
      meta = JSON.parse(pkgText);
    } catch {
      /* 忽略坏 JSON */
    }
    const cands: string[] = [];
    if (typeof meta.main === "string") cands.push(meta.main);
    if (typeof meta.bin === "string") cands.push(meta.bin);
    else if (meta.bin && typeof meta.bin === "object") cands.push(...Object.values(meta.bin as Record<string, unknown>).map(String));
    for (const c of cands) {
      const rel = normPath(c.replace(/^\.?\//, ""));
      for (const cand of [rel, `${rel}.js`, `${rel}.ts`, `${rel}/index.js`]) {
        if (fileSet.has(cand)) {
          entries.push(cand);
          break;
        }
      }
    }
    for (const cand of ["index.js", "index.ts", "src/index.js", "src/index.ts", "src/main.js", "src/main.ts"]) {
      if (fileSet.has(cand)) entries.push(cand);
    }
  }
  const pp = texts["pyproject.toml"];
  if (pp) {
    const sec = /\[project\.scripts\][ \t]*\n([\s\S]*?)(?:\n\[|$)/.exec(pp);
    if (sec) {
      for (const m of sec[1].matchAll(/^[ \t]*[\w-]+[ \t]*=[ \t]*["']([^"']+)["']/gm)) {
        const mod = m[1].split(":")[0].replace(/\./g, "/");
        for (const f of pyFiles) {
          if (f.endsWith(`${mod}.py`) || f.endsWith(`${mod}/__init__.py`)) {
            entries.push(f);
            break;
          }
        }
      }
    }
  }
  const uniq = [...new Set(entries)];
  uniq.sort((a, b) => a.split("/").length - b.split("/").length || a.length - b.length);
  return uniq.slice(0, 8);
}

/** 步骤2 Scan：确定性静态分析（零模型）。依赖边只来自真实 import 解析。 */
export function scan(treeFiles: TreeEntry[], texts: Record<string, string>, hasCi: boolean): ScanData {
  const files: ScanFile[] = treeFiles
    .map((t) => {
      const ext = extOf(t.path);
      const lang: SourceLang = LANG_BY_EXT[ext] ?? "other";
      const text = texts[t.path];
      return { path: t.path, lang, ext, size: t.size, lines: text ? text.split("\n").length : 0 };
    })
    .sort((a, b) => (a.path < b.path ? -1 : 1));

  const fileSet = new Set(files.map((f) => f.path));
  const pyFiles = files.filter((f) => f.lang === "python").map((f) => f.path);
  const jsFiles = files.filter((f) => f.lang === "javascript" || f.lang === "typescript").map((f) => f.path);
  const symbols: Record<string, string[]> = {};
  const raw = [...pyEdges(pyFiles, texts, symbols), ...jsEdges(jsFiles, texts, fileSet, symbols)];
  const seen = new Set<string>();
  const edges: ScanEdge[] = [];
  for (const e of raw) {
    const k = `${e.src}\n${e.dst}`;
    if (e.src !== e.dst && !seen.has(k)) {
      seen.add(k);
      edges.push(e);
    }
  }

  const entries = detectEntries(texts, pyFiles, fileSet);
  const tests = files.filter((f) => isTest(f.path)).map((f) => f.path);
  let readme = "";
  for (const f of files) {
    if (f.path.toLowerCase().startsWith("readme")) {
      readme = (texts[f.path] ?? "").slice(0, 4000);
      break;
    }
  }
  const languages: Record<string, number> = {};
  for (const f of files) {
    if (f.lang !== "other") languages[f.lang] = (languages[f.lang] ?? 0) + 1;
  }
  return {
    files,
    texts,
    edges,
    entries,
    tests,
    readme,
    symbols,
    stats: {
      total_files: files.length,
      languages,
      source_files: pyFiles.length + jsFiles.length,
      edges: edges.length,
      has_ci: hasCi,
    },
  };
}