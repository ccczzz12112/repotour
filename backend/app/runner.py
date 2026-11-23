"""流水线编排器：7 步 + 产物落盘(JSON) + 断点续跑 + 事件流 + 证据统计。"""
import json
import time
import traceback
from pathlib import Path
from . import config, db, events
from .fetch import fetch
from .scan import scan
from .rank import rank
from .steps import map_step, reduce_step, tour_step, tasks_step
from .evidence import validate


def _job_dir(job_id):
    d = config.JOBS_DIR / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _load_art(jdir, name, commit):
    f = jdir / f"{name}.json"
    if f.is_file():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if data.get("commit") == commit:
                return data["data"]
        except (OSError, json.JSONDecodeError, KeyError):
            pass
    return None


def _save_art(jdir, name, commit, data):
    (jdir / f"{name}.json").write_text(
        json.dumps({"commit": commit, "data": data}, ensure_ascii=False), encoding="utf-8")


def run_job(job_id):
    job = db.get_job(job_id)
    if not job:
        return
    jdir = _job_dir(job_id)
    stats = {"llm_calls": 0, "cache_hits": 0, "fallbacks": 0}
    t0 = time.time()

    def emit(type_, **kw):
        events.emit(job_id, type_, **kw)

    try:
        db.update_job(job_id, status="running")
        emit("start", message=f"开始分析 {job['repo_url']}")
        db.update_job(job_id, step="fetch")
        emit("step", step="fetch", status="running", message="拉取仓库")
        finfo = fetch(job["repo_url"])
        commit = finfo["commit"]
        db.update_job(job_id, commit_hash=commit)
        _save_art(jdir, "fetch", commit, finfo)
        emit("step", step="fetch", status="done",
             message=f"仓库就绪（{finfo['file_count']} 个文件）", detail=finfo)
        root = Path(finfo["repo_dir"])

        def step(name, fn, message):
            db.update_job(job_id, step=name)
            cached = _load_art(jdir, name, commit)
            if cached is not None:
                emit("step", step=name, status="done", message=message + "（缓存）")
                return cached
            emit("step", step=name, status="running", message=message)
            data = fn()
            _save_art(jdir, name, commit, data)
            emit("step", step=name, status="done", message=message + " 完成")
            return data

        scan_data = step("scan", lambda: scan(finfo["repo_dir"]), "静态扫描 + 依赖图")
        ranked = step("rank", lambda: rank(scan_data), "关键文件排序")
        cards = step("map", lambda: map_step.run(finfo["repo_dir"], scan_data, ranked, stats, emit),
                     "LLM 模块卡片")
        graph = step("reduce", lambda: reduce_step.run(scan_data, cards, stats, emit),
                     "架构图合成")
        tour = step("tour", lambda: tour_step.run(finfo["repo_dir"], scan_data, ranked, cards, stats, emit),
                    "导览路线生成")
        tasks = step("tasks", lambda: tasks_step.run(finfo["repo_dir"], scan_data, cards, stats, emit),
                     "上手任务生成")

        total = passed = 0
        for c in cards:
            for ev in c["evidence"]:
                total += 1
                passed += 1 if validate(ev, root)[0] else 0
        for s in tour:
            for ev in s["files"]:
                total += 1
                passed += 1 if validate(ev, root)[0] else 0
        stats.update({"evidence_total": total, "evidence_passed": passed,
                      "duration_s": round(time.time() - t0, 1)})
        overview = {"repo_url": job["repo_url"], "commit": commit, "stats": scan_data["stats"],
                    "entries": scan_data["entries"], "tests": scan_data["tests"][:20],
                    "readme_excerpt": scan_data["readme"][:1200], "file_count": finfo["file_count"]}
        result = {"job_id": job_id, "overview": overview, "graph": graph, "tour": tour,
                  "tasks": tasks, "modules": cards, "stats": stats}
        _save_art(jdir, "result", commit, result)
        db.update_job(job_id, status="done", step="done")
        emit("done", message="分析完成", stats=stats)
    except Exception as e:
        db.update_job(job_id, status="failed", error=str(e))
        emit("error", message=str(e), detail=traceback.format_exc()[-1500:])


def get_result(job_id):
    f = config.JOBS_DIR / job_id / "result.json"
    if f.is_file():
        try:
            return json.loads(f.read_text(encoding="utf-8"))["data"]
        except (OSError, json.JSONDecodeError, KeyError):
            return None
    return None
