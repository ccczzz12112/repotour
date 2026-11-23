"""全局配置：环境变量 + .env（.env 不入库，见 .env.example）"""
import os
from pathlib import Path
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv(BACKEND_DIR / ".env")


def _int(key, default):
    try:
        return int(os.getenv(key, str(default)))
    except ValueError:
        return default


DATA_DIR = Path(os.getenv("DATA_DIR", str(BACKEND_DIR / "data"))).resolve()
REPOS_DIR = DATA_DIR / "repos"
JOBS_DIR = DATA_DIR / "jobs"
DB_PATH = DATA_DIR / "repotour.db"

# mock = 无需 API Key，离线跑通全流程（开发/联调）；live = 真实 LLM
LLM_MODE = os.getenv("LLM_MODE", "mock").lower()
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").rstrip("/")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL_MAP = os.getenv("LLM_MODEL_MAP", "qwen-flash")
LLM_MODEL_STRONG = os.getenv("LLM_MODEL_STRONG", "qwen-plus")
LLM_TIMEOUT = _int("LLM_TIMEOUT", 120)

TOP_K_FILES = _int("TOP_K_FILES", 150)
MAX_FILES = _int("MAX_FILES", 2000)
MAX_REPO_MB = _int("MAX_REPO_MB", 50)
MAP_WORKERS = _int("MAP_WORKERS", 4)
CLONE_TIMEOUT = _int("CLONE_TIMEOUT", 180)
ALLOW_LOCAL_REPOS = os.getenv("ALLOW_LOCAL_REPOS", "1") == "1"

SKIP_DIRS = {".git", "node_modules", "vendor", "dist", "build", "__pycache__", ".venv", "venv",
             ".next", ".nuxt", "target", ".idea", ".vscode", "coverage", ".tox", ".mypy_cache",
             ".pytest_cache", "bower_components", ".gradle", "out", "obj"}
