"""步骤5 Reduce：模块卡片 + 已验证依赖边 -> 分层架构图。
骨架（节点分组/边）完全来自静态分析，LLM 只负责命名、分层、注释 —— 无权新增边。
分组覆盖全部源码文件（含测试），卡片摘要按需附加。"""
import json
import posixpath
from collections import defaultdict
from .. import llm

LAYERS = ("entry", "api", "core", "data", "util", "test")
SOURCE_LANGS = ("python", "javascript", "typescript")


def _groups(scan_data):
    g = defaultdict(list)
    for f in scan_data["files"]:
        if f["lang"] in SOURCE_LANGS:
            g[posixpath.dirname(f["path"]) or "."].append(f["path"])
    if len(g) > 28:
        g2 = defaultdict(list)
        for key, ps in g.items():
            g2[key.split("/")[0]].extend(ps)
        g = g2
    return dict(g)


def _guess_layer(gid, paths, entries):
    if any(p in entries for p in paths):
        return "entry"
    low = gid.lower()
    if "test" in low:
        return "test"
    if any(k in low for k in ("model", "data", "storage", "db", "dao")):
        return "data"
    if any(k in low for k in ("util", "helper", "common")):
        return "util"
    if any(k in low for k in ("api", "route", "view", "handler")):
        return "api"
    return "core"


def _fallback(payload):
    return {"nodes": [{"id": n["id"], "label": n["id"].split("/")[-1] or n["id"],
                       "layer": n["layer"], "note": ""} for n in payload["nodes"]],
            "edges": [{"source": e["source"], "target": e["target"], "note": ""}
                      for e in payload["edges"]]}


def run(scan_data, cards, stats, emit):
    groups = _groups(scan_data)
    entries = set(scan_data["entries"])
    cards_by_path = {c["path"]: c for c in cards}
    file2group = {}
    for gid, ps in groups.items():
        for p in ps:
            file2group[p] = gid
    gedges = {}
    for e in scan_data["edges"]:
        a, b = file2group.get(e["src"]), file2group.get(e["dst"])
        if a and b and a != b:
            gedges[(a, b)] = gedges.get((a, b), 0) + 1
    nodes = [{"id": gid, "layer": _guess_layer(gid, ps, entries), "paths": ps,
              "summaries": [cards_by_path[p]["responsibility"] for p in ps if p in cards_by_path][:6]}
             for gid, ps in groups.items()]
    edges = [{"source": a, "target": b, "count": n} for (a, b), n in gedges.items()]
    payload = {"nodes": nodes, "edges": edges}
    prompt = ("以下是仓库的模块分组与【已静态验证】的组间依赖边。\n"
              f"分组: {json.dumps(nodes, ensure_ascii=False)[:6000]}\n"
              f"依赖边: {json.dumps(edges, ensure_ascii=False)[:3000]}\n\n"
              "为每个分组给出简短中文 label、层级 layer(entry/api/core/data/util/test)、一句话 note；"
              "为每条已有边补充 note。禁止新增边或节点。\n"
              '输出 JSON: {"nodes":[{"id":"...","label":"...","layer":"...","note":"..."}],'
              '"edges":[{"source":"...","target":"...","note":"..."}]}')
    data = llm.call_json("reduce", prompt, payload, _fallback, strong=True, stats=stats)
    if not isinstance(data, dict):
        data = _fallback(payload)
    llm_nodes = {n.get("id"): n for n in data.get("nodes", []) if isinstance(n, dict)}
    out_nodes = []
    for n in nodes:
        ln = llm_nodes.get(n["id"], {})
        layer = ln.get("layer") or n["layer"]
        if layer not in LAYERS:
            layer = n["layer"]
        out_nodes.append({"id": n["id"],
                          "label": str(ln.get("label") or n["id"].split("/")[-1] or n["id"])[:24],
                          "layer": layer, "type": "module", "paths": n["paths"],
                          "note": str(ln.get("note") or "")[:80]})
    llm_edges = {(e.get("source"), e.get("target")): e
                 for e in data.get("edges", []) if isinstance(e, dict)}
    out_edges = []
    for e in edges:
        le = llm_edges.get((e["source"], e["target"]), {})
        out_edges.append({"source": e["source"], "target": e["target"], "kind": "import",
                          "verified": True, "note": str(le.get("note") or "")[:80]})
    return {"nodes": out_nodes, "edges": out_edges}
