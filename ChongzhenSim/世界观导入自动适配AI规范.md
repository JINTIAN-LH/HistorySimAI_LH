# 世界观导入自动适配 AI 规范

## 1. 文档目标

本文档用于把“玩法”与“世界观”彻底拆层，作为后续“玩家导入任意世界观，系统自动适配现有玩法”的基准规范。

本规范只处理世界观替换，不允许顺手改玩法骨架。也就是说：

- 保留现有回合循环、数值系统、页面结构、模式结构、存档结构。
- 只允许替换叙事背景、人物语义、派系语义、官职语义、静态文案、LLM 提示词世界观部分。
- 未来无论导入的是南宋、明末、架空王朝、科幻帝国，AI 都必须先把世界观映射到既有玩法骨架，再生成内容。

一句话定义：

> 玩法是不可变的运行时骨架，世界观是可替换的语义皮层。

---

## 2. 核心原则

### 2.1 第一原则：玩法不动

以下内容视为“玩法骨架”，导入世界观时不得改写：

- 模式结构：`classic`、`rigid_v1`
- 主循环：决策 -> 结算 -> 时间推进 -> 季度处理 -> 自动保存 -> 下一回合
- 资源与状态主干：`nation`、`prestige`、`executionRate`、`appointments`、`characterStatus`
- UI 主页面：开始页、诏书页、朝堂页、国家页、设置页
- 存档隔离逻辑与模式隔离逻辑
- effects 写回机制与校验逻辑
- 困难模式的 rigid 子状态树和约束执行链

### 2.2 第二原则：世界观只做语义映射

世界观适配的本质，不是重做一个新游戏，而是给现有系统重新命名、重新叙事、重新绑定角色关系。

允许变化的内容：

- 玩家扮演者是谁
- 时间背景是什么
- 核心敌对势力是谁
- 朝堂组织叫什么
- 官职与部门叫什么
- 历史人物/架空人物是谁
- 开场介绍、剧情语言、称谓系统、事件包装

### 2.3 第三原则：功能优先于名称对齐

导入世界观时，AI 必须优先寻找“功能等价物”，而不是字面相似物。

例如：

- “兵部尚书”本质上是军事治理入口，不要求新世界观也必须叫兵部。
- “派系”本质上是政治立场分组，不要求一定是党争。
- “皇帝”本质上是玩家主控权力中心，不要求一定是传统君主。

判断顺序必须是：

1. 先看功能是否等价。
2. 再看语义是否贴近。
3. 最后才决定是否沿用原名或换名。

### 2.4 第四原则：缺位时做最小补位，不扩机制

若导入世界观缺少某类概念，AI 只能补一个“最小可运行占位语义”，不能顺势发明新玩法。

例如：

- 没有“六部”时，可以映射为“治理部门组”。
- 没有“科举”时，可以映射为“人才选拔”或“官员招募”。
- 没有“皇室正统”时，可以映射为“统治合法性”或“执政权威”。

不允许因为原世界观缺少某概念，就新增一个全新的资源条、战斗层、地图系统或外交系统。

---

## 3. 玩法骨架与世界观皮层的边界

## 3.1 不可变层

下列内容属于运行时骨架，导入世界观时只可引用，不可改结构：

| 层级 | 说明 | 处理原则 |
| --- | --- | --- |
| 回合推进 | 决策、结算、月/季推进 | 不改流程 |
| 状态结构 | `state`、`rigid`、`nation` 等 | 不改字段主干 |
| effects 协议 | 任命、罢免、资源增减、角色死亡等 | 不改协议，只换语义包装 |
| 模式系统 | `classic` / `rigid_v1` | 不改模式定义 |
| 存档机制 | 按模式隔离 | 不改键空间规则 |
| UI 骨架 | 页面分区、操作入口 | 不改交互骨架 |

## 3.2 可替换层

下列内容属于世界观皮层，可以根据导入内容自动改写：

| 层级 | 当前体现 | 后续处理方式 |
| --- | --- | --- |
| 开场文案 | `public/data/intro.json` | 生成新的开局背景文本 |
| 角色语义 | `characters.json` + worldview override | 输出角色映射与改写 |
| 派系语义 | `factions.json` + worldview override | 输出派系重命名与立场摘要 |
| 官职/部门语义 | `positions.json` + worldview override | 输出部门与职位语义对照 |
| 朝堂对话预设 | `courtChats` | 生成符合新背景的话术 |
| LLM 世界观约束 | 服务端 prompt | 拼接新的世界观约束段 |
| 静态称谓 | 文案中的帝号、年号、敌国名 | 统一替换 |

---

## 4. 当前工程中已经存在的世界观接入点

当前代码已经部分实现“玩法骨架 + 世界观覆盖”的思路，但还不够抽象。现有接入点如下：

### 4.1 数据覆盖层

- `js/dataLoader.js`
- `js/worldview/worldviewAdapter.js`
- `server/worldviewAdapter.cjs`
- `public/data/worldviewOverrides.json`

职责：

- 在读取基础静态数据后，按世界观 override 覆盖角色、派系、职位、朝堂对话。
- 后续必须扩展为统一覆盖所有“展示目录型数据”，不能只覆盖角色类静态表。

问题：

- 目前 adapter 名称和数据结构仍带有题材耦合。
- 当前 override 更像“人工改写结果”，还不是“AI 可消费的导入规范”。

新增约束：

- 凡是“按 id 驱动玩法、按 title/description 呈现世界观”的目录数据，都必须走统一适配层输出，不能让 UI 自己零散改名。
- 当前已验证需要纳入统一覆盖范围的至少包括：`characters`、`factions`、`positions`、`courtChats`、`policies`。
- 后续若新增目录型内容，如“季度议题模板”“敌对势力展示表”“教学文案模板”，也必须优先接入统一适配层。

### 4.2 开场世界观文案

- `public/data/intro.json`

职责：

- 启动页按行展示开场背景。

问题：

- 当前只是结果文件，不包含生成规则。

### 4.3 LLM 世界观硬约束

- `server/index.js` 中的 `SYSTEM_PROMPT`

职责：

- 强制模型遵守当前南宋世界观与玩法边界。

问题：

- 世界观信息写死在系统提示词里，不利于后续玩家导入任意世界观。

新增约束：

- LLM 是否走代理、请求里附带哪些世界观语义、提示词如何拼装，必须使用共享判断与共享构造器，不能在 minister chat、story、server proxy 三处各写一套分支。
- 否则会出现“UI 已切新世界观，但大模型仍按旧世界观或模板回复”的线上漂移。

### 4.4 请求上下文结构

- `js/api/requestContext.js`

职责：

- 将 state 中的玩法事实发送给 LLM。

结论：

- 这一层总体是正确的，因为它传的是“玩法事实”，而不是具体题材文案。
- 后续应保持这层尽量世界观无关，只在外层追加 `worldviewProfile` 或 `narrativeBinding`。

新增约束：

- 请求上下文里凡是“从玩法 id 反查展示名称”的字段，都必须使用世界观感知的共享 accessor。
- 例如 `unlockedPolicyTitles`、`unlockedPolicyTitleMap` 这一类派生字段，不能直接读取基础目录，否则 UI 与 LLM 会分别看到两套标题。

### 4.5 世界观接入不是只改静态文案，还要覆盖动态生成入口

本项目已经验证，世界观漂移经常不是出在纯数据文件，而是出在“运行时生成文本”的函数里。后续导入新世界观时，必须逐项排查以下动态入口：

- 季度议题生成
- 敌对势力初始化与季度增长说明
- 国策树标题、描述、前置显示名
- 任命反馈、加成面板、军事结果摘要
- rigid 模式中的指标名、预设决策文案、占位提示词
- LLM 请求上下文里的派生标题、称谓与摘要

原则：

- 只改 JSON 不够；所有“从 state 实时拼句子”的地方都要检查是否带有旧世界观词汇。
- 只改显示不够；所有“会被 LLM 读取的上下文字符串”也要同步映射。

---

## 5. 后续自动适配必须遵守的抽象模型

后续任意世界观导入，都必须先被 AI 归一成一个标准对象，称为：

`WorldviewProfile`

它不是给玩家看的文案，而是给系统和 AI 共用的中间层描述。

推荐结构如下：

```json
{
  "id": "southern_song_jianyan",
  "version": "1.0",
  "title": "南宋中兴",
  "summary": "南渡初定、行在未稳、内外交困的恢复期政权",
  "settingType": "historical",
  "playerRole": {
    "id": "sovereign",
    "name": "宋高宗赵构",
    "title": "官家",
    "governingSeat": "行在",
    "legitimacySource": "赵宋正统延续"
  },
  "timeframe": {
    "eraName": "建炎",
    "startYearLabel": "建炎三年",
    "calendarStyle": "imperial-era"
  },
  "coreConflict": {
    "external": ["金军南压"],
    "internal": ["财政困竭", "州郡不宁", "军心未固"],
    "court": ["主战与主和分裂", "行在草创"]
  },
  "semanticBindings": {
    "appointments": "人事任免",
    "hostileForces": "敌对势力",
    "prestige": "统治威望",
    "executionRate": "政令执行度",
    "quarterAgenda": "季度议题"
  },
  "organizationMap": {
    "departments": [],
    "positions": [],
    "factions": []
  },
  "characterMap": [],
  "openingNarrative": {
    "introLines": []
  },
  "llmGuardrails": {
    "mustFollow": [],
    "forbidden": []
  }
}
```

这个对象的目的只有一个：

> 让玩法状态和世界观叙事之间有一层可计算、可验证、可替换的标准翻译层。

---

## 6. AI 自动适配流程

后续玩家导入一个世界观时，AI 必须按以下流程工作，不能跳步。

### 第 1 步：提取世界观原始信息

输入可以来自：

- 玩家自然语言设定
- 玩家上传的 markdown / txt / json
- 角色设定表
- 势力设定表
- 时间背景说明

AI 首先只做信息抽取，形成原始设定摘要，不直接生成游戏文案。

最低要抽出的信息：

- 玩家扮演者
- 统治中心/权力中心
- 时间背景
- 核心内外矛盾
- 主要派系
- 可用角色群
- 治理组织
- 世界观语体与称谓风格

### 第 2 步：映射到玩法骨架

AI 必须把抽取结果映射到现有玩法字段，而不是反过来要求玩法迁就世界观。

强制映射项：

- 谁对应玩家主控者
- 谁对应朝臣/官员集合
- 谁对应派系集合
- 谁对应敌对势力集合
- 哪些部门/职位承载任命玩法
- 哪些叙事冲突支撑季度议题与动态剧情

### 第 3 步：补足最小运行语义

若原设定缺少某些玩法所需语义，AI 需要自动补齐“最小可运行层”。

补齐规则：

- 补语义标签，不补新机制。
- 补占位组织，不补新系统。
- 补叙事解释，不补新数值维度。

### 第 4 步：生成适配产物

至少生成以下结果：

1. `WorldviewProfile`
2. 世界观 override 数据
3. 开场文案 `introLines`
4. LLM 世界观约束片段
5. 校验报告
6. 动态文案覆盖清单
7. 兼容性测试清单

### 第 5 步：做兼容性校验

AI 需要输出“是否能跑进当前玩法”的结论，而不是只给一份好看的设定文案。

最低校验项：

- 是否有足够角色承载任命/聊天/死亡等行为
- 是否有足够派系支撑朝局分歧
- 是否有外部或内部压力支撑长期回合推进
- 是否能解释 `prestige`、`executionRate`、`hostileForces` 这些现有字段
- 是否能在不改模式结构的前提下覆盖 `classic` 与 `rigid_v1`
- 是否所有目录型展示数据都存在共享 accessor，而不是散落在 UI 里手动翻译
- 是否所有运行时动态文案入口都经过世界观排查
- 是否旧存档会因 `worldVersion` 不匹配而被正确隔离
- 是否 LLM 请求上下文与界面看到的是同一套世界观命名

---

## 7. AI 输出必须遵守的字段规范

为了让后续自动化真正可落地，AI 生成的世界观文档必须是“结构化优先，文案次之”。

推荐采用如下输出段落顺序：

## 7.1 世界观摘要

- `title`
- `settingType`
- `summary`
- `tone`
- `playerRole`

## 7.2 玩法语义绑定表

必须逐项说明下面这些字段在新世界观里的含义：

- `prestige`
- `executionRate`
- `appointments`
- `characterStatus`
- `hostileForces`
- `currentQuarterAgenda`
- `customPolicies`
- `closedStorylines`

## 7.3 组织映射表

至少包括：

- `departments`
- `positions`
- `factions`

每项都要有：

- `id`
- `displayName`
- `gameFunction`
- `worldviewMeaning`

## 7.4 角色映射表

每个角色至少包含：

- `id`
- `name`
- `roleFunction`
- `faction`
- `summary`
- `attitude`
- `openingLine`

## 7.5 开场文案

必须输出 `introLines` 数组，不要只写大段散文。

理由：

- 当前开始页按分行渐显。
- 后续自动化落地时，数组比自由长文更稳定。

## 7.6 LLM 约束片段

必须分成两部分：

- `mustFollow`
- `forbidden`

这样后续服务端可以直接拼装到系统提示词，而不是再次人工摘要。

## 7.7 semanticLabels 字段语义（强制）

为避免世界观词汇散落在运行时代码里，导入包必须提供或确认 `semanticLabels`。该对象用于覆盖“敌对势力称呼与识别别名”这类高频动态语义。

字段定义：

| 字段 | 类型 | 作用范围 | 约束 | 示例 |
| --- | --- | --- | --- | --- |
| `primaryHostileName` | `string` | 外交/军情等默认描述中的主敌称呼 | 建议 2-8 字，面向展示文案 | `金廷` / `北境强敌` |
| `northernHostileAliases` | `string[]` | 从玩家决策文本中识别“北方主敌”目标 | 至少包含 1 个通用词；历史词可选 | `北方敌军`、`江北敌军`、`后金` |
| `rebelForceAliases` | `string[]` | 识别“地方叛乱/流民军”目标 | 必须包含通用叛乱词，防止识别失效 | `地方叛军`、`流寇`、`叛军` |
| `dengzhouRebelAliases` | `string[]` | 识别特定区域叛军（如登州线） | 可选；缺省时走系统通用叛军词 | `登州叛军`、`孔有德部` |

实施规则：

1. 运行时默认值必须保持“极简通用”，不得包含具体朝代阵营词。
2. 诸如“后金/建奴/满清/金军”这类历史词，只允许通过导入模板显式提供。
3. 同一个世界观里，`primaryHostileName` 与 `northernHostileAliases` 语义必须一致，避免 UI 与目标识别出现错位。

### 对照示例：极简默认 vs 历史词增强包

用途：同一套玩法骨架下，前者保证跨题材通用，后者保证历史叙事沉浸。

#### A. 极简默认（推荐底座）

```json
{
  "semanticLabels": {
    "primaryHostileName": "北方敌军",
    "northernHostileAliases": ["北方敌军", "江北敌军", "北境强敌"],
    "rebelForceAliases": ["地方叛军", "流寇", "流民军", "兵乱", "叛军"],
    "dengzhouRebelAliases": ["登州叛军", "叛军"]
  }
}
```

#### B. 历史词增强包（按题材显式开启）

```json
{
  "semanticLabels": {
    "primaryHostileName": "金廷",
    "northernHostileAliases": ["金廷", "金军", "后金", "建奴", "满清", "北方敌军", "江北敌军"],
    "rebelForceAliases": ["地方叛军", "流寇", "流民军", "兵乱", "叛军"],
    "dengzhouRebelAliases": ["登州叛军", "登州", "孔有德部", "叛军"]
  }
}
```

验收口径：

- 只导入 A 时，系统不可出现“后金/建奴/满清”等历史特定词。
- 导入 B 后，历史特定词仅在 `semanticLabels` 已声明的前提下出现在目标识别与文案中。
- 无论 A/B，玩法字段、id、effects 协议保持不变。

## 7.8 模板能力增强：动态文案覆盖包（含举一反三）

实测中最容易残留旧世界观词汇的，不只是角色/派系静态表，还包括“页面文案 + 回合文本 + 动态摘要”链路。为此，导入案例必须补充以下可上传字段，供玩家在 `worldview.json` 中直接替换。

### 覆盖矩阵（你点名的 8 项）

| 需求项 | 建议字段 | 作用说明 |
| --- | --- | --- |
| 启动页文案 | `startPageCopy` | 替换启动页主标题、副标题、开始/继续按钮文案 |
| 第一回合文案和选择 | `openingTurn` | 替换首回合简报文本与开局选项文案 |
| 时间编年体 | `chronicleFormat` | 统一年代显示格式（如“建炎三年二月”） |
| 朝堂页 | `courtViewCopy` | 替换朝堂页标题、副标题、快捷动作、空态文案 |
| 国策树 | `policyTreeCopy` | 替换国策树主标题、分支名、提示文案 |
| 皇帝能力 | `rulerAbilityCopy` | 替换能力面板标题、能力标签、能力提示 |
| 天下大事 | `worldEventCopy` | 替换大事栏标题、空态、事件等级文案 |
| 民间舆论 | `publicOpinionCopy` | 替换舆情区标题、正负向标签、空态文案 |

### 字段示例（可直接复制到 worldview.json）

```json
{
  "startPageCopy": {
    "heroTitle": "南宋中兴模拟器",
    "heroSubtitle": "国祚飘摇，行在草创，且看官家如何定中兴之局",
    "startButtonLabel": "即刻临朝",
    "continueButtonLabel": "续理旧局"
  },
  "openingTurn": {
    "briefingTitle": "首次穿越",
    "briefingLines": [
      "你降临在陌生世界的临时中枢据点，外环侦察点刚刚传回敌情。",
      "后勤清点显示银币与粮草都在警戒线附近，任何决策都会牵动全局。",
      "作战组主张先固防线，治理组主张先稳民心，技术组建议先统一路线。",
      "这是你真正意义上的第一道指令：先保生存、先稳内区，还是先集体议决。"
    ],
    "openingChoices": [
      { "id": "stabilize_survive", "label": "先固防线", "summary": "优先加固外环防线，压低敌对势力突破风险" },
      { "id": "secure_develop", "label": "先稳内区", "summary": "优先安置流散者与补给分发，稳住据点秩序" },
      { "id": "align_strategy", "label": "先统一路线", "summary": "召集核心伙伴议事，先统一短期生存与扩张节奏" }
    ]
  },
  "chronicleFormat": {
    "eraLabel": "建炎",
    "displayPattern": "{era}{year}年{month}月",
    "fallbackPattern": "第{year}年{month}月"
  },
  "courtViewCopy": {
    "headerTitle": "朝堂中枢",
    "headerSubtitle": "百官争议并起，圣断当裁轻重",
    "quickActionLabel": "速议",
    "emptyStateText": "暂无可用廷议，请稍候再议"
  },
  "policyTreeCopy": {
    "treeTitle": "中兴国策",
    "treeSubtitle": "定纲举要，循序推进"
  },
  "rulerAbilityCopy": {
    "panelTitle": "官家权衡",
    "abilityHint": "皇权能力决定关键决策的上下限"
  },
  "worldEventCopy": {
    "sectionTitle": "天下大事",
    "emptyStateText": "近日暂无重大变局"
  },
  "publicOpinionCopy": {
    "sectionTitle": "民间舆论",
    "positiveLabel": "民心向治",
    "negativeLabel": "民议汹汹",
    "emptyStateText": "暂未形成显著舆情"
  }
}
```

### 举一反三规则（同类问题一并纳入）

导入新世界观时，除上表 8 项外，以下“同类文本入口”也必须同步放入导入模板或 override：

1. 输入框 placeholder 与默认提示词。
2. 弹窗标题、确认文案、toast 反馈语。
3. 空状态文本（列表为空、暂无记录、暂无事件）。
4. 结果摘要模板（战报、廷议结论、季度结算摘要）。
5. 教学引导与帮助文案（新手提示、功能解释）。

执行口径：

- 凡是“字符串拼接 + 面向玩家展示 + 携带世界观语义”的入口，都视为同类问题。
- 同类入口优先收敛到共享 worldview accessor，避免散落在页面里局部 if/else。
- 玩家上传案例包后，应保证 UI、结算文本、LLM 上下文看到同一套命名。

推荐额外提供 `uiSurfaceCopy` 字段：

- `uiSurfaceCopy.policy`：问题输入 placeholder、追问 placeholder、问政错误提示、颁旨成功提示、历史标题。
- `uiSurfaceCopy.edict`：诏书页壳层标题、副标题、操作区标题、数据区标题、正文区标题。
- `uiSurfaceCopy.court`：科举/武举/人才/问政弹窗标题。

该字段用于承接“placeholder / toast / 弹窗标题”这类同类入口，减少硬编码散落。

---

## 8. 自动适配时的思维准则

AI 在做世界观适配时，必须遵守以下判断逻辑。

### 8.1 先保玩法句法，再换世界观词汇

正确做法：

- 先确认这个行为在现有系统里属于“任命”“处置”“季度议题”“敌对势力变化”中的哪一种。
- 再决定在新世界观中应该怎么说。

错误做法：

- 先按题材发挥一大段设定，再倒推系统怎么兼容。

### 8.2 先做语义压缩，再做文案展开

正确顺序：

1. 提炼成结构化字段。
2. 做功能映射。
3. 再产出角色描述、开场文案、剧情语气。

### 8.3 优先寻找“统治问题”的等价形式

这个游戏的底层体验是“高压治理模拟”。

因此任何导入世界观都必须能解释以下问题：

- 统治者在管谁
- 依赖谁执行命令
- 遭遇哪些持续压力
- 为什么会陷入内部争执
- 为什么玩家每回合都必须做带代价的决策

如果一个世界观不能支撑这五个问题，就不适合直接导入当前玩法。

### 8.4 不追求百科全书式完整，追求可运行闭环

导入世界观不是做设定集，而是做可运行映射。

优先级顺序：

1. 能解释玩法字段
2. 能生成稳定剧情
3. 能支撑角色互动
4. 最后才是设定考据完整度

---

## 9. 建议的标准产物文件

后续若正式做“玩家导入世界观自动适配”，建议最终统一产出以下文件，而不是只生成一个自由格式 markdown：

### 9.1 核心结构文件

- `public/data/worldviews/<worldview-id>/profile.json`
- `public/data/worldviews/<worldview-id>/overrides.json`
- `public/data/worldviews/<worldview-id>/intro.json`
- `public/data/worldviews/<worldview-id>/prompt.json`
- `public/data/worldviews/<worldview-id>/dynamicCopyMap.json`
- `public/data/worldviews/<worldview-id>/validation-report.json`

### 9.2 人类可读说明文件

- `docs/worldviews/<worldview-id>.md`

其职责是：

- 给策划和开发复核
- 给 AI 二次修订使用
- 记录本次适配的语义决策过程

---

## 10. 对当前项目的直接落地建议

如果后面开始实现自动适配，建议按下面的顺序推进：

### 10.1 先把世界观 prompt 从服务端硬编码中拆出来

现状：

- `server/index.js` 里把南宋世界观写死在 `SYSTEM_PROMPT`。

建议：

- 保留玩法约束段为固定 prompt。
- 把世界观约束段改为可注入的 `worldviewPrompt`。

### 10.2 把当前 `worldviewAdapter` 维持为通用适配层

现状：

- 现在 adapter 名字仍绑定当前题材。

建议：

- 通用入口只负责：按 `WorldviewProfile` 和 override 做覆盖。
- 题材差异只存在于数据，不存在于 adapter 名称和逻辑分支。

### 10.3 给请求体追加世界观只读上下文

现状：

- `requestContext.js` 传的是玩法事实。

建议：

- 保持玩法事实不变。
- 额外增加一个只读的 `worldview` 字段，专门承载世界观摘要、称谓规则、禁忌规则。

### 10.4 引入“适配校验器”

最少做以下校验：

- 角色数量是否足够
- 核心职位是否有对应语义
- 派系是否可区分
- 主控角色是否明确定义
- 开场文案是否存在
- LLM 约束是否齐全

### 10.5 必须建立“共享 accessor 优先”规则

后续实现时，不能让世界观映射散落在各个页面组件里，而要先建立共享 accessor，再让 UI、LLM、结算系统统一调用。

必须优先抽共享入口的对象包括：

- `getPolicyCatalog(worldVersionOrState)` 这一类目录访问器
- `buildSharedContextFromState(state)` 这一类请求上下文构造器
- 世界观 prompt 构造器
- 动态议题标题/摘要适配器
- 敌对势力显示名与状态文案适配器

实施规则：

- 先找“谁在给多个系统提供同一份目录/标题/称谓”。
- 在共享层做映射，不在消费层重复 if/else。
- 新增世界观后，旧消费方不应再额外知道“南宋/明末/架空”的分支细节。

### 10.6 必须区分“稳定 id”和“可替换显示语义”

为了保留全盘玩法，导入世界观时必须坚持以下拆分：

- `id`、解锁链、effects 协议、状态字段、存档键，视为稳定骨架。
- `title`、`description`、`summary`、称谓、势力名、议题名，视为可替换语义层。

这条规则尤其适用于：

- 国策树
- 职位与部门
- 派系
- 敌对势力
- 季度议题

禁止做法：

- 为了贴合题材直接改 policy id 或 position id。
- 为了贴合题材重写 effects 字段名。
- 为了贴合题材让 UI 和 prompt 使用不同 id 到名称映射。

推荐做法：

- 保留玩法 id。
- 通过 override 或 adapter 只替换显示元数据。
- 用测试保证“解锁逻辑仍吃旧 id，显示层输出新语义”。

### 10.7 必须把 `worldVersion` 当作一等运行时约束

世界观导入不是单纯切一份文案包，而是切换一个完整运行时语义版本。因此必须保证：

- `config` 中存在明确的 `worldVersion`
- 初始化 state 时写入 `worldVersion`
- 存档写回时持久化 `worldVersion`
- 自动读档前校验 `isSaveCompatibleWithWorld`
- 动态生成函数优先从 `state.config` 或 `state.worldVersion` 推断当前世界观

否则会出现：

- 旧存档残留旧敌对势力
- 新世界观页面混入旧标题
- 自动读档把旧世界数据重新带回新开局

### 10.8 必须处理“旧世界残留数据”的清洗与重建

导入新世界观时，不能默认旧存档或旧初始化结果里的展示数据仍然可用。必须明确哪些字段应该继承，哪些字段应该按新世界重建。

已验证需要重点处理的对象：

- `hostileForces`
- `factions`
- `courtChats`
- `positionsMeta`
- `unlockedPolicyTitles` 这类派生字段

推荐策略：

- 对“以新世界基础表为准”的集合，采用“按新基础表重建，再尝试继承数值状态”的方式。
- 例如敌对势力应先按新世界 threat 表重建集合，再尽量继承匹配项的 `power`、`isDefeated` 等状态。
- 对纯派生字段，不做存档真值来源，统一运行时现算。

### 10.9 必须审计所有带世界观含义的占位文案

世界观漂移常常藏在这些地方：

- 输入框 placeholder
- 按钮文案
- 预设决策文本
- rigid 模式指标标签
- 教程提示与反馈 toast

这些文案虽然不影响核心数值，但会直接破坏沉浸感，并误导玩家和模型。导入流程必须把它们视为正式适配范围，而不是“以后再润色”。

### 10.10 必须把测试矩阵写进导入流程，而不是导入后再补

每次世界观导入至少要有以下验证：

1. 目录适配测试：角色、派系、职位、国策等共享 accessor 是否返回新世界展示名。
2. 请求上下文测试：LLM 看到的标题、称谓、已解锁内容是否与界面一致。
3. 动态文案测试：季度议题、敌对势力状态、关键反馈文本是否仍含旧世界残词。
4. 状态兼容测试：`worldVersion` 写入、读档兼容、旧存档隔离是否正常。
5. 构建验证：`npm run build` 或等价构建必须通过。

如果缺少这些测试，世界观导入就只能算“看起来完成”，不能算“玩法保留且可上线”。

---

## 11. AI 友好型 markdown 模板

后续如果让 AI 直接输出新的世界观适配文档，建议强制遵循下面的骨架：

````md
# <世界观标题> 适配说明

## 1. 世界观摘要
- title:
- summary:
- tone:
- playerRole:

## 2. 玩法不变声明
- 保留的模式:
- 保留的回合循环:
- 保留的核心状态:

## 3. 语义绑定
| gameplayField | worldviewMeaning | notes |
| --- | --- | --- |

## 4. 组织映射
| id | displayName | gameFunction | worldviewMeaning |
| --- | --- | --- | --- |

## 5. 角色映射
| id | name | roleFunction | faction | summary |
| --- | --- | --- | --- | --- |

## 6. 开场文案
```json
{ "lines": [] }
```

## 7. LLM 约束
```json
{
  "mustFollow": [],
  "forbidden": []
}
```

## 8. 兼容性校验
- 角色承载是否足够:
- 派系冲突是否成立:
- 敌对压力是否成立:
- 是否无需新增机制:
````

---

## 12. 最终结论

后续“玩家导入世界观自动适配”的正确做法，不是让 AI 直接写剧情，而是先让 AI 把世界观压缩成一份可验证的 `WorldviewProfile` 和配套 override 产物。

只有这样，项目才能做到：

- 玩法全盘保留
- 世界观可替换
- LLM 输出稳定
- 数据层可验证
- 后续能从单一题材工程，演进成通用历史/架空治理模拟框架
