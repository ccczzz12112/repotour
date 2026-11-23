"""步骤1 Fetch：浅克隆 GitHub/Gitee 仓库或复制本地目录，强制规模上限。"""
import hashlib
import re
import shutil
import subprocess
from pathlib import Path
from . import config

URL_RE = re.compile(r"^https://(github\.com|gitee\.com)/[\w.\-]+/[\w.\-]+(\.git)?/?$")


class FetchError(Exception):
    pass


def _run_git(args, timeout):
    return subprocess.run(["git", *args], capture_output=True, text=True,
                          timeout=timeout, encoding="utf-8", errors="replace")


def fetch(repo_url: str) -> dict:
    config.REPOS_DIR.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(repo_url.encode("utf-8")).hexdigest()[:12]
    repo_dir = config.REPOS_DIR / key
    local = Path(repo_url)
    if local.exists() and local.is_dir():
        if not config.ALLOW_LOCAL_REPOS:
            raise FetchError("未开启本地仓库支持（ALLOW_LOCAL_REPOS=0）")
        if not repo_dir.exists():
            shutil.copytree(local, repo_dir, ignore=shutil.ignore_patterns(*config.SKIP_DIRS))
        commit = "local"
    else:
        if not URL_RE.match(repo_url):
            raise FetchError("仅支持 https://github.com/<owner>/<repo>、gitee 链接或本地目录")
        if not repo_dir.exists():
            r = _run_git(["clone", "--depth", "1", "--single-branch", repo_url, str(repo_dir)],
                         config.CLONE_TIMEOUT)
            if r.returncode != 0:
                shutil.rmtree(repo_dir, ignore_errors=True)
                raise FetchError(f"git clone 失败: {(r.stderr or r.stdout)[-400:]}")
        r = _run_git(["-C", str(repo_dir), "rev-parse", "HEAD"], 30)
        commit = r.stdout.strip() if r.returncode == 0 else "unknown"

    files, total = [], 0
    for f in repo_dir.rglob("*"):
        if not f.is_file():
            continue
        rel = f.relative_to(repo_dir).as_posix()
        if any(part in config.SKIP_DIRS for part in rel.split("/")[:-1]):
            continue
        files.append(rel)
        total += f.stat().st_size
    if len(files) > config.MAX_FILES:
        raise FetchError(f"仓库过大：{len(files)} 个文件 > 上限 {config.MAX_FILES}，请换更小的仓库")
    if total > config.MAX_REPO_MB * 1024 * 1024:
        raise FetchError(f"仓库过大：{total / 1048576:.1f}MB > 上限 {config.MAX_REPO_MB}MB")
    return {"repo_dir": str(repo_dir), "commit": commit,
            "file_count": len(files), "size_bytes": total}
