# GitHub 建仓与多人协作指南（零基础版）

本机已完成：git init + 首次 commit + .gitignore（.env / data / .venv 永不入库）。
你只需要做下面第 1、2、4 步（约 5 分钟）。

## 第 1 步：在 GitHub 网页创建空仓库（2 分钟）

1. 打开 https://github.com 并登录（没有账号先 Sign up，用你的邮箱 2093567127@qq.com 即可）。
2. 右上角 "+" → "New repository"。
3. 填写：
   - Repository name: repotour
   - 可见性：建议 Private（比赛提交前再改 Public；Public 也行）
   - **不要勾选** "Add a README file"、.gitignore、license —— 本地已经有了，勾了会冲突。
4. 点 "Create repository"。记下页面显示的地址，形如：
   https://github.com/chenzeyu1111/repotour.git

## 第 2 步：把本地仓库推上去（1 分钟）

在本项目根目录（repotour 文件夹）打开 PowerShell，执行：

    git remote add origin https://github.com/你的用户名/repotour.git
    git branch -M main
    git push -u origin main

第一次 push 会弹出浏览器登录窗口（Git Credential Manager），
点 "Sign in with your browser"，授权后自动完成，以后不再询问。

## 第 3 步：确认推送成功

刷新 GitHub 仓库页面，能看到 backend/、docs/、README.md 即成功。

## 第 4 步：邀请队友（1 分钟）

仓库页面 → Settings → Collaborators → Add people →
输入队友的 GitHub 用户名或注册邮箱 → 发送邀请。
队友在邮箱或 https://github.com/notifications 里点 Accept 即可。

## 第 5 步：队友加入

队友在自己电脑上执行：

    git clone https://github.com/你的用户名/repotour.git
    cd repotour
    python -m venv .venv
    .venv\Scripts\python.exe -m pip install -r backend\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
    copy ..\.env.example ..\.env    # 按需配置，默认 mock 模式无需 Key

## 日常协作流程（每人都遵守，冲突少 90%）

    # 每天开工前：
    git pull --rebase

    # 开一个功能分支（不要直接在 main 上写代码）：
    git checkout -b feat/tour-ui

    # 写完一小块就提交（提交信息说清楚做了什么）：
    git add .
    git commit -m "feat: 导览页三栏联动"

    # 推到 GitHub：
    git push -u origin feat/tour-ui

    # 然后到 GitHub 网页点 "Compare & pull request" → 创建 PR →
    # 队友看一眼改动 → Merge pull request → 删除分支。

## 分工防冲突约定

- A 只改 backend/，B 只改 frontend/，docs/ 改之前在群里说一声。
- 接口变更必须同步更新 docs/API.md，并在群里 @ 对方。
- 小步提交：一个 PR 只做一件事，超过 500 行改动就拆。

## 安全红线

- .env（含 API Key）已被 .gitignore 排除，**永远不要** git add -f 强制加入。
- 如果 Key 不小心提交过：立刻去服务商后台作废旧 Key 换新的（删提交没用，历史里还在）。
- data/ 目录是运行产物（克隆的仓库、数据库），不入库。

## 可选进阶

- 保护 main：Settings → Branches → Add branch protection rule →
  勾 "Require a pull request before merging"，杜绝误推。
- GitHub 访问慢：可改用 gitee.com 建同名仓库（流程一样，git remote 换地址即可），
  或为 git 配置代理：git config --global http.proxy http://127.0.0.1:端口

## 常用命令速查

    git status                  # 看当前改了什么
    git log --oneline -10       # 看最近提交
    git diff                    # 看未暂存的具体改动
    git stash / git stash pop   # 临时收起改动 / 恢复
    git checkout main           # 切回主分支
