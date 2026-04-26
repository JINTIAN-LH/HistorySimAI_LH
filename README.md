<h1><strong>AI 历史模拟器</strong></h1>

<div align="center">
  <img src="https://img.shields.io/badge/powered%20by-Funloom%20AI-4285F4.svg" alt="Powered by Funloom AI">
  <img src="https://img.shields.io/badge/type-AI%E6%96%87%E6%B8%B8%E5%88%9B%E4%BD%9C-FF6B6B.svg" alt="AI文游创作">
  <img src="https://img.shields.io/badge/state-开发中-4CAF50.svg" alt="开发中">
  <img src="https://img.shields.io/badge/tests-169%20passed-brightgreen.svg" alt="Tests">
</div>

本项目由 **Funloom AI** 强力支持，基于 Funloom 推出的 AI 文游创作工具开发实现，让历史模拟类文字游戏的创作与体验更具沉浸感和趣味性。

🔗 **Funloom AI 官方地址**：https://www.funloom.ai/

🔗 **在线预览游戏**：https://funloom.kurangames.com/funloom/game/18ec512c15fbf16074536a423aaaaedb

---

## 📖 项目介绍

一款由 AI 驱动的历史模拟器，打破传统文字游戏的剧情与交互壁垒，实现不同历史背景下的沉浸式模拟体验。

- 轻量化项目结构，前后端代码统一管理
- 通过 npm workspaces 管理前后端依赖
- 轻量配置即可快速启动历史模拟场景

---

## 💡 核心设计思路

本项目的核心设计围绕**沉浸感**与**交互性**打造，让历史模拟不再是单一的剧情推进：

### 主线剧情 ↔ 角色聊天 双向连通

主线剧情的发展会影响角色的对话走向与态度，角色聊天中的选择和互动也会反向推动主线剧情分支变化，二者相互影响、动态联动。

### 数值系统可视化国家进程

搭配完善的数值体系（如经济、军事、民生、文化等），实时显示模拟过程中的国家/势力发展进程，让历史走向有数据可依。

### AI 赋能创作与体验

基于 Funloom AI 文游创作工具的能力，降低游戏开发门槛，同时让 AI 为模拟过程提供动态的剧情、对话与事件生成，让每一次模拟都有不同体验。

---

## 🛠️ 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | Vite + React 19 + 原生 JavaScript ES6+ | React 负责启动边界与新入口，核心玩法仍由原生模块驱动 |
| **后端** | Node.js + Express | LLM API 代理服务 |
| **LLM** |  | 可配置其他 OpenAI 兼容 API |
| **数据** | 静态 JSON | 无数据库，轻量部署 |
| **存储** | localStorage | 存档持久化 |
| **构建** | Vite | 现代化构建工具 |
| **测试** | Vitest + Supertest + 无头体验脚本 | 单元测试、接口测试与流程回归统一覆盖 |

---

## 📂 项目结构

```
HistorySimAI/
├── client/                    # Vite/React 启动层与新入口壳
│   ├── index.html             # 前端开发入口
│   └── src/
│       ├── main.js            # React 挂载入口
│       ├── App.jsx            # 前端根组件
│       ├── architecture/      # 启动阶段的架构选择与兼容桥接
│       ├── bootstrap/         # 运行时初始化边界
│       └── ui/                # 新入口 UI 组件
├── js/                        # 游戏主运行时，当前核心逻辑集中在这里
│   ├── main.js                # 游戏启动流程
│   ├── router.js              # 页面/模块切换
│   ├── state.js               # 全局状态容器
│   ├── storage.js             # 本地存档读写
│   ├── dataLoader.js          # 静态数据加载
│   ├── api/                   # AI/后端请求封装与请求校验
│   ├── modules/               # 朝堂、诏书、国势等页面级模块
│   ├── rigid/                 # 困难模式刚性历史链路与规则引擎
│   ├── systems/               # 回合、军事、科举、国势、剧情等核心系统
│   ├── ui/                    # DOM 视图、面板与通用视图基元
│   ├── utils/                 # 效果处理、展示指标等通用工具
│   └── testing/               # 前端侧集成/体验测试辅助
├── css/                       # 全局主题、布局与模块样式
│   ├── components/            # 通用组件样式
│   └── modules/               # 各玩法模块样式
├── public/                    # 静态资源与可直接访问的数据
│   ├── assets/                # 图片等资源
│   └── data/                  # 角色、配置、剧情等静态数据
├── server/                    # Node.js/Express API 代理服务
│   ├── index.js               # 服务入口
│   ├── config.json            # 本地服务配置
│   ├── config.example.json    # 配置模板
│   └── schemaValidator.js     # 服务端配置校验
├── scripts/                   # 自动化脚本与体验验证入口
│   ├── start-dev.mjs          # 同时启动前后端
│   ├── headless-playtest.mjs  # 无头试玩
│   ├── verify-player-experience.mjs # 多轮体验回归
│   └── fleet-runner.mjs       # Fleet 工作流执行器
├── ChongzhenSim/              # 崇祯题材玩法与策划设计文档
├── .fleet/                    # 多代理工作流配置与报告
├── .github/                   # CI / GitHub Actions 配置
├── index.html                 # 兼容旧入口
├── package.json               # 根工作区与脚本配置
├── vite.config.js             # Vite 构建配置
├── vitest.config.js           # Vitest 测试配置
├── CHANGELOG.md               # 版本变更记录
├── commit.md                  # 提交说明记录
└── README.md                  # 项目说明
```

### 按职责分层理解当前工程

#### 1. 启动层：`client/`

- 用于承接新的 Vite/React 入口。
- 负责页面挂载、初始化顺序和新旧架构的桥接。
- 这里不是主要玩法实现区，更多承担“壳”和“边界”的职责。

#### 2. 游戏运行时：`js/`

- 当前项目最重要的业务代码目录。
- `systems/` 负责核心玩法推进，例如回合、朝堂、军事、科举、剧情、国家状态。
- `rigid/` 负责困难模式下的刚性历史事件、机制约束和结算规则。
- `modules/` 与 `ui/` 负责把系统状态组织成玩家可操作的页面和交互。
- `api/`、`state.js`、`storage.js` 把 AI 请求、全局状态与本地存档串起来。

#### 3. 表现层：`css/` + `public/`

- `css/` 管控统一主题、布局骨架和模块皮肤。
- `public/data/` 存放静态配置、角色数据、剧情数据，是前端运行时的重要数据来源。
- `public/assets/` 放置图片、头像等静态资源。

#### 4. 服务层：`server/`

- 提供面向前端的 LLM 代理接口。
- 负责读取本地配置、校验请求和屏蔽模型服务的接入细节。
- 该层保持轻量，不承担数据库或复杂业务编排。

#### 5. 自动化与工程化：`scripts/`、`.fleet/`、`.github/`

- `scripts/` 负责开发启动、无头试玩、体验验证和工程辅助脚本。
- `.fleet/` 描述多代理开发工作流，并产出自动化执行报告。
- `.github/` 用于持续集成，确保构建、测试和报告上传流程可复用。

#### 6. 文档与策划资产：`README.md`、`CHANGELOG.md`、`commit.md`、`ChongzhenSim/`

- `README.md` 面向开发者，说明架构、启动方式和协作约定。
- `CHANGELOG.md` 记录版本演进。
- `commit.md` 记录提交说明。
- `ChongzhenSim/` 保存当前主要题材的策划、模式和系统设计文档，是实现玩法时的重要依据。

### 当前目录设计的重点

- **新旧并存但职责明确**：`client/` 负责新入口，`js/` 保留成熟玩法内核，避免一次性重写风险。
- **玩法系统优先**：核心复杂度集中在 `js/systems/` 与 `js/rigid/`，便于围绕规则迭代。
- **测试跟随模块分布**：大量 `*.test.js` 文件与源码同目录放置，方便就近维护和回归。
- **脚本化验证完整**：除了单元测试，还有无头试玩和体验回归脚本，适合持续检查玩法一致性。

## 🧭 当前架构类型

项目已按 `server/web游戏架构.md` 迁移为更适合当前玩法的 **浏览器文字策略模拟** 类型：

- **UI 层**：DOM 视图组件与页面路由
- **渲染层**：叙事文本与面板渲染，保留轻量浏览器呈现，不强行引入 Phaser
- **核心逻辑层**：现有系统驱动的国家模拟、回合推进、季度结算
- **网络 / 数据层**：Express API 代理 + `fetch` + `localStorage`

这属于对标准网页游戏四层架构的渐进式适配，优先保证现有文字策略玩法和玩家体验稳定。

## UI 维护约定

为降低后续加玩法页面时的重复开发成本，开始页、设置页等基础入口已改为复用 `js/ui/viewPrimitives.js` 中的轻量 UI 基元：

- `createViewShell()`：统一页面标题、说明文案和内容区骨架
- `createSectionCard()`：统一区块标题、说明和内容容器
- `createActionButton()`：统一主次按钮、选中态和说明文案结构

新增页面时，优先复用这套基元和 `css/components/common.css` 中的通用样式，避免继续堆积内联样式或页面私有按钮风格。


## ⚙️ 配置说明

### 后端配置 (`server/config.json`)

| 字段 | 说明 | 示例 |
|------|------|------|
| `LLM_API_KEY` | 大模型 API 密钥（必填） | `your-api-key` |
| `LLM_API_BASE` | API 网关地址 | ` |
| `PORT` | 服务端口 | `3002` |

### 前端配置 (`public/data/config.json`)

| 字段 | 说明 | 可选值 |
|------|------|--------|
| `storyMode` | 剧情模式 | `llm`（AI生成）/ `json`（本地） |
| `apiBase` | 后端地址 | `http://localhost:3002` |
| `totalDays` | 游戏总天数 | `30` |
| `autoSave` | 自动存档 | `true` / `false` |

---

## 启动方式

### 安装依赖

```bash
npm install
```

npm workspaces 会自动安装前端和 `server/` 后端的依赖。

### 一条命令启动前后端

```bash
npm run start
```

该命令会同时启动：

- 前端 Vite 开发服务：`http://localhost:5173`
- 后端 Express 服务：`http://localhost:3002`

### 分开启动

如果需要单独启动，也可以使用：

```bash
npm run start:frontend
npm run start:server
```

### 循环体验验证

```bash
npm run verify:experience
```

该命令会循环执行多策略无头试玩回归，校验剧情推进、季度议题、存档读写和面板展示一致性。

### Fleet 自动执行

```bash
npm run fleet:summary
npm run fleet:run
```

`fleet:summary` 会输出当前默认工作流、项目类型和验证门禁。

`fleet:run` 会按 `.fleet/fleet.yaml` 顺序执行三阶段流程：

- 架构阶段：校验架构文档与关键入口是否齐备
- 编码阶段：校验迁移后的关键脚本、启动边界与体验验证入口是否齐备
- 测试阶段：执行 `npm run build`、`npm test`、`npm run verify:experience`

执行报告会写入 `.fleet/reports/`，GitHub Actions 也会上传这些报告作为构建产物。

---

## 🎮 游戏特性

### 崇祯皇帝模拟器

- **时间系统**：以月为单位推进，季度结算机制，早朝 → 午后 → 夜间循环
- **国家数值**：国库、粮储、军力、民心、边患、天灾、贪腐
- **大臣系统**：10 位历史大臣，各有派系和忠诚度
- **科举/武举系统**：通过科举选拔文官、武举选拔武将，扩充官员候选池
- **国策树**：50+ 可选国策，影响国家数值走向
- **敌对势力系统**：敌对势力可被打击至灭亡，省份动态规则驱动
- **季度议题**：每季度自动生成急/重/缓三类朝堂议题
- **皇帝成长**：皇帝属性成长，影响决策效果
- **自拟诏书**：玩家可自由撰写决策内容，AI 解析并应用数值效果
- **AI 剧情生成**：基于当前状态动态生成剧情

### 双模式

| 模式 | 说明 |
|------|------|
| **经典模式** | 玩家自由撰写诏书并与大臣互动，AI 实时生成剧情 |
| **困难模式** | 刚性历史事件驱动，记忆锚点与执行约束链最大化历史还原度 |

### 大臣角色

| 姓名 | 官职 | 派系 |
|------|------|------|
| 毕自严 | 户部尚书 | 东林党 |
| 梁廷栋 | 兵部右侍郎 | 中立 |
| 温体仁 | 内阁首辅 | 阉党余部 |
| 孙承宗 | 兵部尚书 | 东林党 |
| 曹化淳 | 司礼监秉笔太监 | 帝党 |
| 洪承畴 | 陕西三边总督 | 军事将领 |
| 王永光 | 吏部尚书 | 中立 |
| 林钎 | 礼部尚书 | 中立 |
| 韩继思 | 刑部尚书 | 中立 |
| 张凤翔 | 工部尚书 | 中立 |

---

## 🤝 欢迎共创

本项目开放共创，无论是对历史背景的补充、剧情的优化、数值系统的调整，还是新历史模拟场景的开发，都欢迎各位开发者/爱好者参与！

### 参与方式

1. Fork 本仓库
2. 基于开发规范修改/新增内容
3. 提交 Pull Request，经审核后合并

### 开发规范

- 代码风格：遵循现有代码规范
- 测试要求：新增功能需添加测试
- 提交信息：使用语义化提交信息

---

## ⭐ 鼓励与支持

如果这个 AI 历史模拟器项目让你觉得有趣，或者对你的文游创作有帮助，不妨给项目点一个小星星⭐，你的支持是我们持续开发和优化的最大动力！

---

<div align="center">
  <sub>本项目由 Funloom AI 提供AI技术支持 | 让创意无需等待技术实现</sub>
</div>
