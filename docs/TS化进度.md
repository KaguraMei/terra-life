# TS 化进度

判断标准不是"多少文件叫 `.ts`"，而是**哪些责任已经有类型契约**。`.js` 改 `.ts` 本身不构成进度。

## 按层看

| 层 | 位置 | 状态 |
| --- | --- | --- |
| 随机内核 | `src/kernel/random.ts` | ✅ 类型化，快照可恢复 |
| 事件调度 | `src/kernel/events.ts` | ✅ 类型化，含事务回滚 |
| 状态不变量与转换 | `src/model/state-invariants.ts`、`transitions.ts` | ✅ 类型化 |
| 效果契约 | `src/model/effects.ts` | ✅ 类型化 |
| 存档协议 | `src/model/save-envelope.ts` | ✅ 类型化 |
| 视图 | `src/model/life-view.ts`、`session-view.ts` | ✅ 类型化 |
| 采样与文本 | `src/model/sampling.ts`、`cohort.ts`、`text.ts` | ✅ 类型化（原 `js/engine/rng.js`、`cohort.js`、`text.js`） |
| 年度算术 | `src/model/yearly.ts`、`income.ts`、`regression.ts`、`focus.ts` | ✅ 类型化：学识/技艺曲线、心境基线、年度收支、工资与收入分位、四维回归目标与速率、重心份额与效果拆分 |
| 入学阶梯 | `src/model/schooling.ts` | ✅ 类型化：五级门槛（6/12/15/18/22）、抽签概率、学制与学历台阶；`startSchool` 的写入与文案仍在 legacy |
| 生育 | `src/model/birth.ts` | ✅ 类型化：TFR 反推、目标家庭规模、母亲年龄窗口、母婴传播常量；孩子构造与日志仍在 legacy |
| 地区与语言 | `src/content/locales.ts`、`src/model/locale.ts` | ✅ 类型化（原 `js/engine/region.js`；DOM/存储已交回 `js/main.js`） |
| 生命表与死因 | `src/model/life-table.ts`、`mortality.ts`、`death-risk.ts`、`src/content/causes.ts` | ✅ 类型化（原 `js/engine/lifetable.js` 已删；`death-risk` 以 `MortalitySubject` 为状态契约） |
| 矿石病 | `src/model/oripathy.ts`、`src/content/oripathy.ts` | 🟡 分期、终生与年度风险、污名、倾向、战力、治疗可及性、年度成长倍率/治疗费已类型化（`oripathy.js` 322→110 行，只剩 `infect` 与 `oriYear` 的写入部分） |
| 生命早期与节奏 | `src/model/lifecycle.ts`、`nativity.ts`、`narrative.ts`、`family.ts` | 🟡 出身/技艺抽取、节奏、阶段、净资产、初始四维、父母年龄、日志与四维变化、家人职业与兄弟姐妹已类型化（`state.js` 504→266 行）；`newLife` 的组装仍在 legacy |
| 组织 | `src/model/organization.ts`、`admission.ts`、`employment.ts`、`membership.ts` | 🟡 状态窗口、薪资、准入、退休金/冷却条款、离职原因与三条守卫均已类型化（`organization.js` 371→280 行）；转换的**写入**仍在 legacy |
| 抉择 | `src/model/decision.ts` | 🟡 自动模式打分与 once/冷却门已类型化（`decision.js` 203→162 行）；开/选/排程仍是流程 |
| 面试 | `src/model/interview.ts`、`interview-deck.ts` | 🟡 评分规则、抽题与洗牌已类型化（`interview.js` 248→222 行）；题库校验与流程桥接仍在 legacy |
| 内容校验 | `src/content/registry-validation.ts`、`pack-lock.ts`、`pack-loader.ts` | ✅ 类型化 |
| 存储端口 | `src/platform/storage.ts` | ✅ 类型化 |
| 装配与适配 | `src/legacy/*.ts`、`create-runtime.js` | 🟡 部分：适配层与清单是 TS，装配本体仍是 JS |
| 内容数据 | `js/data/*.js`（13 个文件，约 7.1k 行） | ⬜ 保持 JS：声明式数据，由类型化校验器在启动时检查 |
| 模拟引擎 | `js/engine/*.js`（6 个文件，约 1.4k 行） | 🟡 规则都已迁，剩下的是流程编排与状态组装（`year` 的结算编排、`state` 的 `newLife` 组装、`decision` 的流程、`organization` 的写入、`oripathy` 的 `infect`） |
| UI | `js/ui/*.js`、`js/main.js`（约 2.2k 行） | ⬜ 仍 JS，但**只读派生视图**（见下） |

数字：`src/` 46 个 TS 文件、约 8.3k 行；`js/` 19 个 legacy 文件（data + engine）、约 8.2k 行。

## 三个已完成的"结构"进度

1. **视图契约**：`LifeView` + `SessionView` 覆盖全部人物与会话事实，`js/ui/render.js`（177→16）、
   `js/ui/landing.js`（33→3）、`js/main.js`（52→17）的直读都只剩播放节奏、屏幕状态与写入。
2. **内容边界**：`pack-lock` 给题包内容身份，`registry-validation` 校验 8 类注册表 + 7 个命题域。
3. **引擎迁移**：`rng.js`（89 行）→ `src/model/sampling.ts`（clamp/lerp/正态分布/加权抽样，随机源注入）；`cohort.js`（85 行）→ `src/model/cohort.ts`（端口注入随机源、命名与种族池，
   抽样顺序不变）；`text.js`（124 行）→ `src/model/text.ts`（模板标签、数字格式、文案表，全部纯函数）；
   `year.js` 的学识/技艺曲线、心境基线与年度收支 → `src/model/yearly.ts`（上限与边际递减、6% 记债与 40% 还债顺序）。
   这些都由 42 局兼容样本与四套渲染快照证明等价。

## 为什么内容数据不急着 TS 化

`js/data/*.js` 是 7k 行声明式对象。把它们改成 TS 只能拿到"写数据时有补全"，真正的保障来自
`registry-validation` 的运行时校验（ID 唯一、引用存在、窗口有效、概率范围、薪酬晋升字段完整、
来源可分离）。**先把校验做扎实，再决定是否用类型生成约束**，否则会得到 7k 行需要同步维护的类型。

## 迁移一个 legacy 模块的固定动作

以 `rng`、`text`、`region`、`cohort`、`lifetable` 为例，这套动作可以复用到其余 6 个引擎文件：

1. 在 `src/` 写纯实现，外部依赖（随机、内容查表）走**端口**，不 import legacy。
2. 在 `src/legacy/create-runtime.js` 用一个具名 installer 把 `TL.*` 接口接上，清单条目保持
   `{ id, requires: [...], install: <name> }` 形状（边界工具依赖它）。
3. 删掉旧 `.js`，同时删它的 `?legacy` import —— `runtime-files.mjs` 与边界工具的文件计数会自动少一个。
4. 更新钉住计数的断言（`compatibility.test.mjs` 的初始器数量、边界工具的 typed 清单）。
5. 用**既有证据**验证等价：42 局兼容样本（含被迁移模块写进状态的部分）、模型回归分布、渲染快照。

第 5 条是这套动作成立的关键：没有可复现证据的迁移，只是把代码搬了个家。
