"""步骤6 Tour：从入口沿真实依赖图选调用链，生成 6-10 站导览路线（灵魂步骤）。"""
import json
import re
from pathlib import Path
from .. import llm
from ..evidence import filter_valid, first_lines

_TAG = re.compile(r"<[^>]+>")


def _clean(text, limit=160):
    """把 README 片段清洗成可读纯文本：去标签/图片/链接/标题行，按句子边界截断。"""
    t = _TAG.sub(" ", text or "")
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", t)
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"[*_`|]+", "", t)
    lines = []
    for raw in t.splitlines():
        s = re.sub(r"^[#>*\-\s]+", "", raw).strip()
        if not s or len(s) <= 14:      # 丢弃标题行 / 徽章行（如仓库名本身）
            continue
        lines.append(s)
    t = re.sub(r"\s+", " ", " ".join(lines)).strip(" -:")
    if len(t) > limit:
        cut = max(t.rfind("。", 0, limit), t.rfind(". ", 0, limit), t.rfind("；", 0, limit))
        t = (t[:cut + 1] if cut > limit // 2
             else t[:limit].rsplit(" ", 1)[0] + "…")
    return t


def _chain(scan_data, ranked):
    """沿 import 边从入口走出一条真实调用链；不足 8 个时按中心度补齐。"""
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
    on_chain = len(chain)
    prev = {b: a for a, b in zip(chain, chain[1:])}
    for r in ranked:
        if len(chain) >= 8:
            break
        if r["path"] not in seen:
            chain.append(r["path"])
            seen.add(r["path"])
    return chain, on_chain, prev


def _ev_for(root, path, cards_by_path):
    card = cards_by_path.get(path)
    if card and card["evidence"]:
        return dict(card["evidence"][0])
    return first_lines(root, path)


def _fallback(payload):
    stops = []
    for i, item in enumerate(payload["chain"]):
        p, syms = item["path"], item["symbols"]
        stem = Path(p).stem
        n = item.get("symbol_count") or len(syms)
        if item.get("prev"):
            why = f"它被 {Path(item['prev']).name} 直接导入，是这条调用链上的第 {i} 跳。"
        elif item.get("on_chain"):
            why = "这是程序的入口，所有能力都从这里串起来。"
        else:
            why = f"按依赖中心度入选：被 {item.get('inbound', 0)} 个文件引用。"
        narr = item["summary"] or f"{stem} 模块，含 {n} 个顶层符号。"
        if syms:
            narr = narr.rstrip("。；") + f"；重点看 {'、'.join(syms[:3])}。"
        stops.append({"title": f"第{i + 1}站 · {Path(p).name}",
                      "narrative": _clean(narr, 200),
                      "why": why,
                      "files": [item["ev"]] if item["ev"] else [],
                      "quiz": f"{syms[0]} 在 {p} 中的作用是什么？" if syms else f"{p} 负责什么？"})
    return {"stops": stops}


def run(repo_dir, scan_data, ranked, cards, stats, emit):
    root = Path(repo_dir)
    cards_by_path = {c["path"]: c for c in cards}
    chain, on_chain, prev = _chain(scan_data, ranked)
    inbound = {}
    for e in scan_data["edges"]:
        inbound[e["dst"]] = inbound.get(e["dst"], 0) + 1
    items = []
    for idx, p in enumerate(chain):
        c = cards_by_path.get(p, {})
        items.append({"path": p,
                      "symbols": c.get("key_symbols") or scan_data["symbols"].get(p, [])[:5],
                      "summary": c.get("responsibility", ""),
                      "symbol_count": len(scan_data["symbols"].get(p, [])),
                      "inbound": inbound.get(p, 0),
                      "on_chain": idx < on_chain,
                      "prev": prev.get(p, "") if idx < on_chain else "",
                      "ev": _ev_for(root, p, cards_by_path)})
    payload = {"chain": items, "tests": scan_data["tests"][:5],
               "readme": _clean(scan_data["readme"], 600)}
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
                      "narrative": _clean(str(s.get("narrative") or ""), 300),
                      "why": _clean(str(s.get("why") or ""), 120),
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
    readme_line = _clean(scan_data["readme"], 150)
    overview = {"title": "第0站 · 全景与入口",
                "narrative": (f"{readme_line} 全仓共 {scan_data['stats']['source_files']} 个源码文件、"
                              f"{scan_data['stats']['edges']} 条模块依赖边。" if readme_line
                              else "先看 README 与目录结构，建立整体印象。"),
                "why": "读细节之前，先建立全局地图。",
                "files": [head_ev] if head_ev else [],
                "quiz": "这个仓库解决什么问题？"}
    stops = [overview] + stops
    if scan_data["tests"]:
        tev = first_lines(root, scan_data["tests"][0])
        if tev:
            stops.append({"title": "最后一站 · 测试与质量",
                          "narrative": f"全仓共 {len(scan_data['tests'])} 个测试文件；先跑通它们，"
                                       "再动手改代码，是验证理解最可靠的方式。",
                          "why": "测试是可执行的文档。", "files": [tev],
                          "quiz": "哪个测试覆盖了核心模块？"})
    stops = stops[:10]
    for i, s in enumerate(stops):
        s["order"] = i + 1
    return stops
