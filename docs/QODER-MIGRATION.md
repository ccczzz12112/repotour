# 搬迁到 Qoder · 执行总纲

> **Sites 公开链接**：<https://repotour-kqnwk5p977n.qoder.zone>（2026-11-24 已发布，访问范围=任何人都可访问；匿名 HTTP 200 + 全部静态资源 200 已验证，证据见 handoff/evidence/P0-05~08）
> **截止**：2026-11-30 18:00 ｜ **赛道**：StudyHack 学习科研
> 官方细则与缺口审计见 [SUBMISSION-CHECKLIST.md](SUBMISSION-CHECKLIST.md)

---

## 0. 为什么必须搬

官方三条硬要求：① 用 Qoder 开发并留过程证据 ② 部署到 Qoder Sites 公网可访问 ③ 天池论坛发作品帖。
我们的原型是本地 Python + React，**三条都不满足**。且官方明说「技术复杂度不计分」，
所以搬迁不是重写一遍后端，而是**换成点开就能用的站点**。

## 1. 现状盘点

| 资产 | 状态 | 搬迁处理 |
|---|---|---|
| 7 步流水线（Python） | ✅ 已验证 | **算法逻辑**作为规格交给 Qoder 用 TS 重写；Python 服务本身不上线 |
| `scan.py` 静态 import 分析 | ✅ 已验证 | → 浏览器 TS（SPEC 4.2） |
| `rank.py` PageRank-lite | ✅ 已验证 | → 浏览器 TS（SPEC 4.3） |
| `evidence.py` 行号校验 | ✅ 已验证 | → 浏览器 TS（SPEC 4.5），**核心卖点保留** |
| React 四页签 UI | ✅ 能跑 | 交互规格写进 SPEC 第 5 节，由 Qoder 在 Sites 里重建 |
| `preview.py` 静态导出 | ✅ 能跑 | 思路升级为「预烘焙种子」，见 `handoff/seed/` |
| 三份真实导览数据 | ✅ 已导出 | 直接作为站点数据，文案待模型重写 |
| FastAPI / SQLite / SSE / 断点续跑 | ✅ 能跑 | **不上线**，Sites 跑不了 Python，且不计分 |
| `/api/jobs/{id}/ask` 问答 | ❌ 未做 | **砍掉** |
| LLM live 模式 | ❌ 未接 | 改走 Qoder Cloud Agents，**不再需要自购 API Key** |

## 2. 环境状态（已核查）

- Qoder CN 桌面端 **v0.5.14 已安装**：`C:\Users\才\AppData\Local\Programs\Qoder CN\Qoder CN.exe`
- **已登录**：账号 `nick1879703847`，UID `01a1ed6b-5498-7a8d-af26-216ef4b68ed1`（2026-11-24 09:29 核实）
- 未装 Qoder CLI；桌面端自带「站点」功能，新手直接用桌面端即可
- ⚠️ **Sites 个人 Free 版只支持静态网页，无数据库/存储**。必须先用学生券换到 **Pro**，
  否则 P4 在线生成做不了。领券下单步骤见 SUBMISSION-CHECKLIST 第 4 节。

## 3. 目标架构

```
浏览器（Qoder Sites 静态站点）
├─ 预烘焙轨道：handoff/seed/*.json 随站点发布 → 点开即用、断网可用   ← 保底，先做
└─ 在线轨道：GitHub API 取树 + raw.githubusercontent 取文件
             → 浏览器 TS 做 scan / rank / evidence
             → 模型讲解走 Qoder Cloud Agents / 站点后端能力
```

关键点：**文件内容走 `raw.githubusercontent.com`（支持跨域、不占 API 限额）**，
整个分析只消耗 2 次 GitHub API 调用，绕开未认证 60 次/小时的限流。

## 4. 六天倒排

| 日期 | 阶段 | 产出 | 负责 |
|---|---|---|---|
| **11-24 今天** | 登录 Qoder + 确认 Pro + **P0** | **拿到公开链接**（空壳也行） | 你 |
| 11-25 | P1 + P2 | 三个示例点开即用，四页签齐全 | 你（Qoder 里做） |
| 11-26 | P3 | 讲解文案全部重写成人话 | 你 + 队友审校 |
| 11-27 | P4 | 在线生成跑通 | 你 |
| 11-28 | P5 + 盲测 | 移动端 + 三态 + 找 3 人盲测 | **队友主导** |
| 11-29 | 作品帖 | 五部分 + 截图 + UID，发布留审核时间 | 队友起草，你终审 |
| 11-30 上午 | 终检 | 无痕可访问 + 帖子已显示 + 社交分享 | 两人 |

队友的逐日清单见 [TEAMMATE-TASKS.md](TEAMMATE-TASKS.md)。

## 5. 铁律

1. **每一步都截图**，存 `handoff/evidence/`。评分单列「Qoder 使用深度」，事后补不出来。
2. **先发布再完善**。P0 拿到链接就记到本文件顶部，之后每轮改完都重新发布。
3. **不许破坏三个卖点**：路线有序、证据行号可校验、架构边只来自真实 import。
   模型只能讲解，不能编结构。
4. **密钥不进前端、不进 Git**。模型能力走 Qoder 自带，不需要自己的 Key。
5. **GitHub 仓库继续维护**，站点代码也同步进来，决赛要交源码。
6. 11-30 当天**亲自用无痕窗口点开链接**确认：Sites 限免期有用量额度，
   用量高的站点可能被暂停公开访问。

## 6. 现在就做的三件事

1. 打开 Qoder CN，用**已下单 Pro 的阿里云账号**登录（没下单先去领券，见 CHECKLIST 第 4 节）
2. 「打开文件夹」选 `C:\Users\才\Documents\Codex\2026-11-21\w-ya\outputs\repotour`
3. 打开 `handoff/PROMPTS.md`，复制 **P0** 粘进「站点」新任务，发送
