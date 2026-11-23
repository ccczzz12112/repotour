# Frontend（B 部分）

React 18 + Vite 5 + TypeScript + React Flow 11 + CodeMirror 6 + Tailwind 4。
后端接口契约见 `../docs/API.md`，后端默认在 `http://127.0.0.1:8765`（mock 模式即可联调）。

## 现在能跑什么

- 首页：仓库 URL 输入、示例仓库、7 步流水线（SSE 实时进度）、最近任务列表
- 结果页 4 个页签：
  - **导览路线**：左站点列表 / 中讲解卡片（why + 自检）/ 右 CodeMirror 源码，行号是真实文件行号
  - **架构图**：React Flow 按 layer 分列布局，实线=已验证 import，虚线=未逐条验证
  - **模块卡片**：职责、关键符号、重要性条，点证据在右侧抽屉看源码
  - **上手任务**：L1/L2/L3 卡片，点涉及文件直接看代码
- 顶部徽章显示 `引用验证通过率`（卖点），右上角显示 LLM 模式

## 本地启动

    # 0) 先确认后端在跑（另开一个终端）
    cd ..\backend
    ..\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8765

    # 1) 装依赖（已装过可跳过）
    npm install --registry=https://registry.npmmirror.com

    # 2) 开发模式
    npm run dev        # http://localhost:5173

    # 3) 类型检查 + 生产构建
    npm run build

后端端口不是 8765 时，二选一：

    # 方式 A：环境变量（PowerShell）
    $env:VITE_API_TARGET="http://127.0.0.1:8000"; npm run dev

    # 方式 B：复制 .env.example 为 .env，改 VITE_API_TARGET

## 目录

    src/
    ├── api.ts                 # 所有 fetch / SSE 封装（唯一改接口的地方）
    ├── types.ts               # 与 docs/API.md 对齐的 TS 类型
    ├── styles.css             # 深色紫青设计系统（语义 class，可继续加 Tailwind）
    ├── lib/graph.ts           # 按 layer 分列布局 + 边样式
    ├── components/
    │   ├── Pipeline.tsx       # 7 步进度
    │   ├── GraphView.tsx      # 架构图
    │   ├── TourView.tsx       # 三栏导览
    │   ├── CodePanel.tsx      # 代码证据面板（真实行号）
    │   ├── ModulesView.tsx    # 模块卡片 + 证据抽屉
    │   └── TasksView.tsx      # 分级任务 + 证据抽屉
    └── pages/
        ├── HomePage.tsx
        └── JobPage.tsx

## 建议下一步（优先级从高到低）

1. 手机/窄屏适配走查（当前 1100px 以下会单列，760px 以下移动端未细调）
2. 导览站点「上一站/下一站」按钮 + 键盘左右键切换
3. 架构图节点点击后高亮其邻居边（现在只显示说明卡片）
4. 任务页加「完成打卡」本地状态（localStorage），答辩演示更像产品
5. 首屏加一张示例截图/动图，未跑任务时也有视觉锚点
6. 结果页支持复制分享链接、导出 PDF（后端 preview 页已有打印样式）

## 约定

- 只改 `frontend/`，不要动 `backend/`；接口要改先改 `docs/API.md` 并同步给 A。
- 不要在 `main` 上直接开发：`git checkout -b feat/xxx` → commit → push → PR。
- `node_modules/`、`dist/` 已在 .gitignore 中。
