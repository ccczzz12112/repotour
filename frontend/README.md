# Frontend（B 部分 · 队友负责）

React + Vite + TypeScript + Tailwind + React Flow + CodeMirror 6。

开工前必读：../docs/API.md（后端接口契约，后端已可用 mock 模式联调）。

三个页面：
1. 首页：URL 输入 + 示例仓库卡片 + 7 步流水线时间线（SSE）
2. 导览页：顶部架构图 | 左站点列表 | 中讲解卡片 | 右代码高亮（三栏联动）
3. 任务页：L1/L2/L3 分级任务卡

初始化建议：

    npm create vite@latest . -- --template react-ts
    npm install
    npm install reactflow @uiw/react-codemirror tailwindcss @tailwindcss/vite

后端本地启动后（http://localhost:8000），在 vite.config.ts 配置 /api 代理即可联调。
