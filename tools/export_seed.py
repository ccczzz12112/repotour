"""导出一份自包含的导览种子数据（供 Qoder Sites 站点版预烘焙使用）。

用法:
    python tools/export_seed.py <job_id> [<job_id> ...]

产出 handoff/seed/<owner>-<repo>.json:
    { "meta": {...}, "result": {...}, "files": {"path": "文件全文"} }

files 只收录导览/模块/架构图真正引用到的文件，站点可完全离线渲染代码证据。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JOBS = ROOT / "backend" / "data" / "jobs"
OUT = ROOT / "handoff" / "seed"
MAX_FILE_BYTES = 200_000


def collect_paths(result: dict) -> list[str]:
    seen: list[str] = []
    add = seen.append

    def push(p):
        if isinstance(p, str) and p and p not in seen:
            add(p)

    for stop in result.get("tour", []):
        for f in stop.get("files", []):
            push(f.get("path"))
    for m in result.get("modules", []):
        push(m.get("path"))
        for e in m.get("evidence", []):
            push(e.get("path"))
    for n in result.get("graph", {}).get("nodes", []):
        for p in n.get("paths", []):
            push(p)
    for t in result.get("tasks", []):
        for p in t.get("files", []):
            push(p)
    for p in result.get("overview", {}).get("entries", []):
        push(p)
    return seen


def export(job_id: str) -> Path:
    job_dir = JOBS / job_id
    raw = json.loads((job_dir / "result.json").read_text(encoding="utf-8"))
    result = raw.get("data", raw)
    fetch = json.loads((job_dir / "fetch.json").read_text(encoding="utf-8"))
    repo_dir = Path(fetch["data"]["repo_dir"])
    repo_url = result["overview"]["repo_url"]
    slug = repo_url.rstrip("/").split("/")[-2] + "-" + repo_url.rstrip("/").split("/")[-1]
    slug = slug.replace(".git", "").lower()

    files: dict[str, str] = {}
    missing: list[str] = []
    for rel in collect_paths(result):
        fp = repo_dir / rel
        if not fp.is_file():
            missing.append(rel)
            continue
        if fp.stat().st_size > MAX_FILE_BYTES:
            continue
        try:
            files[rel] = fp.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            missing.append(rel)

    bundle = {
        "meta": {
            "repo_url": repo_url,
            "commit": fetch.get("commit"),
            "generated_by": "RepoTour pipeline (LLM_MODE=mock)",
            "note": "文案为规则生成的占位内容，站点版需由 Qoder 侧模型重写；结构与证据行号真实有效。",
            "file_count": len(files),
            "missing": missing,
        },
        "result": result,
        "files": files,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f"{slug}.json"
    dest.write_text(json.dumps(bundle, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{slug}: {len(files)} files, {dest.stat().st_size // 1024} KB -> {dest}")
    return dest


if __name__ == "__main__":
    ids = sys.argv[1:]
    if not ids:
        print(__doc__)
        raise SystemExit(2)
    for jid in ids:
        export(jid)
