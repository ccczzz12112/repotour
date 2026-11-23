"""步骤6 Tour：从入口沿真实依赖图选调用链，生成 6-10 站导览路线（灵魂步骤）。"""
import json
from pathlib import Path
from .. import llm
from ..evidence import filter_valid, first_lines


def _chain(scan_data, ranked):
    score = {r["path"]: r["score"] for r in ranked}
    adj = {}
    for e in scan_data["edges"]:
        adj.setdefault(e["src"], []).append(e["dst"])
    entries = scan_data["entries"]
    start = max(entries, key=lambda p: score.get(p, 0)) if entries else (
        ranked[0]["path"] if ranked else None)
    chain, seen = [], set()
    cur = start
    while cur and cur not in seen and len(chain) < 8:
        chain.append(cur)
        seen.add(cur)
        nxts = [p for p in adj.get(cur, []) if p not in seen and p in score]
        cur = max(nxts, key=lambda p: score[p]) if nxts else None
    for r in ranked:
        if len(chain) >= 8:
            break
        if r["path"] not in seen:
            chain.append(r["path"])
            seen.add(r["path"])
    return chain


def _ev_for(root, path, cards_by_path):
    card = cards_by_path.get(path)
    if card and card["evidence"]:
        return dict(card["evidence"][0])
    return first_lines(root, path)


def _fallback(payload):
    stops = []
    for i, item in enumerate(payload["chain"]):
        p = item["path"]
        sym = item["symbols"][0] if item["symbols"] else None
        stops.append({"title": f"第{i + 1}站 · {Path(p).name}",
                      "narrative": item["summary"] or f"阅读 {p}，关注 {sym or '顶层符号'}。",
                      "why": "位于从入口出发的真实调用链上，或按依赖中心度选出的核心模块。",
                      "files": [item["ev"]] if item["ev"] else [],
                      "quiz": f"{sym} 在 {p} 中的作用是什么？" if sym else f"{p} 负责什么？"})
    return {"stops": stops}


def run(repo_dir, scan_data, ranked, cards, stats, emit):
    root = Path(repo_dir)
    cards_by_path = {c["path"]: c for c in cards}
    chain = _chain(scan_data, ranked)
    items = []
    for p in chain:
        c = cards_by_path.get(p, {})
        items.append({"path": p,
                      "symbols": c.get("key_symbols") or scan_data["symbols"].get(p, [])[:5],
                      "summary": c.get("responsibility", ""),
                      "ev": _ev_for(root, p, cards_by_path)})
    payload = {"chain": items, "tests": scan_data["tests"][:5],
               "readme": scan_data["readme"][:800]}
    prompt = ("为仓库新人规划源码导览路线，6-10 站，沿给定调用链前进。\n"
              f"调用链: {json.dumps(items, ensure_ascii=False)[:6000]}\n"
              f"测试: {payload['tests']}\n\n"
              "每站: title(简短中文)、narrative(<=150字)、why(为什么重要)、"
              "files(证据，path/start/end 必须来自上面的调用链数据)、quiz(一个理解问题)。\n"
              '输出 JSON: {"stops":[{"title":"...","narrative":"...","why":"...",'
              '"files":[{"path":"...","start":1,"end":10}],"quiz":"..."}]}')
    data = llm.call_json("tour", prompt, payload, _fallback, strong=True, stats=stats)
    if not isinstance(data, dict):
        data = _fallback(payload)
    stops = []
    for s in data.get("stops", []):
        if not isinstance(s, dict):
            continue
        evs, _ = filter_valid(s.get("files", []), root)
        if not evs:
            continue
        stops.append({"title": str(s.get("title") or "")[:40],
                      "narrative": str(s.get("narrative") or "")[:300],
                      "why": str(s.get("why") or "")[:120],
                      "files": evs, "quiz": str(s.get("quiz") or "")[:120]})
    if len(stops) < 4:
        stops = []
        for s in _fallback(payload)["stops"]:
            evs, _ = filter_valid(s["files"], root)
            if evs:
                stops.append({**s, "files": evs})
    head_ev = None
    for r in ranked:
        head_ev = _ev_for(root, r["path"], cards_by_path)
        if head_ev:
            break
    overview = {"title": "第0站 · 全景与入口",
                "narrative": (scan_data["readme"][:150] or "先看 README 与目录结构，建立整体印象。"),
                "why": "读细节之前，先建立全局地图。",
                "files": [head_ev] if head_ev else [],
                "quiz": "这个仓库解决什么问题？"}
    stops = [overview] + stops
    if scan_data["tests"]:
        tev = first_lines(root, scan_data["tests"][0])
        if tev:
            stops.append({"title": "最后一站 · 测试与质量",
                          "narrative": "看看测试怎么组织，跑通它们是验证理解的最好方式。",
                          "why": "测试是可执行的文档。", "files": [tev],
                          "quiz": "哪个测试覆盖了核心模块？"})
    stops = stops[:10]
    for i, s in enumerate(stops):
        s["order"] = i + 1
    return stops
