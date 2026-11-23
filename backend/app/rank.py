"""步骤3 Rank：依赖中心度(PageRank-lite) + 入口加成 + 规模因子，选出 top-K 关键文件。
这是控制 LLM token 成本的关键闸门。"""
import math
from . import config


def rank(scan_data: dict) -> list[dict]:
    files = {f["path"]: f for f in scan_data["files"]}
    src = [p for p, f in files.items() if f["lang"] in ("python", "javascript", "typescript")]
    tests = set(scan_data["tests"])
    cand = [p for p in src if p not in tests]
    if not cand:
        cand = src or list(files)
    edges = [e for e in scan_data["edges"] if e["src"] in files and e["dst"] in files]
    out_deg, inbound = {}, {}
    for e in edges:
        out_deg[e["src"]] = out_deg.get(e["src"], 0) + 1
        inbound.setdefault(e["dst"], []).append(e["src"])
    n = max(len(cand), 1)
    score = {p: 1.0 / n for p in cand}
    for _ in range(12):
        new = {}
        for p in cand:
            s = 0.15 / n
            for q in inbound.get(p, []):
                if q in score:
                    s += 0.85 * score[q] / max(out_deg.get(q, 1), 1)
            new[p] = s
        score = new
    entries = set(scan_data["entries"])
    ranked = []
    for p in cand:
        s = score[p]
        reasons = []
        if p in entries:
            s *= 3.0
            reasons.append("入口文件")
        if inbound.get(p):
            reasons.append(f"被 {len(inbound[p])} 个文件导入")
        size = files[p]["size"] if p in files else 0
        s *= 1.0 + min(math.log10(max(size, 1)) / 10.0, 0.5)
        ranked.append({"path": p, "score": round(s, 6), "reasons": reasons})
    ranked.sort(key=lambda x: -x["score"])
    return ranked[:config.TOP_K_FILES]
