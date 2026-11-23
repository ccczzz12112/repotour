"""步骤4 Map：LLM 逐文件生成模块卡片（并发 + 缓存 + 证据校验 + 降级）。"""
import ast
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from .. import config, llm
from ..evidence import filter_valid, first_lines

ROLE_HINTS = (("test", "test"), ("model", "data"), ("storage", "data"), ("db", "data"),
              ("dao", "data"), ("util", "util"), ("helper", "util"), ("common", "util"),
              ("cli", "entry"), ("main", "entry"), ("app", "entry"),
              ("api", "api"), ("route", "api"), ("view", "api"))


def _guess_role(path):
    low = path.lower()
    for key, role in ROLE_HINTS:
        if key in low:
            return role
    return "core"


def _docstring(text, path):
    if path.endswith(".py"):
        try:
            return ast.get_docstring(ast.parse(text)) or ""
        except SyntaxError:
            return ""
    m = re.search(r"/\*\*(.*?)\*/", text, re.S)
    return m.group(1).strip() if m else ""


def _fallback(payload):
    path, symbols = payload["path"], payload["symbols"]
    doc = (payload.get("doc") or "").strip()
    resp = doc.splitlines()[0][:60] if doc else f"{Path(path).stem} 模块，含 {len(symbols)} 个顶层符号"
    ev = payload.get("first_symbol_ev") or payload.get("head_ev")
    return {"role": _guess_role(path), "responsibility": resp,
            "key_symbols": symbols[:6], "evidence": [ev] if ev else []}


def run(repo_dir, scan_data, ranked, stats, emit):
    root = Path(repo_dir)
    symbols = scan_data["symbols"]
    inbound = {}
    for e in scan_data["edges"]:
        inbound.setdefault(e["dst"], []).append(e["src"])
    items = []
    for r in ranked:
        p = r["path"]
        try:
            text = (root / p).read_text(encoding="utf-8", errors="replace")
        except OSError:
            text = ""
        lines = text.splitlines()
        numbered = "\n".join(f"{i + 1}: {l}" for i, l in enumerate(lines[:350]))
        syms = symbols.get(p, [])
        first_ev = None
        for i, l in enumerate(lines):
            ls = l.lstrip()
            if ls.startswith(("def ", "class ", "async def ", "function ", "export ")):
                first_ev = {"path": p, "start": i + 1, "end": min(i + 15, len(lines))}
                if syms:
                    first_ev["symbol"] = syms[0]
                break
        payload = {"path": p, "symbols": syms, "doc": _docstring(text, p),
                   "head_ev": first_lines(root, p), "first_symbol_ev": first_ev,
                   "inbound": inbound.get(p, [])[:8]}
        prompt = (f"分析仓库文件 {p}（role 候选: entry/core/data/util/api/test/config）。\n"
                  f"顶层符号: {syms[:20]}\n被谁导入: {payload['inbound']}\n"
                  f"文件内容（带行号，可能截断）:\n{numbered}\n\n"
                  '输出 JSON: {"role":"...","responsibility":"<=60字","key_symbols":["..."],'
                  '"evidence":[{"path":"' + p + '","start":行号,"end":行号}]}\n'
                  "evidence 至少 1 条，行号必须来自上面的内容。")
        items.append((r, payload, prompt))

    def work(item):
        r, payload, prompt = item
        data = llm.call_json("map", prompt, payload, _fallback, stats=stats)
        if not isinstance(data, dict):
            data = _fallback(payload)
        evs, _ = filter_valid(data.get("evidence", []), root)
        if not evs:
            ev = payload.get("first_symbol_ev") or payload.get("head_ev")
            if ev:
                evs = [ev]
        return {"path": r["path"], "role": str(data.get("role") or _guess_role(r["path"])),
                "responsibility": str(data.get("responsibility") or "")[:120],
                "key_symbols": [str(s) for s in data.get("key_symbols", [])][:8],
                "importance": r["score"], "evidence": evs}

    cards = []
    with ThreadPoolExecutor(max_workers=config.MAP_WORKERS) as pool:
        for i, card in enumerate(pool.map(work, items)):
            cards.append(card)
            if (i + 1) % 10 == 0:
                emit("log", step="map", message=f"模块卡片 {i + 1}/{len(items)}")
    return cards
