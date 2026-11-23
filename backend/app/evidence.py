"""证据校验器（灵魂组件）：LLM 的每条结论必须绑定真实文件+合法行号，否则丢弃。"""
from pathlib import Path


def safe_rel(path: str) -> str | None:
    """路径安全：拒绝绝对路径 / .. 穿越 / 盘符"""
    p = str(path or "").replace("\\", "/").strip().lstrip("/")
    if not p or ".." in p.split("/") or ":" in p:
        return None
    return p


def line_count(repo_dir: Path, rel: str) -> int:
    try:
        return len((repo_dir / rel).read_text(encoding="utf-8", errors="replace").splitlines())
    except OSError:
        return 0


def validate(ev: dict, repo_dir: Path) -> tuple[bool, str]:
    rel = safe_rel(ev.get("path", ""))
    if not rel:
        return False, "非法路径"
    f = repo_dir / rel
    if not f.is_file():
        return False, "文件不存在"
    n = line_count(repo_dir, rel)
    try:
        s, e = int(ev.get("start", 0)), int(ev.get("end", 0))
    except (TypeError, ValueError):
        return False, "行号不是整数"
    if not (1 <= s <= e <= n):
        return False, f"行段 {s}-{e} 超出 1..{n}"
    sym = ev.get("symbol")
    if sym:
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return False, "无法读取"
        if str(sym) not in text:
            return False, "符号未找到"
    return True, ""


def filter_valid(evs, repo_dir):
    """返回 (通过校验的证据列表, 总条数)"""
    valid, total = [], 0
    for ev in evs or []:
        total += 1
        if not isinstance(ev, dict):
            continue
        ok, _ = validate(ev, repo_dir)
        if ok:
            item = {"path": safe_rel(ev["path"]), "start": int(ev["start"]), "end": int(ev["end"])}
            if ev.get("symbol"):
                item["symbol"] = str(ev["symbol"])
            valid.append(item)
    return valid, total


def first_lines(repo_dir, rel, span=15):
    n = line_count(repo_dir, rel)
    if n == 0:
        return None
    return {"path": rel, "start": 1, "end": min(span, n)}
