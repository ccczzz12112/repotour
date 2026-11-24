# RepoTour 站点版 · 产品与技术规格书

> 本文件是给 **Qoder** 看的实现规格。原型（Python + React，本地运行）已验证过流程与数据结构，
> 但**不能部署到 Qoder Sites**。站点版按本规格重建，部署到 Qoder Sites 并公开访问。
> 参考实现源码在 `backend/app/`，真实数据样例在 `handoff/seed/*.json`。

---

## 1. 产品定义

**一句话**：给刚接手陌生代码仓库的学生/新人，把「从哪读起」变成一条能点着走的导览路线。

**谁在什么场景用**：大学生做课程项目、参加开源项目、看论文配套代码、接手学长遗留项目时，
clone 下来面对几百个文件不知道从哪看起。RepoTour 输入仓库链接，产出一条 6–10 站的阅读路线。

**三个不可动摇的差异化设计**（评分与作品帖都围绕这三点讲）：

1. **输出路线，不是文档**：6–10 个**有序**导览站点，按新人第一天的认知路径排，不是平铺的 API 文档。
2. **每条结论都绑定可校验的代码证据**：任何讲解都附 `{path, start, end}`，
   程序逐条校验行号真实存在，页面显著展示「引用验证 40/40 通过」。点开引用直接看高亮源码。
3. **架构依赖边只来自静态 import 分析**，不是模型猜的。模型只负责讲解，不负责编造结构。

**明确不做**：不做代码补全、不做 IDE、不做通用文档站、不做多仓库对比。

---

## 2. 评委体验路径（必须 ≤5 步，且不看说明书）

1. 打开站点链接
2. 首页点任一示例仓库按钮（如 `pallets/click`）
3. 立刻看到导览路线，点第 1 站
4. 点讲解里的代码引用 → 右侧出现高亮源码
5. 切到「架构图 / 模块 / 上手任务」页签浏览

进阶：首页输入框粘贴任意 GitHub 仓库链接 → 在线生成。

**首屏要求**：3 秒内让人看懂这是什么。一句话标题 + 一个输入框 + 3 个示例按钮 + 一张示意图。
不要登录墙、不要注册、不要配置、不要说明书。

---

## 3. 数据契约

完整真实样例见 `handoff/seed/pallets-click.json`（另有两个仓库样例）。
种子文件结构：

    {
      "meta":   { "repo_url", "commit", "file_count", "note" },
      "result": { ...见下... },
      "files":  { "src/click/core.py": "文件全文", ... }
    }

`files` 收录了导览引用到的全部文件全文，**站点可完全离线渲染代码证据，不依赖网络**。

`result` 结构（站点渲染的唯一数据源）：

    {
      "job_id": "...",
      "overview": {
        "repo_url": "...", "commit": "...",
        "stats": { "total_files": 174, "languages": {"python": 91},
                   "source_files": 91, "edges": 167, "has_ci": true },
        "entries": ["src/click/decorators.py"],
        "tests": ["tests/test_basic.py"],
        "readme_excerpt": "..."
      },
      "graph": {
        "nodes": [{ "id": "click", "label": "核心包", "layer": "core", "type": "module",
                    "paths": ["src/click/core.py", "..."], "note": "..." }],
        "edges": [{ "source": "click", "target": "tests", "kind": "import",
                    "verified": true, "note": "..." }]
      },
      "tour": [
        { "order": 1, "title": "第0站 · 全景与入口", "narrative": "讲解正文",
          "why": "为什么第一站读这里",
          "files": [{ "path": "src/click/decorators.py", "start": 1, "end": 40, "symbol": "command" }],
          "quiz": "读完自问的一个问题" }
      ],
      "modules": [
        { "path": "src/click/core.py", "role": "core", "responsibility": "一句话职责",
          "key_symbols": ["Command", "Group"], "importance": 0.31,
          "evidence": [{ "path": "...", "start": 6, "end": 15 }] }
      ],
      "tasks": [
        { "level": 1, "title": "...", "description": "...", "files": ["..."],
          "acceptance": "验收标准", "hints": ["提示1", "提示2"] }
      ],
      "stats": { "evidence_total": 40, "evidence_passed": 40, "duration_s": 14.5 }
    }

**渲染约定**
- `graph.nodes[].layer` 决定架构图分层布局；`edges[].verified === true` 画实线，false 画虚线并标注「未验证」
- `tour[].files[]` 渲染成可点击引用胶囊，显示 `path:start-end`
- 点引用 → 从 `files[path]` 取全文，按 `start..end` 高亮，**行号必须是文件真实行号**
- `stats.evidence_passed / evidence_total` → 页头徽章「引用验证 40/40」，这是核心卖点，要显眼
- `tasks[].level` 1/2/3 → 三档难度卡片，支持本地打卡（localStorage）

**种子数据的已知问题**：现有 `narrative` / `responsibility` 文案是规则拼的占位内容
（直接截了 README 和 docstring），**必须由模型重写成人话**。结构与行号是真实有效的，保留。

---

## 4. 在线生成：算法规格（浏览器端 TypeScript 重写）

原型对应 `backend/app/scan.py`、`rank.py`、`evidence.py`。站点版把这三步搬到浏览器，
**零后端、零 clone**，天然适配 Qoder Sites。

### 4.1 取文件（fetch）

GitHub 公开仓库免 token 可读，两步：

1. 仓库元信息（1 次 API 调用）
   `GET https://api.github.com/repos/{owner}/{repo}` → `default_branch`
2. 全量文件树（1 次 API 调用）
   `GET https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1`
   → `tree[]`，每项 `{path, type:"blob"|"tree", size, sha}`
3. 文件内容**走 CDN，不走 API**（关键：避开 60 次/小时的未认证限流）
   `GET https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}`
   → 纯文本，`Access-Control-Allow-Origin: *`，无 API 限流
   备用源：`https://cdn.jsdelivr.net/gh/{owner}/{repo}@{branch}/{path}`

只拉需要的文件（见 4.3 排序后的 top-K，建议 K=60，上限 150），并发 6–8 个。
单文件 >200KB 跳过。整个分析只消耗 2 次 GitHub API 调用。

可选：设置里让用户粘贴自己的 GitHub PAT 存 localStorage，仅用于提高 API 限额；绝不上传。

### 4.2 静态扫描（scan）—— 确定性，零模型

跳过目录：`.git node_modules dist build .venv venv __pycache__ .next out target vendor`
跳过文件：`package-lock.json yarn.lock pnpm-lock.yaml poetry.lock Cargo.lock composer.lock`、含 `.min.`、二进制扩展名
语言判定：`.py→python`，`.js/.jsx/.mjs/.cjs→javascript`，`.ts/.tsx→typescript`，其余 `other`

**Python import 解析**：正则即可（原型用 ast，浏览器端用正则近似）
- `^\s*from\s+([\.\w]+)\s+import` 和 `^\s*import\s+([\.\w]+)`
- 模块名 → 文件路径映射：把 `a.b.c` 映射到 `a/b/c.py` 或 `a/b/c/__init__.py`
- 支持 src 布局（根前缀 `src/`）与包内相对导入（`from . import x`、`from ..y import z`）
- 只保留**两端都在文件集合内**的边（外部依赖丢弃）

**JS/TS import 解析**（四条正则，原型已验证）：

    /(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]/
    /import\s*['"]([^'"]+)['"]/
    /require\(\s*['"]([^'"]+)['"]\s*\)/
    /import\(\s*['"]([^'"]+)['"]\s*\)/

相对路径 `./x` `../y` 按当前文件目录解析，依次尝试
`x.ts x.tsx x.js x.jsx x.mjs x/index.ts x/index.js`；解析不到就丢弃。

**符号表**：Python 抓 `^(class|def)\s+(\w+)`；JS 抓
`/(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|class)\s+([\w$]+)/` 与 `/export\s+(?:const|let|var)\s+([\w$]+)/`

**入口判定**：文件名属于 `main.py app.py manage.py cli.py __main__.py run.py server.py`；
或 `package.json` 的 `main`/`bin`/`module` 字段指向的文件；或 `src/index.*`。

**测试判定**：路径含 `tests/ test/ __tests__/`，或文件名 `test_*` / `*_test.py` / 含 `.test.` / `.spec.`。

去重自环边，输出 `{files, edges, entries, tests, readme, symbols, stats}`。

### 4.3 关键文件排序（rank）—— 控制模型成本

原型 `rank.py` 的算法，照搬：

1. 候选 = python/js/ts 文件减去测试文件（为空则退回全部）
2. PageRank-lite，12 轮迭代，阻尼 0.85：
   `score[p] = 0.15/n + 0.85 * Σ(score[q] / outdeg[q])`，q 为导入 p 的文件
3. 入口文件 `score *= 3.0`
4. 规模因子 `score *= 1 + min(log10(max(size,1))/10, 0.5)`
5. 降序取 top-K（默认 60，上限 150）
6. 每个文件保留 `reasons`：「入口文件」「被 N 个文件导入」——**UI 要展示，这是可解释性卖点**

### 4.4 生成讲解（map / reduce / tour / tasks）—— 交给模型

四步，全部走 Qoder 侧模型能力（Cloud Agents 或站点后端函数），**不要在前端暴露任何 API Key**：

- **map**：逐文件产出模块卡片 `{path, role, responsibility, key_symbols, importance, evidence[]}`。
  role ∈ `entry|core|util|model|api|config|test|doc`。可并发。
- **reduce**：把模块卡片聚成 5–12 个架构节点 + 边。
  **边只允许来自 4.2 的真实 import 边**，模型只能给节点起名、分层、写 note，不许新增边。
- **tour**：产出 6–10 个有序站点。第 0 站固定为「全景与入口」，之后沿真实调用链推进，
  每站 `{order,title,narrative,why,files[],quiz}`。`narrative` 要写人话，说清「这个文件在整条链路里干什么」。
- **tasks**：3 个分级上手任务（改文案 / 加小功能 / 补测试），每个带 `acceptance` 和 `hints`。

### 4.5 证据校验（evidence）—— 卖点，必须实现

对 `tour[].files[]`、`modules[].evidence[]` 里的每一条 `{path,start,end}`：

- `path` 必须存在于已取到的文件集合
- `1 <= start <= end <= 该文件总行数`
- 任一条不满足 → 标记 failed，**从 UI 移除该引用**，并计入 `stats`

页头展示 `evidence_passed / evidence_total`。原型实测 click 40/40、requests 32/32、axios 108/108 全通过。

---

## 5. 页面与交互规格

| 页面 | 内容 | 关键交互 |
|---|---|---|
| 首页 | 一句话定位、URL 输入框、3 个示例按钮、示意图、最近生成记录 | 点示例立刻进导览；输入 URL 走在线生成并显示 7 步进度 |
| 导览页 | 左栏站点列表（1..N）、中栏讲解卡片、右栏代码面板 | 上一站/下一站按钮 + ← → 键盘；点引用右栏高亮；进度指示 |
| 架构图 | 分层有向图，节点=模块，边=真实 import | 悬停高亮邻边；点节点看包含文件与 note；verified 实线 / 未验证虚线 |
| 模块 | 按 importance 排序的卡片列表，显示 role 徽章与 reasons | 点卡片跳代码；按 role 筛选 |
| 上手任务 | 三档难度卡片 | 展开提示；localStorage 打卡；显示验收标准 |

**全局**：深色主题（原型用紫青色系，可重新设计）、移动端可用、
加载/空/错误三态都要有明确文案、页头常驻「引用验证 N/N」徽章。

---

## 6. 验收标准

- [ ] 无痕窗口打开 Sites 公开链接，未登录可用
- [ ] 点示例仓库 **2 秒内**出完整导览（走预烘焙种子）
- [ ] 10 个站点都能点，代码引用行号与 GitHub 上真实文件一致
- [ ] 架构图的边能在源文件里找到对应 import
- [ ] 输入一个未预烘焙的公开仓库，能在线生成成功
- [ ] 断网时预烘焙部分仍可完整浏览
- [ ] 手机宽度下不横向滚动、按钮可点
- [ ] 找个没参与项目的同学，不给任何说明，能独立完成第 2 节的 5 步
