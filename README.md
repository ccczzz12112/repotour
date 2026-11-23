# RepoTour · 码途 —— 仓库导游

> 2026 Qoder 高校创造力大赛参赛作品。丢进任意 GitHub 仓库链接，AI 生成一条可交互的
> "新人导览路线"：架构总览 → 模块讲解 → 沿真实调用链读源码 → 分级上手任务。

## 三个灵魂设计

> 附加能力：`GET /api/jobs/{id}/preview` 把导览结果一键渲染成可离线分享的静态 HTML
> （架构图可交互、代码证据可弹窗查看），答辩演示和评委体验都能直接用。


1. **路线，不是文档**：输出 6-10 个有序导览站点，按新人第一天的认知路径排序。
2. **每句话都有证据**：LLM 结论必须绑定真实文件+行号，程序化校验，前端可点击跳源码。
3. **静态分析搭骨架，LLM 长血肉**：依赖图的边来自真实 import 解析，LLM 无权编造。

## 目录结构

    repotour/
    ├── backend/            # A 部分：流水线（本目录已完成 MVP）
    │   ├── app/
    │   │   ├── config.py   # 环境配置（.env）
    │   │   ├── db.py       # SQLite：jobs + LLM 缓存
    │   │   ├── events.py   # 事件流（SSE 支撑）
    │   │   ├── evidence.py # 证据校验器（灵魂组件）
    │   │   ├── fetch.py    # 步骤1：浅克隆/规模上限
    │   │   ├── scan.py     # 步骤2：静态分析 + import 依赖图
    │   │   ├── rank.py     # 步骤3：中心度排序选 top-K
    │   │   ├── llm.py      # LLM 客户端：缓存/重试/mock/降级
    │   │   ├── steps/      # 步骤4-7：Map/Reduce/Tour/Tasks
    │   │   ├── runner.py   # 编排器：断点续跑 + 产物落盘
    │   │   └── main.py     # FastAPI + SSE
    │   └── tests/smoke_test.py
    ├── frontend/           # B 部分：React 导览 UI（队友负责，见 docs/API.md）
    └── docs/               # 设计方案 / API 契约 / Git 协作指南

## 快速开始（后端）

    # 1. 仓库根目录创建虚拟环境并装依赖（已做过可跳过）
    python -m venv .venv
    .venv\Scripts\python.exe -m pip install -r backend\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

    # 2. 配置（可选：不配置就是 mock 模式，离线可跑全流程）
    copy .env.example .env      # 填入 LLM_API_KEY 后把 LLM_MODE 改为 live

    # 3. 跑冒烟测试（不需要 API Key）
    cd backend
    ..\.venv\Scripts\python.exe tests\smoke_test.py

    # 4. 启动 API 服务
    ..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
    # 打开 http://localhost:8000/docs 可视化调试所有接口

## mock / live 两种模式

- **mock**（默认）：不需要任何 API Key，用确定性构造器替代 LLM，全流水线离线跑通。
  前端队友用它联调，不花钱、不依赖网络。
- **live**：在 .env 填 LLM_API_KEY（任意 OpenAI 兼容接口），LLM_MODE=live。
  Map 用便宜模型，Reduce/Tour/Tasks 用强模型；失败自动降级，绝不中途崩溃。

## 团队分工

- **A（后端/流水线）**：Fetch/Scan/Rank + 证据校验器 + LLM 四遍调用 + SQLite 缓存 —— 本目录 backend/
- **B（前端/导览 UI）**：React + React Flow 三栏联动导览页 —— frontend/，按 docs/API.md 对接

## 文档

- docs/design.md —— 完整设计方案（参赛文档底稿）
- docs/API.md —— 前后端接口契约（B 必读）
- docs/GIT-COLLAB.md —— GitHub 建仓与多人协作指南
