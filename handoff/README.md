# 移交包 · 给 Qoder 的输入

这个目录是「把剩余开发搬进 Qoder」的全部输入材料。原型（Python + React）已验证流程与数据结构，
但不能部署到 Qoder Sites，站点版按本包规格重建。

| 文件 | 用途 | 谁看 |
|---|---|---|
| `SPEC.md` | 产品定义、数据契约、算法规格、页面规格、验收标准 | **Qoder 主要输入** |
| `PROMPTS.md` | P0–P5 六段可直接粘贴的提示词 | 你，复制粘贴用 |
| `seed/pallets-click.json` | 真实导览数据 + 91 个文件全文（1.0 MB） | 站点预烘焙数据 |
| `seed/psf-requests.json` | 真实导览数据 + 37 个文件全文（0.4 MB） | 站点预烘焙数据 |
| `seed/axios-axios.json` | 真实导览数据 + 283 个文件全文（1.4 MB） | 站点预烘焙数据 |
| `evidence/` | 放 Qoder 开发过程截图 | 作品帖素材 |

## 三份种子数据实测

| 仓库 | 导览站点 | 架构节点 / 边 | 模块卡片 | 上手任务 | 引用校验 |
|---|---|---|---|---|---|
| pallets/click | 10 | 18 / 17 | 32 | 3 | 40/40 ✅ |
| psf/requests | 10 | 6 / 3 | 22 | 3 | 32/32 ✅ |
| axios/axios | 10 | 7 / 6 | 98 | 3 | 108/108 ✅ |

**结构与行号真实有效，文案是规则生成的占位内容**，需按 `PROMPTS.md` 的 P3 用模型重写。

## 重新导出种子

原型后端跑完一个仓库后：

    .venv\Scripts\python.exe tools\export_seed.py <job_id>

会生成 `handoff/seed/<owner>-<repo>.json`，自包含、可离线渲染。

## 开始干活

打开 `PROMPTS.md`，从 P0 开始。**P0 的目标是今天就拿到公开链接**，别等做完功能再发布。
