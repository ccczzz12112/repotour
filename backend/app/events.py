"""进程内事件日志：流水线每步 emit，SSE 端点按游标读取（支持断线重连回放）"""
import threading
import time

_lock = threading.Lock()
_jobs: dict[str, list[dict]] = {}


def init_job(job_id):
    with _lock:
        _jobs.setdefault(job_id, [])


def emit(job_id, type_, **kw):
    evt = {"type": type_, "ts": time.time(), **kw}
    with _lock:
        _jobs.setdefault(job_id, []).append(evt)
    return evt


def since(job_id, idx):
    with _lock:
        evts = _jobs.get(job_id, [])
        return evts[idx:], len(evts)
