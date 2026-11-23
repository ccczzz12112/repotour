"""SQLite：jobs 表 + LLM 缓存表（每次调用独立连接，线程安全）"""
import sqlite3
import time
from contextlib import contextmanager
from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs(
  id TEXT PRIMARY KEY, repo_url TEXT NOT NULL, commit_hash TEXT DEFAULT '',
  status TEXT DEFAULT 'pending', step TEXT DEFAULT '', error TEXT DEFAULT '',
  created_at REAL, updated_at REAL);
CREATE TABLE IF NOT EXISTS llm_cache(
  key TEXT PRIMARY KEY, model TEXT, response TEXT, created_at REAL);
"""


@contextmanager
def conn():
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(config.DB_PATH, timeout=30)
    c.row_factory = sqlite3.Row
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init_db():
    with conn() as c:
        c.executescript(SCHEMA)
        c.execute("PRAGMA journal_mode=WAL")


def create_job(job_id, repo_url):
    now = time.time()
    with conn() as c:
        c.execute("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)",
                  (job_id, repo_url, "", "pending", "", "", now, now))


def update_job(job_id, **fields):
    fields["updated_at"] = time.time()
    keys = ",".join(f"{k}=?" for k in fields)
    with conn() as c:
        c.execute(f"UPDATE jobs SET {keys} WHERE id=?", (*fields.values(), job_id))


def get_job(job_id):
    with conn() as c:
        row = c.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        return dict(row) if row else None


def latest_done_job(repo_url):
    with conn() as c:
        row = c.execute(
            "SELECT * FROM jobs WHERE repo_url=? AND status='done' ORDER BY created_at DESC LIMIT 1",
            (repo_url,)).fetchone()
        return dict(row) if row else None


def list_jobs():
    with conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100")]


def cache_get(key):
    with conn() as c:
        row = c.execute("SELECT response FROM llm_cache WHERE key=?", (key,)).fetchone()
        return row["response"] if row else None


def cache_put(key, model, response):
    with conn() as c:
        c.execute("INSERT OR REPLACE INTO llm_cache VALUES(?,?,?,?)",
                  (key, model, response, time.time()))
