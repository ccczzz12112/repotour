"""RepoTour API —— A 部分流水线对外接口（前端队友按 docs/API.md 对接）。
启动: 在 backend 目录执行  python -m uvicorn app.main:app --reload --port 8000"""
import asyncio
import json
import threading
import uuid
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from pydantic import BaseModel
from . import config, db, events, preview, runner
from .evidence import safe_rel

app = FastAPI(title="RepoTour API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup():
    db.init_db()


class JobIn(BaseModel):
    repo_url: str


@app.get("/api/health")
def health():
    return {"ok": True, "llm_mode": config.LLM_MODE}


@app.post("/api/jobs")
def create_job(body: JobIn):
    url = body.repo_url.strip()
    if not url:
        raise HTTPException(400, "repo_url 不能为空")
    old = db.latest_done_job(url)
    if old and runner.get_result(old["id"]):
        return {"job_id": old["id"], "reused": True}
    job_id = uuid.uuid4().hex[:12]
    db.create_job(job_id, url)
    events.init_job(job_id)
    threading.Thread(target=runner.run_job, args=(job_id,), daemon=True).start()
    return {"job_id": job_id, "reused": False}


@app.get("/api/jobs")
def list_jobs():
    return db.list_jobs()


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "job 不存在")
    return job


@app.get("/api/jobs/{job_id}/events")
async def job_events(job_id: str):
    """SSE 进度流：从头回放历史事件，再实时推送，直到 done/error。"""
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "job 不存在")

    async def gen():
        idx = 0
        while True:
            evts, _ = events.since(job_id, idx)
            for e in evts:
                idx += 1
                yield f"data: {json.dumps(e, ensure_ascii=False)}\n\n"
                if e["type"] in ("done", "error"):
                    return
            if not evts:
                j = db.get_job(job_id)
                if j and j["status"] in ("done", "failed") and idx == 0:
                    t = "done" if j["status"] == "done" else "error"
                    yield f"data: {json.dumps({'type': t, 'message': '从历史状态恢复'}, ensure_ascii=False)}\n\n"
                    return
                await asyncio.sleep(0.3)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/jobs/{job_id}/result")
def job_result(job_id: str):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "job 不存在")
    data = runner.get_result(job_id)
    if data is None:
        raise HTTPException(409, f"尚未完成（当前状态: {job['status']}，步骤: {job['step']}）")
    return data


@app.get("/api/jobs/{job_id}/file")
def job_file(job_id: str, path: str, start: int = 1, end: int = 0):
    """代码片段查看：证据点击跳转的后端支撑。"""
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "job 不存在")
    rel = safe_rel(path)
    if not rel:
        raise HTTPException(400, "非法路径")
    art = config.JOBS_DIR / job_id / "fetch.json"
    if not art.is_file():
        raise HTTPException(409, "仓库尚未就绪")
    repo_dir = Path(json.loads(art.read_text(encoding="utf-8"))["data"]["repo_dir"])
    fp = repo_dir / rel
    if not fp.is_file():
        raise HTTPException(404, "文件不存在")
    lines = fp.read_text(encoding="utf-8", errors="replace").splitlines()
    n = len(lines)
    s = max(1, start)
    if s > n:
        raise HTTPException(400, "start 超出文件行数")
    e = min(n, end if end >= s else s + 199)
    return {"path": rel, "start": s, "end": e, "total_lines": n,
            "lines": [{"n": i, "text": lines[i - 1]} for i in range(s, e + 1)]}

@app.get("/api/jobs/{job_id}/preview", response_class=HTMLResponse)
def job_preview(job_id: str):
    """导览结果一键渲染为可分享的静态 HTML 页面（答辩演示 / 导出）。"""
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "job 不存在")
    page = preview.build_html(job_id)
    if page is None:
        raise HTTPException(409, f"尚未完成（当前状态: {job['status']}）")
    return HTMLResponse(page)
