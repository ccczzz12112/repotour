"""导览结果可视化：把 result.json 渲染成自包含的静态 HTML（答辩演示 / 分享用）。

设计要点：
- 数据经 json.dumps 嵌入 <script type="application/json">，前端一律用 DOM API + textContent
  构建界面，不拼接 innerHTML —— 仓库内容是外部不可信输入。
- 代码片段随页面内嵌，导出单个 HTML 文件即可离线分享。
"""
import json
from pathlib import Path

from . import config, db, runner
from .evidence import safe_rel

MAX_SNIPPET_LINES = 60
MAX_MODULE_CARDS = 12


def _read_snippet(repo_dir, path, start, end, cap=MAX_SNIPPET_LINES):
    rel = safe_rel(path)
    if not rel:
        return None
    fp = Path(repo_dir) / rel
    try:
        text = fp.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    lines = text.splitlines()
    n = len(lines)
    s = max(1, int(start or 1))
    e = min(n, int(end or 0) if int(end or 0) >= s else s + cap - 1)
    if e - s + 1 > cap:
        e = s + cap - 1
    if s > n:
        return None
    return {"path": rel, "start": s, "end": e, "total": n,
            "lines": [{"n": i, "text": lines[i - 1][:300]} for i in range(s, e + 1)]}


def _collect_snippets(repo_dir, result):
    seen = {}
    for s in result.get("tour", []):
        for ev in s.get("files", []):
            key = f'{ev["path"]}:{ev["start"]}-{ev["end"]}'
            if key not in seen:
                seen[key] = _read_snippet(repo_dir, ev["path"], ev["start"], ev["end"])
    for c in result.get("modules", []):
        for ev in c.get("evidence", []):
            key = f'{ev["path"]}:{ev["start"]}-{ev["end"]}'
            if key not in seen:
                seen[key] = _read_snippet(repo_dir, ev["path"], ev["start"], ev["end"])
    return seen


def _payload(job_id, result):
    job = db.get_job(job_id) or {}
    repo_dir = ""
    art = config.JOBS_DIR / job_id / "fetch.json"
    if art.is_file():
        try:
            repo_dir = json.loads(art.read_text(encoding="utf-8"))["data"]["repo_dir"]
        except (OSError, json.JSONDecodeError, KeyError):
            repo_dir = ""
    snippets = _collect_snippets(repo_dir, result) if repo_dir else {}
    ov = result.get("overview", {})
    modules = sorted(result.get("modules", []), key=lambda c: -float(c.get("importance") or 0))
    return {
        "repo_url": ov.get("repo_url") or job.get("repo_url", ""),
        "commit": ov.get("commit", ""),
        "stats": result.get("stats", {}),
        "overview": {k: ov.get(k) for k in ("entries", "tests", "readme_excerpt")},
        "scan": ov.get("stats", {}),
        "graph": result.get("graph", {"nodes": [], "edges": []}),
        "tour": result.get("tour", []),
        "tasks": result.get("tasks", []),
        "modules": modules[:MAX_MODULE_CARDS],
        "module_total": len(modules),
        "snippets": {k: v for k, v in snippets.items() if v},
    }


def build_html(job_id):
    result = runner.get_result(job_id)
    if result is None:
        return None
    data = json.dumps(_payload(job_id, result), ensure_ascii=False).replace("</", "<\\/")
    return _TEMPLATE.replace("__PAYLOAD__", data)


_TEMPLATE = r'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RepoTour 导览</title>
<style>
:root{
  --bg:#080c18; --bg2:#0d1428; --card:rgba(255,255,255,.045); --line:rgba(255,255,255,.09);
  --txt:#e8ecf7; --dim:#9aa6c0; --acc:#8b7cff; --acc2:#39d3d3;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:
  radial-gradient(1200px 600px at 15% -10%, rgba(139,124,255,.22), transparent 60%),
  radial-gradient(900px 500px at 85% 0%, rgba(57,211,211,.14), transparent 55%),
  var(--bg);
  color:var(--txt);font:15px/1.6 "Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:1180px;margin:0 auto;padding:0 22px}
.hero{padding:44px 0 8px}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.5px;font-size:15px;color:var(--dim)}
.brand b{color:#fff;font-size:17px}
.logo{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;
  background:linear-gradient(135deg,var(--acc),var(--acc2));font-size:16px}
h1{font-size:38px;line-height:1.2;margin:18px 0 6px;letter-spacing:-.5px}
h1 .own{color:var(--dim);font-weight:500}
.meta{color:var(--dim);font-size:13.5px;display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.mono{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;background:rgba(255,255,255,.06);
  padding:2px 7px;border-radius:6px}
.chips{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0 6px}
.chip{border:1px solid var(--line);background:var(--card);border-radius:12px;padding:9px 14px;min-width:104px}
.chip .k{font-size:11.5px;color:var(--dim);letter-spacing:.4px}
.chip .v{font-size:19px;font-weight:650;margin-top:1px}
.chip.ok .v{color:#4ade80}
nav.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:26px 0 0;border-bottom:1px solid var(--line);padding-bottom:0;position:sticky;top:0;z-index:20;
  background:linear-gradient(180deg,rgba(8,12,24,.96),rgba(8,12,24,.86));backdrop-filter:blur(8px)}
nav.tabs a{padding:11px 16px;font-size:14px;color:var(--dim);border-bottom:2px solid transparent;border-radius:8px 8px 0 0}
nav.tabs a:hover{color:#fff;background:rgba(255,255,255,.05)}
nav.tabs a.on{color:#fff;border-bottom-color:var(--acc)}
section{padding:38px 0 6px}
.sec-h{display:flex;align-items:baseline;gap:12px;margin:0 0 18px}
.sec-h h2{font-size:22px;margin:0;letter-spacing:-.2px}
.sec-h .hint{color:var(--dim);font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px}
.grid{display:grid;gap:14px}
/* ---- 架构图 ---- */
.graphbox{overflow:auto;padding:8px;border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01));border:1px solid var(--line)}
svg.graph{display:block;margin:0 auto;max-width:100%;height:auto}
.edge{stroke:rgba(150,170,220,.30);fill:none;stroke-width:1.4}
.edge.hl{stroke:var(--acc2);stroke-width:2.2}
.node rect{fill:rgba(255,255,255,.055);stroke:rgba(255,255,255,.16);stroke-width:1;rx:10}
.node{cursor:pointer}
.node:hover rect{fill:rgba(255,255,255,.12)}
.node.dim{opacity:.22}
.node text.lb{fill:#e8ecf7;font-size:12.5px;font-weight:600}
.node text.la{fill:#9aa6c0;font-size:10px}
.legend{display:flex;gap:16px;flex-wrap:wrap;margin:12px 4px 0;font-size:12.5px;color:var(--dim)}
.legend i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px}
/* ---- 导览 ---- */
.tour{position:relative;padding-left:52px}
.tour:before{content:"";position:absolute;left:19px;top:8px;bottom:8px;width:2px;
  background:linear-gradient(180deg,var(--acc),var(--acc2),transparent)}
.stop{position:relative;margin-bottom:16px;padding:18px 20px}
.stop .num{position:absolute;left:-52px;top:16px;width:38px;height:38px;border-radius:50%;
  display:grid;place-items:center;font-weight:700;font-size:14px;
  background:linear-gradient(135deg,var(--acc),var(--acc2));color:#0a0f1e;
  box-shadow:0 0 0 5px var(--bg)}
.stop h3{margin:0 0 4px;font-size:16.5px}
.stop .why{color:#b9c4dc;font-size:13.5px}
.stop .narr{color:var(--dim);font-size:13px;margin-top:8px;white-space:pre-wrap}
.ev{display:inline-flex;align-items:center;gap:7px;margin:10px 8px 0 0;padding:7px 11px;border-radius:10px;
  border:1px solid rgba(139,124,255,.35);background:rgba(139,124,255,.12);font-size:12.5px;cursor:pointer;
  font-family:ui-monospace,Consolas,monospace;transition:.15s}
.ev:hover{background:rgba(139,124,255,.24);border-color:var(--acc)}
.ev .sym{color:var(--acc2)}
.ev .ok{color:#4ade80}
.quiz{margin-top:10px;font-size:12.5px;color:#fbbf24;opacity:.9}
/* ---- 模块卡 ---- */
.mods{grid-template-columns:repeat(auto-fill,minmax(268px,1fr))}
.mod{padding:16px 17px;display:flex;flex-direction:column;gap:7px}
.mod .p{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;color:#cfd8ee;word-break:break-all}
.mod .resp{font-size:13px;color:var(--dim);flex:1}
.role{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:#cfd8ee;align-self:flex-start}
.syms{display:flex;gap:6px;flex-wrap:wrap}
.syms span{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#a9b6d6;
  background:rgba(255,255,255,.06);padding:2px 7px;border-radius:6px}
.bar{height:4px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:4px}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--acc),var(--acc2))}
/* ---- 任务 ---- */
.task{padding:18px 20px;display:flex;gap:16px;align-items:flex-start}
.lvl{flex:0 0 46px;height:46px;border-radius:13px;display:grid;place-items:center;font-weight:800;font-size:13px;
  background:rgba(255,255,255,.07);border:1px solid var(--line);color:#fff}
.lvl.L1{background:rgba(74,222,128,.14);border-color:rgba(74,222,128,.4);color:#4ade80}
.lvl.L2{background:rgba(96,165,250,.14);border-color:rgba(96,165,250,.4);color:#60a5fa}
.lvl.L3{background:rgba(244,114,182,.14);border-color:rgba(244,114,182,.4);color:#f472b6}
.task h4{margin:0 0 4px;font-size:15.5px}
.task p{margin:0;font-size:13.5px;color:var(--dim)}
.task .files{margin-top:9px;display:flex;gap:6px;flex-wrap:wrap}
.task .files code{font-size:11.5px;background:rgba(255,255,255,.06);padding:2px 7px;border-radius:6px;color:#c7d2ea}
.task .acc{margin-top:9px;font-size:12.5px;color:#4ade80}
.task .hint{margin-top:5px;font-size:12px;color:#fbbf24;opacity:.85}
/* ---- 概览 ---- */
.ov{grid-template-columns:1.15fr .85fr}
.ov .card{padding:18px 20px}
.ov h4{margin:0 0 10px;font-size:13px;color:var(--dim);font-weight:600;letter-spacing:.4px}
.pathlist{display:flex;flex-direction:column;gap:6px;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;color:#cfd8ee}
.pathlist div{display:flex;align-items:center;gap:8px}
.dot{width:6px;height:6px;border-radius:50%;background:var(--acc2);flex:none}
.readme{white-space:pre-wrap;font-size:12.5px;color:#a9b6d6;max-height:210px;overflow:auto;
  background:rgba(0,0,0,.25);padding:12px;border-radius:10px;font-family:ui-monospace,Consolas,monospace}
/* ---- modal ---- */
#modal{position:fixed;inset:0;display:none;place-items:center;background:rgba(3,6,14,.72);backdrop-filter:blur(4px);z-index:60;padding:24px}
#modal.show{display:grid}
#modal .box{width:min(920px,100%);max-height:84vh;overflow:auto;border-radius:18px;border:1px solid var(--line);
  background:#0b1224;box-shadow:0 30px 80px rgba(0,0,0,.6)}
#modal .hd{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line);position:sticky;top:0;background:#0b1224}
#modal .hd b{font-size:14.5px}
#modal .x{cursor:pointer;border:1px solid var(--line);background:rgba(255,255,255,.05);border-radius:8px;
  width:30px;height:30px;display:grid;place-items:center;color:var(--dim)}
#modal .bd{padding:16px 20px 22px}
pre.code{margin:0;font-family:ui-monospace,Consolas,monospace;font-size:12.5px;line-height:1.55;overflow:auto}
pre.code .ln{color:#5b6884;user-select:none;display:inline-block;min-width:38px;text-align:right;padding-right:12px}
pre.code .hit{background:rgba(139,124,255,.16)}
footer{margin:56px 0 40px;padding-top:18px;border-top:1px solid var(--line);color:#69748e;font-size:12.5px;
  display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.btn{border:1px solid var(--line);background:rgba(255,255,255,.05);color:#dfe6f6;border-radius:10px;
  padding:8px 14px;font-size:12.5px;cursor:pointer;font-family:inherit}
.btn:hover{background:rgba(255,255,255,.11)}
@media(max-width:760px){h1{font-size:26px}.ov{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <div class="brand"><span class="logo">&#129517;</span><b>RepoTour</b><span>码途 · AI 仓库导览</span></div>
    <h1 id="title"></h1>
    <div class="meta" id="meta"></div>
    <div class="chips" id="chips"></div>
  </header>

  <nav class="tabs" id="tabs">
    <a href="#overview" class="on">概览</a>
    <a href="#graph">架构图</a>
    <a href="#tour">导览路线</a>
    <a href="#modules">模块卡片</a>
    <a href="#tasks">上手任务</a>
    <a href="#overview" id="btnExport" style="margin-left:auto">导出 HTML</a>
  </nav>

  <section id="overview">
    <div class="sec-h"><h2>仓库概览</h2><span class="hint">入口与项目自述</span></div>
    <div class="grid ov">
      <div class="card"><h4>入口 · 测试</h4>
        <div class="pathlist" id="entries"></div>
        <h4 style="margin-top:16px">测试样例（前 8 个）</h4>
        <div class="pathlist" id="tests"></div>
      </div>
      <div class="card"><h4>README 摘要</h4><div class="readme" id="readme"></div></div>
    </div>
  </section>

  <section id="graph">
    <div class="sec-h"><h2>架构图</h2><span class="hint">边 100% 来自静态 import 分析 · 悬停高亮相邻模块 · 点击查看详情</span></div>
    <div class="graphbox"><svg class="graph" id="svg"></svg></div>
    <div class="legend" id="legend"></div>
  </section>

  <section id="tour">
    <div class="sec-h"><h2>导览路线</h2><span class="hint">从入口沿真实调用链前进，每一站都带可点击验证的代码证据</span></div>
    <div class="tour" id="stops"></div>
  </section>

  <section id="modules">
    <div class="sec-h"><h2>模块卡片</h2><span class="hint" id="modHint"></span></div>
    <div class="grid mods" id="mods"></div>
  </section>

  <section id="tasks">
    <div class="sec-h"><h2>上手任务</h2><span class="hint">难度递进，做完即"入门成功"</span></div>
    <div class="grid" id="tasks" style="grid-template-columns:1fr"></div>
  </section>

  <footer>
    <div id="foot"></div>
    <div><button class="btn" id="btnPrint">打印 / 存 PDF</button></div>
  </footer>
</div>

<div id="modal"><div class="box">
  <div class="hd"><b id="mTitle"></b><div class="x" id="mClose">&#10005;</div></div>
  <div class="bd" id="mBody"></div>
</div></div>

<script type="application/json" id="payload">__PAYLOAD__</script>
<script>
const D = JSON.parse(document.getElementById('payload').textContent);
const $ = (id) => document.getElementById(id);
function el(tag, cls, text){ const n = document.createElement(tag); if(cls) n.className = cls;
  if(text !== undefined && text !== null) n.textContent = String(text); return n; }
const LAYERS = ['entry','api','core','data','util','test'];
const LCOLOR = {entry:'#f472b6', api:'#60a5fa', core:'#a78bfa', data:'#34d399', util:'#fbbf24', test:'#94a3b8'};
const LNAME = {entry:'入口', api:'接口', core:'核心', data:'数据', util:'工具', test:'测试'};

/* ---------- 头部 ---------- */
const repoPath = (D.repo_url || '').replace(/^https?:\/\/github\.com\//,'').replace(/\.git$/,'');
const parts = repoPath.split('/');
$('title').append(el('span','own', (parts[0]||'') + ' / '), document.createTextNode(' ' + (parts[1]||repoPath)));
const meta = $('meta');
meta.append(el('span', null, 'commit '), el('span','mono', (D.commit||'').slice(0,10)));
if (D.repo_url) { const a = el('a','mono','打开仓库 ↗'); a.href = D.repo_url; a.target='_blank'; meta.append(a); }

const s = D.scan || {};
const ev = D.stats || {};
const evRate = ev.evidence_total ? Math.round(100 * ev.evidence_passed / ev.evidence_total) : 0;
[['文件总数', s.total_files ?? '–'], ['源码文件', s.source_files ?? '–'],
 ['依赖边', s.edges ?? '–'], ['证据校验', evRate + '%'],
 ['耗时', (ev.duration_s ?? '–') + 's'], ['模块组', (D.graph.nodes||[]).length]].forEach(([k,v]) => {
  const c = el('div', 'chip' + (k === '证据校验' && evRate === 100 ? ' ok' : ''));
  c.append(el('div','k',k), el('div','v',v)); $('chips').append(c);
});

/* ---------- 概览 ---------- */
function pathList(box, list){ list.forEach(p => { const d = el('div'); d.append(el('i','dot'), el('span',null,p)); box.append(d); }); }
pathList($('entries'), D.overview.entries || []);
pathList($('tests'), (D.overview.tests || []).slice(0,8));
$('readme').textContent = (D.overview.readme_excerpt || '（无 README）').replace(/<[^>]+>/g, '').slice(0, 900);

/* ---------- 架构图 ---------- */
(function drawGraph(){
  const nodes = D.graph.nodes || [], edges = D.graph.edges || [];
  const byLayer = {};
  nodes.forEach(n => { (byLayer[n.layer] = byLayer[n.layer] || []).push(n); });
  const cols = LAYERS.filter(l => byLayer[l] && byLayer[l].length);
  const COLW = 236, ROWH = 58, PADT = 52, PADL = 24;
  let maxN = 1; cols.forEach(l => maxN = Math.max(maxN, byLayer[l].length));
  const W = PADL * 2 + COLW * cols.length, H = Math.max(260, PADT * 2 + ROWH * maxN);
  const svg = $('svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (t, a) => { const n = document.createElementNS(NS, t);
    for (const k in a) n.setAttribute(k, a[k]); return n; };
  const defs = mk('defs'); const marker = mk('marker', {id:'arw', viewBox:'0 0 10 10', refX:9, refY:5,
    markerWidth:6, markerHeight:6, orient:'auto-start-reverse'});
  marker.append(mk('path', {d:'M0,0 L10,5 L0,10 z', fill:'rgba(150,170,220,.45)'}));
  defs.append(marker); svg.append(defs);

  const pos = {}, groups = {}, colOrder = {};
  cols.forEach((layer, ci) => {
    let list = byLayer[layer].slice();
    if (ci === 0) {
      list.sort((a,b) => String(a.label||'').localeCompare(String(b.label||'')));
    } else {
      const yIdx = {};
      cols.slice(0, ci).forEach(pl => (colOrder[pl] || []).forEach((n, i) => { yIdx[n.id] = i; }));
      list = list.map(n => {
        const ps = edges.filter(e => e.target === n.id).map(e => yIdx[e.source]).filter(v => v !== undefined);
        return {n, b: ps.length ? ps.reduce((x,y) => x + y, 0) / ps.length : 999};
      }).sort((a,b) => (a.b - b.b) || String(a.n.label||'').localeCompare(String(b.n.label||''))).map(x => x.n);
    }
    colOrder[layer] = list;
    const top = PADT + (H - PADT * 2 - ROWH * list.length) / 2;
    list.forEach((n, ri) => {
      const g = mk('g', {class:'node', transform:`translate(${PADL + ci * COLW},${top + ri * ROWH})`});
      const w = COLW - 46, h = 40;
      g.append(mk('rect', {width:w, height:h, rx:10}));
      const t1 = mk('text', {class:'lb', x:11, y:18}); t1.textContent = (n.label||n.id||'').slice(0,22);
      const t2 = mk('text', {class:'la', x:11, y:33}); t2.textContent = LNAME[n.layer] || n.layer;
      g.append(t1, t2);
      g.addEventListener('mouseenter', () => highlight(n.id, true));
      g.addEventListener('mouseleave', () => highlight(n.id, false));
      g.addEventListener('click', () => showModule(n));
      svg.append(g); pos[n.id] = {x: PADL + ci * COLW, y: top + ri * ROWH, w, h};
      (groups[n.id] = g);
    });
  });
  cols.forEach((layer, ci) => {
    const t = mk('text', {x: PADL + ci * COLW + 4, y: 24, fill: LCOLOR[layer],
      'font-size': 11.5, 'font-weight': 600, 'letter-spacing': .5});
    t.textContent = (LNAME[layer] || layer) + ' ' + (byLayer[layer] || []).length;
    svg.append(t);
  });
  edges.forEach(e => {
    const a = pos[e.source], b = pos[e.target]; if (!a || !b) return;
    const x1 = a.x + a.w, y1 = a.y + a.h/2, x2 = b.x, y2 = b.y + b.h/2;
    let d;
    if (x2 > x1) {
      const dx = Math.max(24, (x2 - x1) * 0.42);
      d = `M${x1},${y1} C${x1+dx},${y1} ${x2-dx},${y2} ${x2-2},${y2}`;
    } else {
      const off = 64;
      d = `M${x1},${y1} C${x1+off},${y1} ${x2-off},${y2} ${x2-2},${y2}`;
    }
    const p = mk('path', {class:'edge', d, 'marker-end':'url(#arw)'});
    p.dataset.s = e.source; p.dataset.t = e.target; svg.insertBefore(p, svg.querySelector('.node'));
  });
  function highlight(id, on){
    const nb = new Set([id]);
    edges.forEach(e => { if (e.source === id) nb.add(e.target); if (e.target === id) nb.add(e.source); });
    svg.querySelectorAll('.node').forEach(g => {});
    Object.entries(groups).forEach(([nid, g]) => g.classList.toggle('dim', on && !nb.has(nid)));
    svg.querySelectorAll('.edge').forEach(p => {
      const hot = p.dataset.s === id || p.dataset.t === id;
      p.classList.toggle('hl', on && hot); p.style.opacity = (on && !hot) ? .15 : '';
    });
  }
  cols.forEach(l => { const d = el('div'); const i = el('i'); i.style.background = LCOLOR[l];
    d.append(i, document.createTextNode(LNAME[l] + ' (' + byLayer[l].length + ')')); $('legend').append(d); });
})();

function showModule(n){
  const body = $('mBody'); body.textContent = '';
  if (n.note) body.append(el('p', null, n.note));
  body.append(el('h4', null, '所属文件'));
  const pl = el('div', 'pathlist'); (n.paths||[]).forEach(p => { const d = el('div'); d.append(el('i','dot'), el('span',null,p)); pl.append(d); });
  body.append(pl);
  openModal(n.label || n.id);
}

/* ---------- 导览 ---------- */
(D.tour || []).forEach((st, i) => {
  const c = el('div', 'card stop');
  c.append(el('div', 'num', i));
  c.append(el('h3', null, st.title || ('第 ' + i + ' 站')));
  if (st.why) c.append(el('div', 'why', '为什么看这里：' + st.why));
  if (st.narrative) c.append(el('div', 'narr', String(st.narrative).slice(0, 400)));
  (st.files || []).forEach(f => {
    const k = `${f.path}:${f.start}-${f.end}`;
    const b = el('div', 'ev');
    b.append(el('span', 'ok', '✓'), el('span', null, f.path + ':' + f.start + '-' + f.end));
    if (f.symbol) b.append(el('span', 'sym', ' ' + f.symbol));
    b.addEventListener('click', () => showCode(k, f));
    c.append(b);
  });
  if (st.quiz) c.append(el('div', 'quiz', '自测：' + st.quiz));
  $('stops').append(c);
});

function showCode(key, f){
  const sn = D.snippets[key], body = $('mBody'); body.textContent = '';
  if (!sn) { body.append(el('p', null, '（该片段未内嵌，可调用 /api/jobs/{id}/file 接口查看）')); return openModal(f.path); }
  body.append(el('div','meta', `${sn.path} · 第 ${sn.start}-${sn.end} 行 / 共 ${sn.total} 行`));
  const pre = el('pre','code');
  sn.lines.forEach(l => {
    const row = el('div', l.n >= f.start && l.n <= f.end ? 'hit' : '');
    row.append(el('span','ln',l.n), document.createTextNode(l.text || ' '));
    pre.append(row);
  });
  body.append(pre);
  openModal(f.symbol ? (f.symbol + '()') : f.path);
}

/* ---------- 模块卡 ---------- */
$('modHint').textContent = `按重要度取前 ${(D.modules||[]).length} / 共 ${D.module_total || 0} 张`;
(D.modules || []).forEach(m => {
  const c = el('div', 'card mod');
  c.append(el('div','role', LNAME[m.role] || m.role || '模块'));
  c.append(el('div','p', m.path));
  c.append(el('div','resp', m.responsibility || ''));
  const sy = el('div','syms'); (m.key_symbols || []).slice(0,4).forEach(x => sy.append(el('span', null, x)));
  c.append(sy);
  const bar = el('div','bar'); const fill = el('i');
  fill.style.width = Math.min(100, Math.max(6, (Number(m.importance)||0) * 100)) + '%';
  bar.append(fill); c.append(bar);
  c.addEventListener('click', () => {
    const body = $('mBody'); body.textContent = '';
    body.append(el('p', null, m.responsibility || ''));
    const pl = el('div','pathlist'); pl.append(el('div', null, m.path)); body.append(pl);
    if ((m.evidence||[]).length) {
      body.append(el('h4', null, '代码证据'));
      m.evidence.forEach(e2 => {
        const b = el('div','ev'); b.append(el('span',null, `${e2.path}:${e2.start}-${e2.end}`));
        const k2 = `${e2.path}:${e2.start}-${e2.end}`;
        b.addEventListener('click', () => showCode(k2, e2)); body.append(b);
      });
    }
    openModal(m.path);
  });
  $('mods').append(c);
});

/* ---------- 任务 ---------- */
(D.tasks || []).forEach(t => {
  const c = el('div', 'card task');
  c.append(el('div', 'lvl L' + (t.level||1), 'L' + (t.level||1)));
  const box = el('div');
  box.append(el('h4', null, t.title || ''));
  box.append(el('p', null, t.description || ''));
  const fl = el('div','files'); (t.files||[]).forEach(f => fl.append(el('code', null, f))); box.append(fl);
  if (t.acceptance) box.append(el('div','acc','✓ 完成标准：' + t.acceptance));
  (t.hints||[]).forEach(h => box.append(el('div','hint','💡 ' + h)));
  c.append(box); $('tasks').append(c);
});

/* ---------- 其它 ---------- */
$('foot').textContent = `RepoTour · 证据校验 ${ev.evidence_passed || 0}/${ev.evidence_total || 0} 通过 · 由 RepoTour 流水线自动生成`;
function openModal(title){ $('mTitle').textContent = title || ''; $('modal').classList.add('show'); }
$('mClose').addEventListener('click', () => $('modal').classList.remove('show'));
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('modal').classList.remove('show'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('modal').classList.remove('show'); });
$('btnExport').addEventListener('click', (e) => {
  e.preventDefault();
  const blob = new Blob(['<!doctype html>\n' + document.documentElement.outerHTML], {type:'text/html;charset=utf-8'});
  const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'repotour-preview.html'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});
$('btnPrint').addEventListener('click', () => window.print());

/* 顶部 tab 高亮 */
const secs = ['overview','graph','tour','modules','tasks'].map(id => $('' + id));
const links = Array.from(document.querySelectorAll('nav.tabs a[href^="#"]'));
const io = new IntersectionObserver(es => es.forEach(en => {
  if (!en.isIntersecting) return;
  links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id));
}), {rootMargin:'-45% 0px -50% 0px'});
secs.forEach(sec => sec && io.observe(sec));
</script>
</body>
</html>
'''
