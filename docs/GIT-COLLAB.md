# GitHub 协作指南（当前真实状态）

仓库：https://github.com/ccczzz12112/repotour （私有）
- `ccczzz12112`：owner / admin
- `Fpx0325`：collaborator / write（已接受邀请，已验证权限）

协作原则：A（后端）只改 `backend/`，B（前端）只改 `frontend/`；
接口变更先改 `docs/API.md` 再动代码，并在群里同步。

---

## 一、队友第一次上手（B 部分，约 10 分钟）

### 1. 装三个东西（已装可跳过）

- Git：https://git-scm.com/download/win （一路默认，选 Visual Studio Code 作为默认编辑器也行）
- Node.js 20+：https://nodejs.org/zh-cn （LTS 版）
- Python 3.11+：https://www.python.org/downloads/ （安装时勾选 **Add python.exe to PATH**）

装完在 PowerShell 里验证：

    git --version
    node -v
    npm -v
    python --version

### 2. 克隆仓库

    cd C:\Users\你的用户名\Documents
    git clone https://github.com/ccczzz12112/repotour.git
    cd repotour

第一次操作会弹浏览器登录 GitHub（Git Credential Manager），授权即可。

### 3. 起后端（只跑 mock，不需要任何 API Key）

    python -m venv .venv
    .venv\Scripts\python.exe -m pip install -r backend\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
    cd backend
    ..\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8765

看到 `Uvicorn running on http://127.0.0.1:8765` 即成功。
浏览器打开 http://127.0.0.1:8765/api/health 应返回 `{"ok":true,"llm_mode":"mock"}`。

> 为什么是 8765：本机 8000 端口被系统进程占用。你机器上 8000 空着也可以用 8000，
> 但前端代理默认指向 8765，见下一节。

### 4. 起前端

**新开一个 PowerShell 窗口**（后端窗口别关）：

    cd repotour\frontend
    npm install --registry=https://registry.npmmirror.com
    npm run dev

打开 http://localhost:5173 ，输入 `https://github.com/pallets/click` 点「生成导览」，
几秒后应进入导览页（若之前跑过会命中缓存，直接打开结果）。

后端端口不是 8765 时：

    $env:VITE_API_TARGET="http://127.0.0.1:8000"; npm run dev

### 5. 验证环境没问题

    # 前端类型检查 + 构建（必须通过再提交）
    npm run build

    # 后端冒烟测试（可选）
    cd ..\backend
    ..\.venv\Scripts\python.exe tests\smoke_test.py

---

## 二、每天写代码的流程（重要，别直接在 main 上改）

    # 1) 开工前同步最新代码
    git checkout main
    git pull --rebase

    # 2) 开自己的功能分支
    git checkout -b feat/tour-keyboard

    # 3) 写代码，小步提交
    git status
    git add frontend
    git commit -m "feat(frontend): 导览支持左右键切换站点"

    # 4) 推上去
    git push -u origin feat/tour-keyboard

    # 5) 去 GitHub 仓库页面点 "Compare & pull request" → 创建 PR
    #    A 看一眼 → Merge pull request → Delete branch

合并后回到本地：

    git checkout main
    git pull --rebase
    git branch -d feat/tour-keyboard

## 三、两个人同时改怎么不打架

1. 一个 PR 只做一件事，改动别超过 500 行。
2. 改同一文件前在群里说一声；`docs/API.md` 是共享文件，改完 @ 对方。
3. 提交前一定跑 `npm run build`（前端）或 `python tests/smoke_test.py`（后端）。
4. 冲突了不要慌：

    git pull --rebase
    # 打开冲突文件，搜索 <<<<<<< ，保留正确内容，删掉标记
    git add 冲突文件
    git rebase --continue

实在搞不定就 `git rebase --abort` 回到冲突前，再找人。

## 四、安全红线

- `.env` 里有 API Key，已被 `.gitignore` 排除，**永远不要** `git add -f .env`。
- Key 一旦提交过：立刻去服务商后台作废旧 Key（删提交没用，历史里还在）。
- `data/`（克隆的仓库 + SQLite）、`.venv/`、`node_modules/`、`dist/` 都不入库。

## 五、常用命令速查

    git status                     # 当前改了什么
    git diff                       # 未暂存的具体改动
    git log --oneline -10          # 最近 10 条提交
    git stash / git stash pop      # 临时收起 / 恢复改动
    git branch -a                  # 本地 + 远程分支
    git checkout -- 文件名          # 丢弃某个文件的未提交改动（慎用）

## 六、可选：保护 main 分支

GitHub 仓库 → Settings → Branches → Add branch protection rule →
Branch name pattern 填 `main` → 勾选 **Require a pull request before merging** →
Create。之后任何人都不能直接 push main，必须走 PR。
