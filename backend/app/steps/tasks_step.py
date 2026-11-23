"""步骤7 Tasks：生成分级上手任务（L1观察 -> L2理解 -> L3微改），验收绑定现有测试。"""
import json
from pathlib import Path
from .. import llm
from ..evidence import safe_rel


def _fallback(payload):
    mods, tests = payload["modules"], payload["tests"]
    entry = payload["entry"]
    core = mods[1]["path"] if len(mods) > 1 else (mods[0]["path"] if mods else entry)
    test_cmd = "pytest" if any(t.endswith(".py") for t in tests) else "npm test"
    tasks = [
        {"level": 1, "title": "找到入口与启动流程",
         "description": f"打开 {entry}，列出它导入的前 3 个内部模块。",
         "files": [entry] if entry else [],
         "acceptance": "能口头说出启动流程与对应文件", "hints": ["看 import 区"]},
        {"level": 2, "title": "画出一条调用链",
         "description": f"从 {entry} 出发，画出到 {core} 的依赖路径。",
         "files": [p for p in [entry, core] if p],
         "acceptance": "路径与真实 import 关系一致", "hints": ["用架构图核对"]},
    ]
    if tests:
        tasks.append({"level": 3, "title": "为核心模块补一条测试",
                      "description": f"为 {core} 中的一个函数补充边界用例，加到 {tests[0]}。",
                      "files": [core, tests[0]],
                      "acceptance": f"运行 {test_cmd} 全部通过",
                      "hints": ["先跑通现有测试确认环境"]})
    return {"tasks": tasks}


def run(repo_dir, scan_data, cards, stats, emit):
    root = Path(repo_dir)
    mods = [{"path": c["path"], "responsibility": c["responsibility"]} for c in cards[:10]]
    payload = {"modules": mods, "tests": scan_data["tests"][:8],
               "entry": scan_data["entries"][0] if scan_data["entries"] else (
                   mods[0]["path"] if mods else "")}
    prompt = ("为仓库新人生成 3-5 个分级上手任务：L1 观察、L2 理解、L3 微改。\n"
              f"核心模块: {json.dumps(mods, ensure_ascii=False)[:2500]}\n"
              f"现有测试: {payload['tests']}\n入口: {payload['entry']}\n"
              "L3 的验收必须是跑现有测试命令全部通过，不得要求新增基础设施。files 必须来自上面给出的路径。\n"
              '输出 JSON: {"tasks":[{"level":1,"title":"...","description":"...",'
              '"files":["..."],"acceptance":"...","hints":["..."]}]}')
    data = llm.call_json("tasks", prompt, payload, _fallback, strong=True, stats=stats)
    if not isinstance(data, dict):
        data = _fallback(payload)
    tasks = []
    for t in data.get("tasks", []):
        if not isinstance(t, dict):
            continue
        files = [safe_rel(f) for f in t.get("files", [])]
        files = [f for f in files if f and (root / f).is_file()]
        if not files:
            continue
        level = t.get("level")
        level = level if level in (1, 2, 3) else 1
        tasks.append({"level": level, "title": str(t.get("title") or "")[:40],
                      "description": str(t.get("description") or "")[:200],
                      "files": files, "acceptance": str(t.get("acceptance") or "")[:120],
                      "hints": [str(h)[:80] for h in t.get("hints", [])][:3]})
    if len(tasks) < 3:
        tasks = [t for t in _fallback(payload)["tasks"] if t["files"]]
    return tasks[:5]
