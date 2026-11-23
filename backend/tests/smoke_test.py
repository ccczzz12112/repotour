"""端到端冒烟测试：fixture 仓库 + mock LLM 全流水线 + API。
运行: 在 backend 目录执行  python tests/smoke_test.py"""
import json
import os
import sys
import tempfile
import time
from pathlib import Path

os.environ["LLM_MODE"] = "mock"
_tmp = tempfile.mkdtemp(prefix="repotour_test_")
os.environ["DATA_DIR"] = str(Path(_tmp) / "data")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import db, runner, config  # noqa: E402
from app.evidence import validate  # noqa: E402

FIXTURE = {
    "README.md": "# MiniShop\nA minimal example shop package for testing RepoTour.\n",
    "pyproject.toml": '[project]\nname = "minishop"\nversion = "0.1.0"\n[project.scripts]\nminishop = "minishop.cli:main"\n',
    "minishop/__init__.py": '"""MiniShop package."""\n__version__ = "0.1.0"\n',
    "minishop/cli.py": '"""Command line entry."""\nimport argparse\nfrom minishop.core import Shop\n\n\ndef main():\n    parser = argparse.ArgumentParser()\n    parser.add_argument("item")\n    args = parser.parse_args()\n    shop = Shop()\n    print(shop.buy(args.item))\n\n\nif __name__ == "__main__":\n    main()\n',
    "minishop/core.py": '"""Core business logic."""\nfrom .models import Item\nfrom .storage import Storage\n\n\nclass Shop:\n    def __init__(self):\n        self.storage = Storage()\n\n    def buy(self, name):\n        item = Item(name, price=10)\n        self.storage.save(item)\n        return f"bought {item.name}"\n',
    "minishop/models.py": '"""Data models."""\nfrom dataclasses import dataclass\n\n\n@dataclass\nclass Item:\n    name: str\n    price: int\n',
    "minishop/storage.py": '"""Persistence layer."""\nfrom .utils import slugify\n\n\nclass Storage:\n    def __init__(self):\n        self.rows = {}\n\n    def save(self, item):\n        self.rows[slugify(item.name)] = item\n',
    "minishop/utils.py": '"""Utility functions."""\n\n\ndef slugify(name):\n    return name.lower().replace(" ", "-")\n',
    "tests/test_core.py": '"""Core tests."""\nfrom minishop.core import Shop\n\n\ndef test_buy():\n    shop = Shop()\n    assert shop.buy("apple") == "bought apple"\n',
}


def build_fixture():
    root = Path(_tmp) / "fixture_repo"
    for rel, content in FIXTURE.items():
        fp = root / rel
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(content, encoding="utf-8")
    return root


def main():
    db.init_db()
    root = build_fixture()
    job_id = "smoke0000001"
    db.create_job(job_id, str(root))
    runner.run_job(job_id)
    job = db.get_job(job_id)
    assert job["status"] == "done", f"流水线失败: {job['error']}"
    res = runner.get_result(job_id)
    assert res, "无 result"
    tour, graph, tasks, cards = res["tour"], res["graph"], res["tasks"], res["modules"]
    assert len(tour) >= 6, f"导览站点过少: {len(tour)}"
    assert len(tasks) >= 3, f"任务过少: {len(tasks)}"
    assert graph["edges"] and all(e["verified"] for e in graph["edges"]), "存在未验证的架构边"
    assert res["stats"]["evidence_total"] > 0
    assert res["stats"]["evidence_passed"] == res["stats"]["evidence_total"], "mock 模式证据应 100% 通过"

    fetch_art = json.loads((config.JOBS_DIR / job_id / "fetch.json").read_text(encoding="utf-8"))
    repo_dir = Path(fetch_art["data"]["repo_dir"])
    for c in cards:
        for ev in c["evidence"]:
            ok, why = validate(ev, repo_dir)
            assert ok, f"证据校验失败 {ev}: {why}"
    scan_art = json.loads((config.JOBS_DIR / job_id / "scan.json").read_text(encoding="utf-8"))["data"]
    edges = {(e["src"], e["dst"]) for e in scan_art["edges"]}
    assert ("minishop/cli.py", "minishop/core.py") in edges, "绝对导入解析失败"
    assert ("minishop/core.py", "minishop/models.py") in edges, "相对导入解析失败"
    assert "minishop/cli.py" in scan_art["entries"], "入口探测失败"

    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        r = client.post("/api/jobs", json={"repo_url": str(root)})
        assert r.status_code == 200
        jid = r.json()["job_id"]
        deadline = time.time() + 60
        st = {}
        while time.time() < deadline:
            st = client.get(f"/api/jobs/{jid}").json()
            if st["status"] in ("done", "failed"):
                break
            time.sleep(0.2)
        assert st["status"] == "done", f"API 流水线失败: {st.get('error')}"
        r = client.get(f"/api/jobs/{jid}/result")
        assert r.status_code == 200
        entry = r.json()["overview"]["entries"][0]
        r = client.get(f"/api/jobs/{jid}/file", params={"path": entry, "start": 1, "end": 5})
        assert r.status_code == 200 and len(r.json()["lines"]) == 5
        r = client.get(f"/api/jobs/{jid}/file", params={"path": "../../etc/passwd"})
        assert r.status_code == 400, "路径穿越未被拦截"

    print("SMOKE PASS")
    print(f"  导览站点: {len(tour)}  任务: {len(tasks)}  模块卡片: {len(cards)}")
    print(f"  架构节点: {len(graph['nodes'])}  验证边: {len(graph['edges'])}")
    print(f"  证据: {res['stats']['evidence_passed']}/{res['stats']['evidence_total']} 通过")
    print(f"  耗时: {res['stats']['duration_s']}s (mock 模式)")


if __name__ == "__main__":
    main()
