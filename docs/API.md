# RepoTour API 契约（前端对接文档）

Base URL: http://127.0.0.1:8765 （本机 8000 被占用；换端口只需改启动参数和前端代理）。所有响应均为 JSON（SSE 除外）。CORS 已全开。

## 接口总览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/health | 健康检查，返回 llm_mode |
| POST | /api/jobs | 提交分析任务，body: {"repo_url": "..."} |
| GET | /api/jobs | 历史任务列表 |
| GET | /api/jobs/{id} | 任务状态（pending/running/done/failed + 当前 step） |
| GET | /api/jobs/{id}/events | SSE 进度流（7 步实时状态） |
| GET | /api/jobs/{id}/result | 完整结果（未完成时 409） |
| GET | /api/jobs/{id}/file?path=&start=&end= | 代码片段（证据跳转用） |

repo_url 支持 https://github.com/owner/repo 、gitee 链接、本地目录路径（开发用）。
同一 repo_url 已完成过会直接复用（返回 reused: true），演示预烘焙仓库靠这个。

## SSE 事件格式

每条以 "data: " 开头，JSON 结构：

    {"type": "start",  "message": "开始分析 ...", "ts": 1732...}
    {"type": "step",   "step": "scan", "status": "running|done", "message": "静态扫描 + 依赖图", "ts": ...}
    {"type": "log",    "step": "map", "message": "模块卡片 30/150", "ts": ...}
    {"type": "done",   "message": "分析完成", "stats": {...}, "ts": ...}
    {"type": "error",  "message": "失败原因", "detail": "traceback尾部", "ts": ...}

step 取值顺序: fetch → scan → rank → map → reduce → tour → tasks。
断线重连会从头回放全部事件，前端按 type+step 幂等更新即可。收到 done/error 后连接结束。

前端建议用原生 EventSource：

    const es = new EventSource("/api/jobs/" + jobId + "/events");
    es.onmessage = (e) => {
      const evt = JSON.parse(e.data);
      // 更新流水线时间线 UI；evt.type === "done" 时 es.close() 并拉取 result
    };

## result 结构（导览页的数据源）

    {
      "job_id": "...",
      "overview": {
        "repo_url": "...", "commit": "...", "file_count": 123,
        "stats": {"total_files": 123, "languages": {"python": 40}, "source_files": 40, "edges": 57, "has_ci": true},
        "entries": ["minishop/cli.py"], "tests": ["tests/test_core.py"],
        "readme_excerpt": "..."
      },
      "graph": {
        "nodes": [{"id": "minishop", "label": "核心包", "layer": "core", "type": "module",
                   "paths": ["minishop/core.py", "..."], "note": "..."}],
        "edges": [{"source": "minishop", "target": "tests", "kind": "import", "verified": true, "note": "..."}]
      },
      "tour": [
        {"order": 1, "title": "第0站 · 全景与入口", "narrative": "...", "why": "...",
         "files": [{"path": "minishop/cli.py", "start": 1, "end": 15, "symbol": "main"}],
         "quiz": "..."}
      ],
      "tasks": [
        {"level": 1, "title": "...", "description": "...", "files": ["..."],
         "acceptance": "...", "hints": ["..."]}
      ],
      "modules": [
        {"path": "minishop/core.py", "role": "core", "responsibility": "...",
         "key_symbols": ["Shop"], "importance": 0.31, "evidence": [{"path": "...", "start": 6, "end": 15}]}
      ],
      "stats": {"llm_calls": 0, "cache_hits": 0, "fallbacks": 0,
                "evidence_total": 49, "evidence_passed": 47, "duration_s": 3.2}
    }

UI 对应关系：
- graph → React Flow 架构图（layer 决定分层布局，verified=true 的边画实线）
- tour → 左栏站点列表 + 中栏讲解卡片；files 里的 evidence 渲染成可点击引用
- 点击 evidence → GET /file?path=&start=&end= → 右栏 CodeMirror 高亮
- stats.evidence_passed/evidence_total → 结果页"引用验证通过率"徽章（卖点！）
- tasks → 任务页分级卡片

## preview 接口（导览结果可视化页）

    GET /api/jobs/{job_id}/preview   -> text/html

- 自包含单文件 HTML：架构图（悬停高亮/点击详情）、站点导览、证据代码弹窗、模块卡片、分级任务
- 可直接用于答辩演示，页面内支持「导出 HTML」离线分享
- 409 表示任务尚未完成

## file 接口响应

    {"path": "minishop/cli.py", "start": 1, "end": 15, "total_lines": 17,
     "lines": [{"n": 1, "text": "..."}, ...]}

## Vite 代理建议（frontend/vite.config.ts）

    export default defineConfig({
      server: {
        proxy: { "/api": "http://127.0.0.1:8765" }
      }
    })

## 错误码

- 400 参数非法（空 URL / 路径穿越）
- 404 job 或文件不存在
- 409 结果未就绪（轮询状态或监听 SSE 后再取）

