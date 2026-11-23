"""步骤2 Scan：确定性静态分析（零 LLM）。文件树/语言/入口/测试/import 依赖图/符号表。
依赖图的每条边都来自真实 import 解析 —— 这就是"静态分析搭骨架"。"""
import ast
import json
import posixpath
import re
import tomllib
from pathlib import Path
from . import config

LANG_BY_EXT = {".py": "python", ".js": "javascript", ".jsx": "javascript", ".mjs": "javascript",
               ".cjs": "javascript", ".ts": "typescript", ".tsx": "typescript"}
BINARY_EXT = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".pdf", ".zip", ".gz", ".whl",
              ".so", ".dll", ".exe", ".bin", ".woff", ".woff2", ".ttf", ".mp4", ".mp3",
              ".pyc", ".class", ".jar", ".wasm"}
SKIP_NAMES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
              "Cargo.lock", "composer.lock"}
MAX_READ = 200_000

JS_PATTERNS = [
    re.compile(r"""(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]"""),
    re.compile(r"""import\s*['"]([^'"]+)['"]"""),
    re.compile(r"""require\(\s*['"]([^'"]+)['"]\s*\)"""),
    re.compile(r"""import\(\s*['"]([^'"]+)['"]\s*\)"""),
]
JS_SYMBOL = re.compile(r"(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)")
JS_CONST = re.compile(r"export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)")
PY_ENTRY_NAMES = {"main.py", "app.py", "manage.py", "cli.py", "__main__.py", "run.py", "server.py"}


def _read(fp: Path) -> str:
    try:
        if fp.stat().st_size > MAX_READ:
            return ""
        return fp.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _is_test(rel: str) -> bool:
    parts = rel.split("/")
    name = parts[-1]
    return (any(p in ("tests", "test", "__tests__") for p in parts[:-1])
            or name.startswith("test_") or name.endswith("_test.py")
            or ".test." in name or ".spec." in name)


def scan(repo_dir: str) -> dict:
    root = Path(repo_dir)
    files, texts = [], {}
    for fp in sorted(root.rglob("*")):
        if not fp.is_file():
            continue
        rel = fp.relative_to(root).as_posix()
        parts = rel.split("/")
        if any(p in config.SKIP_DIRS for p in parts[:-1]):
            continue
        name = parts[-1]
        if name in SKIP_NAMES or ".min." in name:
            continue
        ext = posixpath.splitext(name)[1].lower()
        if ext in BINARY_EXT:
            continue
        lang = LANG_BY_EXT.get(ext, "other")
        want_text = (lang != "other" or name.lower().startswith("readme")
                     or ext in (".json", ".toml", ".md"))
        text = _read(fp) if want_text else ""
        files.append({"path": rel, "lang": lang, "ext": ext, "size": fp.stat().st_size,
                      "lines": text.count("\n") + 1 if text else 0})
        if text:
            texts[rel] = text

    file_set = {f["path"] for f in files}
    py_files = [f["path"] for f in files if f["lang"] == "python"]
    js_files = [f["path"] for f in files if f["lang"] in ("javascript", "typescript")]
    symbols: dict[str, list[str]] = {}
    edges = _py_edges(py_files, texts, symbols) + _js_edges(js_files, texts, file_set, symbols)
    seen, uniq = set(), []
    for e in edges:
        k = (e["src"], e["dst"])
        if e["src"] != e["dst"] and k not in seen:
            seen.add(k)
            uniq.append(e)

    entries = _entries(root, texts, py_files, file_set)
    tests = [f["path"] for f in files if _is_test(f["path"])]
    readme = ""
    for f in files:
        if f["path"].lower().startswith("readme"):
            readme = texts.get(f["path"], "")[:4000]
            break
    langs: dict[str, int] = {}
    for f in files:
        if f["lang"] != "other":
            langs[f["lang"]] = langs.get(f["lang"], 0) + 1
    return {"files": files, "edges": uniq, "entries": entries, "tests": tests,
            "readme": readme, "symbols": symbols,
            "stats": {"total_files": len(files), "languages": langs,
                      "source_files": len(py_files) + len(js_files), "edges": len(uniq),
                      "has_ci": (root / ".github" / "workflows").is_dir()}}


def _py_edges(py_files, texts, symbols):
    """Python import 解析：ast + 模块名映射（支持 src 布局 / 包内相对导入）"""
    py_set = set(py_files)
    roots = {""}
    if any(p.startswith("src/") for p in py_files):
        roots.add("src")
    for f in py_files:
        if f.endswith("__init__.py"):
            parts = f.split("/")[:-1]
            i = len(parts) - 1
            while i >= 0 and "/".join(parts[:i + 1]) + "/__init__.py" in py_set:
                i -= 1
            roots.add("/".join(parts[:i + 1]))
    modmap = {}
    for f in py_files:
        for r in roots:
            pre = r + "/" if r else ""
            if not f.startswith(pre):
                continue
            rel = f[len(pre):]
            if rel == "__init__.py":
                continue
            if rel.endswith("/__init__.py"):
                name = rel[:-12].replace("/", ".")
            elif rel.endswith(".py"):
                name = rel[:-3].replace("/", ".")
            else:
                continue
            if name:
                modmap.setdefault(name, f)

    def resolve(name):
        parts = name.split(".")
        for i in range(len(parts), 0, -1):
            cand = ".".join(parts[:i])
            if cand in modmap:
                return modmap[cand]
        return None

    edges = []
    for f in py_files:
        text = texts.get(f, "")
        if not text:
            continue
        try:
            tree = ast.parse(text)
        except SyntaxError:
            symbols[f] = []
            continue
        symbols[f] = [n.name for n in tree.body
                      if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]
        pkg_parts = f.split("/")[:-1]
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    dst = resolve(a.name)
                    if dst:
                        edges.append({"src": f, "dst": dst, "kind": "import"})
            elif isinstance(node, ast.ImportFrom):
                if node.level and node.level > 0:
                    up = node.level - 1
                    if up > len(pkg_parts):
                        continue
                    base = pkg_parts[:len(pkg_parts) - up] if up else pkg_parts
                    base_dir = "/".join(base)
                    mod = (node.module or "").replace(".", "/")
                    cands = []
                    if mod:
                        d = posixpath.normpath(posixpath.join(base_dir, mod)) if base_dir else mod
                        cands += [d + ".py", d + "/__init__.py"]
                        for a in node.names:
                            cands += [d + "/" + a.name + ".py", d + "/" + a.name + "/__init__.py"]
                    else:
                        for a in node.names:
                            d = posixpath.normpath(posixpath.join(base_dir, a.name)) if base_dir else a.name
                            cands += [d + ".py", d + "/__init__.py"]
                    for c in cands:
                        if c in py_set:
                            edges.append({"src": f, "dst": c, "kind": "import"})
                else:
                    names = [node.module or ""]
                    names += [f"{node.module}.{a.name}" for a in node.names if node.module]
                    for name in names:
                        if not name:
                            continue
                        dst = resolve(name)
                        if dst:
                            edges.append({"src": f, "dst": dst, "kind": "import"})
    return edges


def _js_edges(js_files, texts, file_set, symbols):
    """JS/TS import 解析：相对路径 + 扩展名探测（.ts/.tsx/.js/.jsx/index.*）"""
    edges = []
    for f in js_files:
        text = texts.get(f, "")
        if not text:
            continue
        syms = JS_SYMBOL.findall(text) + JS_CONST.findall(text)
        symbols[f] = list(dict.fromkeys(syms))[:30]
        specs = []
        for pat in JS_PATTERNS:
            specs += pat.findall(text)
        for spec in specs:
            if not spec.startswith("."):
                continue
            base = posixpath.normpath(posixpath.join(posixpath.dirname(f), spec))
            for cand in (base, base + ".ts", base + ".tsx", base + ".js", base + ".jsx",
                         base + ".mjs", base + ".cjs",
                         base + "/index.ts", base + "/index.tsx", base + "/index.js", base + "/index.jsx"):
                if cand in file_set and cand != f:
                    edges.append({"src": f, "dst": cand, "kind": "import"})
                    break
    return edges


def _entries(root, texts, py_files, file_set):
    entries = []
    for f in py_files:
        name = f.split("/")[-1]
        text = texts.get(f, "")
        if name in PY_ENTRY_NAMES or ("__name__" in text and "__main__" in text):
            entries.append(f)
    pkg = root / "package.json"
    if pkg.is_file():
        try:
            meta = json.loads(pkg.read_text(encoding="utf-8", errors="replace"))
        except (OSError, json.JSONDecodeError):
            meta = {}
        cands = []
        if isinstance(meta.get("main"), str):
            cands.append(meta["main"])
        b = meta.get("bin")
        if isinstance(b, str):
            cands.append(b)
        elif isinstance(b, dict):
            cands += [str(v) for v in b.values()]
        for c in cands:
            rel = posixpath.normpath(c.lstrip("./"))
            for cand in (rel, rel + ".js", rel + ".ts", rel + "/index.js"):
                if cand in file_set:
                    entries.append(cand)
                    break
        for cand in ("index.js", "index.ts", "src/index.js", "src/index.ts",
                     "src/main.js", "src/main.ts"):
            if cand in file_set:
                entries.append(cand)
    pp = root / "pyproject.toml"
    if pp.is_file():
        try:
            meta = tomllib.loads(pp.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            meta = {}
        for val in (meta.get("project", {}).get("scripts", {}) or {}).values():
            mod = str(val).split(":")[0].replace(".", "/")
            for f in py_files:
                if f.endswith(mod + ".py") or f.endswith(mod + "/__init__.py"):
                    entries.append(f)
                    break
    entries = list(dict.fromkeys(entries))
    entries.sort(key=lambda p: (p.count("/"), len(p)))
    return entries[:8]
