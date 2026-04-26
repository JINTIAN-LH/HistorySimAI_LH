# Commit 日志

## 2026-04-27: fix(utils): repair appointment parser and restore build

**Commit Hash**: (pending)

### 改动摘要

修复 `js/utils/appointmentEffects.js` 中任免语义解析函数的结构损坏与重复声明问题，恢复 `deriveAppointmentEffectsFromText` 的可执行状态，并确保生产构建重新通过。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/utils/appointmentEffects.js` | ✏️ | 重写 `deriveAppointmentEffectsFromText` 主体逻辑，恢复任命/免职/赐死解析流程并支持“分别为”映射 |
| `js/utils/appointmentEffects.js` | ✏️ | 移除重复的 `splitActionClauses` 声明，修复编译期标识符重复错误 |

### 价值

- 消除打包阻塞：`npm run build` 从失败恢复为可通过
- 任免文本解析路径恢复稳定，避免运行时语法异常

### 验证

- `npm run build` ✅ 通过

## 2026-04-27: merge: integrate my-feature-branch into main for production deploy

**Commit Hash**: b465354

### 改动摘要

将 my-feature-branch 合并至 main，修复生产环境 GitHub Pages 静态资源 404（`worldview.import.bundle.txt` 未部署）问题，并将全部新功能推送至生产。冲突以 feature branch 为准，同步清理 ChongzhenSim/ 残留副本。

### 核心改动

- storySystem.js 首回合自定义世界观覆盖修复
- TextPreviewModal、OnboardingUpdateModal 组件上线
- 设置页示例文件全文查看/下载功能
- playerUpdates.json 配置驱动版本弹窗
- public/data/import-samples/worldview.import.bundle.txt 已包含在构建输出

### 价值

- 生产 404 修复：GitHub Pages 构建现包含 worldview 示例 bundle
- 全部 my-feature-branch 功能部署至 main

---

## 2026-04-26: feat(ui): add versioned onboarding and reusable text modals

**Commit Hash**: 2b4235a

### 改动摘要

本次更新将新开局弹窗升级为“配置驱动 + 版本门控”模式：最近更新文案改为读取 `playerUpdates.json`，并按版本号实现“同版本仅提示一次”。同时把设置页全文弹窗抽成可复用组件，新增复制全文能力，降低后续维护成本。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `client/src/ui/views/start/StartView.jsx` | ✏️ | 新开局引导弹窗接入版本门控，最近更新改为读取 `data/playerUpdates.json` |
| `client/src/ui/components/OnboardingUpdateModal.jsx` | ➕ | 新增玩家向“玩法引导+最近更新”通用弹窗组件 |
| `public/data/playerUpdates.json` | ➕ | 新增精简版玩家更新配置，后续发版仅需改文案文件 |
| `client/src/ui/components/TextPreviewModal.jsx` | ➕ | 新增可复用文本预览弹窗，支持复制全文 |
| `client/src/ui/views/settings/SettingsView.jsx` | ✏️ | 设置页示例全文弹窗改为复用组件，保留查看与复制流程 |
| `client/src/ui/views/start/StartView.test.js` | ➕ | 新增版本门控与配置驱动文案测试 |
| `client/src/ui/views/settings/SettingsView.test.js` | ➕ | 新增查看案例全文与复制全文交互测试 |
| `js/systems/storySystem.js` | ✏️ | 首回合 openingTurn 覆盖逻辑导出并修正为优先使用自定义开场 |
| `js/systems/storySystem.template.test.js` | ✏️ | 增补首回合 world opening 覆盖回归测试 |
| `js/persistentBrowserStorage.js` | ✏️ | 持久化白名单增加 onboarding 版本记录键 |

### 价值

- 发版维护简化：更新提示可仅通过 `playerUpdates.json` 调整
- 新玩家体验更稳定：新开局提示按版本去重，避免重复打扰
- 组件复用提升：文本弹窗统一能力（查看/复制）可在后续页面复用

### 验证

- `npm run build` ✅ 通过

## 2026-04-22: fix(settings): improve mobile sample bundle download

**Commit Hash**: 80f55c2

### 改动摘要

本次修复了移动端点击下载世界观示例文件无响应的问题。通过将示例文件路径改为绝对路径并新增移动端优先回退链路，确保在分享不可用时仍能直接打开文件地址完成下载。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `client/src/ui/views/settings/SettingsView.jsx` | ✏️ | 示例文件路径改为绝对路径，移动端优先 share URL，失败后直接跳转文件 URL，桌面端继续使用 Blob 下载 |

### 价值

- 修复移动端下载入口“点击无反应”问题，提升可用性
- 降低移动端路由下相对路径失效导致的下载失败概率
- 保持桌面端下载体验不变，兼容原有流程

### 验证

- `npm run build` ✅ 通过

## 2026-04-22: fix: harden mobile sample download and quarterly rewards

**Commit Hash**: a025e68

### 改动摘要

本次修复了移动端下载世界观示例文件时可能出现黑屏的问题：将下载入口改为 fetch+Blob，并在支持时优先走系统分享文件流程，避免页面被 txt 资源替换。同步在回合推进中新增季度奖励机制，每逢季度月自动发放 1 点能力点与 1 点国策点，并补充流水线测试覆盖。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `client/src/ui/views/settings/SettingsView.jsx` | ✏️ | 下载示例文件改为移动端安全流程（share/files 或 Blob 下载）并补失败提示 |
| `js/systems/turnSystem.js` | ✏️ | 新增季度月奖励：3/6/9/12 月自动 `abilityPoints +1`、`policyPoints +1` |
| `js/systems/turnSystem.pipeline.test.js` | ✏️ | 新增季度奖励测试，断言 2 月推进到 3 月时点数正确发放 |

### 价值

- 解决移动端下载示例文件黑屏风险，提升设置页可用性
- 强化季度成长反馈，减少能力点/国策点获取断层
- 通过自动化测试锁定行为，降低后续回归风险

### 验证

- `npm run build` ✅ 通过
- `npx vitest run js/systems/turnSystem.pipeline.test.js` ✅ 通过

## 2026-04-22: fix: stabilize worldview context and death pacing

**Commit Hash**: 8b62a0a

### 改动摘要

本次更新修正了剧情请求在世界观上下文缺失时的回退风险，确保请求持续携带当前世界标识，避免串入非当前设定语义。同步下调人物自然死亡触发频率与概率曲线，缓解“角色过快死亡”带来的节奏失衡；并刷新了导入样例与规范文档以匹配当前流程。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/api/requestContext.js` | ✏️ | world context 兜底透传，保证 worldVersion/title 在无 worldviewData 时仍可带入请求 |
| `js/systems/turnSystem.js` | ✏️ | 自然死亡改为季度判定，增加年龄门槛并降低概率上限，放缓死亡速度 |
| `public/data/import-samples/worldview.sample.json` | ✏️ | 更新世界观导入样例内容，保持字段与现行导入路径一致 |
| `public/data/import-samples/worldview.import.bundle.txt` | ✏️ | 重新生成导入 bundle 示例，便于直接复制导入 |
| `ChongzhenSim/世界观导入自动适配AI规范.md` | ✏️ | 同步导入规范文档说明与当前实现细节 |

### 价值

- 降低剧情请求串世界观导致的大模型推理失败概率
- 让角色生存节奏更符合长期经营体验，减少早期大量死亡
- 导入样例与规范文档保持一致，减少接入和调试成本

### 验证

- `npm run build` ✅ 通过

## 2026-04-22: refactor: remove rigid mode and quarterly memorial pipelines

**Commit Hash**: `3c0eb7f`

### 改动摘要

本次重构全面移除“困难模式（rigid）”与“季度奏折”功能链，清理了运行时入口、状态字段、回合结算、脚本验证与相关测试依赖，统一回到经典模式主干。同步修正了首回合模板优先级与跨世界观 prompt 回退路径，避免叙事串线和回合回滚。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/systems/turnSystem.js` | ✏️ 调整 | 删除季度结算与 rigid 分支回合流水，回归经典单链路推进 |
| `js/systems/storySystem.js` | ✏️ 调整 | 移除季度面板/门禁/季度效果与 rigid 兜底拼装；首回合改为“模板优先，缺失才用 world opening” |
| `js/systems/coreGameplaySystem.js` | ✏️ 调整 | 删除季度议题刷新导出与季度状态输出，统一政策目录映射上下文 |
| `js/state.js` | ✏️ 调整 | 清理 rigid 与季度相关默认状态字段，初始化回归经典模式 |
| `scripts/headless-playtest.mjs` | ✏️ 调整 | 删除季度选择与季度一致性统计，保留显示一致性与国情面板一致性验证 |
| `server/index.js` | ✏️ 调整 | 新增请求级 story prompt 解析，跨世界观时避免回退到服务端默认南宋 prompt |

### 价值

- 清除已下线功能链的历史分叉，降低回合主流程复杂度与维护成本
- 避免跨世界观叙事污染导致的 LLM 严格模式回滚
- 验证脚本与测试口径与当前玩法一致，减少无效失败与误报

### 验证

- `npm run build` ✅ 通过
- `npm run test -- js/testing/headlessPlaytest.integration.test.js` ✅ 通过
- `npm run test -- js/systems/turnSystem.pipeline.test.js` ✅ 通过
- `npm run test -- js/systems/coreGameplaySystem.test.js` ✅ 通过

## 2026-04-21: fix: align era timeline and block legacy story fallback

**Commit Hash**: `15dd86e8d0dad45aec98153be24ae6c1521ea5e2`

### 改动摘要

修复编年时间错位问题：将顶栏时间的兜底值从历史遗留的“3年4月”改为严格的“1年1月”并增加数值校验，避免“穿越元年”与“3年4月”同屏冲突。同步增强剧情加载护栏，在穿越世界观下拦截南宋语义 LLM 结果并回退本地跨世界模板。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/layout.js` | ✏️ 调整 | 顶栏时间回退改为 `1年1月`，并增加 `currentYear/currentMonth` 数值校验 |
| `js/worldview/worldviewRuntimeAccessor.js` | ✏️ 调整 | 编年年份首年统一显示为“元”，解决显示语义不一致 |
| `js/systems/storySystem.js` | ✏️ 调整 | 穿越世界观下新增南宋语义拦截，命中后回退本地模板 |
| `public/data/story/day1_afternoon.json` | ➕ 新增 | 补齐跨世界午后剧情模板，避免二回合回退旧叙事 |
| `public/data/story/day1_evening.json` | ➕ 新增 | 补齐跨世界夜间剧情模板，保证首日三阶段连续性 |

### 价值

- 消除“穿越元年 vs 3年4月”时间错位，编年显示统一
- 二回合剧情在异常 LLM 返回下可自动纠偏，稳定保持当前世界观
- 完整覆盖首日 morning/afternoon/evening 本地模板，降低剧情回退风险

### 验证

- `npm run build` ✅ 通过
- `npx vitest run js/worldVersion.test.js js/systems/storySystem.template.test.js` ✅ 通过

## 2026-04-21: fix: add startup save self-check and one-click cleanup

**Commit Hash**: `6687f747654ac7fcc9c742aec7f723add8119210`

### 改动摘要

新增“启动自检提示”能力：启动前扫描并识别旧世界观残留存档，弹窗提醒并支持一键清理不兼容项，避免自动加载链被旧存档污染导致世界观回退。同步合并本地确认的 `public/assets` 删除变更。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/main.js` | ✏️ 调整 | 启动前新增不兼容存档扫描、弹窗确认与批量清理流程 |
| `js/api/requestContext.js` | ✏️ 调整 | 补充 `worldviewStoryPrompt` 对象透传，保证剧情请求携带完整世界观提示 |
| `js/systems/storySystem.js` | ✏️ 调整 | 首回合开场改为“世界观简报 + 基础剧情”拼接，提升叙事厚度 |
| `public/assets/*` | 🗑️ 删除 | 按确认范围纳入本地 26 张历史头像资源删除 |

### 价值

- 启动时可主动发现并清理旧世界观残留，降低“二回合回退旧数据”复发概率
- 一键清理减少人工排障成本，避免用户反复手动删档
- 首回合剧情信息密度更高，且世界观提示词传递更完整

### 验证

- `npm run build` ✅ 通过
- `npx vitest run js/worldVersion.test.js js/storage.test.js js/worldview/worldviewPriority.test.js` ✅ 通过

## 2026-04-21: feat: prioritize cross-world default with southern-song fallback

**Commit Hash**: `ca0bad809e2113995a8c70214aa9691921d19ae3`

### 改动摘要

将默认世界观切换为“穿越世界模板”，并明确加载优先级为“运行时自定义 > 默认穿越 > 南宋 fallback”。同步完成 `public/data` 叙事与配置清理，确保默认路径不再残留南宋语义，同时保留南宋作为第二优先兜底资源。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/worldVersion.js` | ✏️ 调整 | 默认世界版本切换为 `cross_world_default_v1` |
| `js/worldview/worldviewAdapter.js` | ✏️ 调整 | 新增默认/兜底双层 worldview 与 overrides 解析策略 |
| `js/worldview/worldviewPriority.test.js` | ➕ 新增 | 覆盖“自定义优先、默认次之、南宋兜底”优先级测试 |
| `public/data/worldview.json` | ✏️ 调整 | 默认 worldview 替换为穿越世界配置 |
| `public/data/worldviewOverrides.json` | ✏️ 调整 | 默认 overrides 替换为穿越世界角色/派系/政策数据 |
| `public/data/fallbacks/southernSong.worldview.json` | ➕ 新增 | 保留南宋 worldview 作为 fallback 资源 |
| `public/data/fallbacks/southernSong.worldviewOverrides.json` | ➕ 新增 | 保留南宋 overrides 作为 fallback 资源 |
| `public/data/intro.json` | ✏️ 调整 | 开场文案切换为跨世界穿越语义 |
| `public/data/story/day1_morning.json` | ✏️ 调整 | 首回合叙事与 loyalty 映射改为 hero 体系 |
| `public/data/story/hard_mode_day1_morning.json` | ✏️ 调整 | 困难模式开场语义切换为穿越据点叙事 |
| `public/data/positions.json` | ✏️ 调整 | 清理“皇帝/六部”等默认路径历史词残留 |
| `public/data/provinceRules.json` | ✏️ 调整 | 区域规则重写为跨世界地名与状态描述 |
| `public/data/nationInit.json` | ✏️ 调整 | 国情与外部威胁切换为跨世界初始化数据 |
| `public/data/rigidHistoryEvents.json` | ✏️ 调整 | 保留机制数值，替换事件名称/文案历史指向 |

### 价值

- 默认体验稳定落到穿越模板，避免开局叙事与数据语义错位
- 保留南宋 fallback，满足“第二优先兜底”与兼容旧包需求
- 通过优先级测试与定向回归，降低后续世界观切换回归风险

### 验证

- `npm run build` ✅ 通过
- `npx vitest run js/worldVersion.test.js js/systems/storySystem.template.test.js js/worldview/worldviewPriority.test.js` ✅ 通过

## 2026-04-21: feat: map start intro rolling lines into worldview layer

**Commit Hash**: (pending)

### 改动摘要

将“启动页滚动开场段落”纳入与 `startPageCopy` 相同的世界观映射层。启动页现在优先读取玩家导入包中的 `startPageCopy.introLines`，缺失时自动回退到 `public/data/intro.json`，确保兼容旧包与旧资源。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/worldview/worldviewRuntimeAccessor.js` | ✏️ 调整 | 新增 `resolveWorldviewStartIntroLines()`，统一从 `startPageCopy.introLines` 读取并归一化字符串数组 |
| `client/src/ui/views/start/StartView.jsx` | ✏️ 调整 | React 启动页接入世界观开场段落，改为“世界观优先、intro.json 回退” |
| `js/ui/startView.js` | ✏️ 调整 | 旧 UI 启动页同步接入同一逻辑，保持两套入口一致 |
| `js/worldview/worldviewStorage.js` | ✏️ 调整 | 导入校验新增 `worldview.startPageCopy.introLines` 的类型校验与缺失 warning |
| `js/worldview/worldviewStorage.test.js` | ✏️ 调整 | 新增 `introLines` 相关 warning/error 断言，覆盖错误类型场景 |
| `public/data/import-samples/worldview.sample.json` | ✏️ 调整 | 样例包新增 `startPageCopy.introLines` 模板 |
| `public/data/import-samples/worldview.import.bundle.txt` | ✏️ 调整 | 单文件导入模板同步新增 `startPageCopy.introLines` |

### 价值

- **玩家可自定义开场滚动文案**：世界观上传后即可替换启动页滚动段落
- **兼容旧资源**：未提供 `introLines` 时无缝回退 `intro.json`
- **导入更稳健**：新增字段校验，减少错误数据导致的运行时异常

### 验证

- `npm run build` ✅ 通过
- `npm test -- js/worldview/worldviewStorage.test.js` ✅ 通过（26 tests）

## 2026-04-21: fix: avoid duplicate upload version collisions

**Commit Hash**: `9538de3`

### 改动摘要

修复“Auto-selected version already exists; try again with overwrite=1”导致的重复上传失败问题：在前端构建阶段自动注入唯一 build version，并让 CI 产物上传支持覆盖，避免同版本产物命名冲突阻断发布。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `.github/workflows/ci.yml` | ✏️ 调整 | `upload-artifact` 增加 `overwrite: true`，避免同名 artifact 复跑时报冲突 |
| `.github/workflows/deploy.yml` | ✏️ 调整 | GitHub Pages 构建/部署使用 `run_id + run_attempt` 作为动态产物名，避免固定版本名重复 |
| `vite.config.js` | ✏️ 调整 | 新增构建版本注入（`x-build-version` meta + `__BUILD_VERSION__` define），确保每次构建产物具备唯一指纹 |

### 价值

- **上传更稳定**：重复版本冲突场景下不再频繁手工重试
- **发布可追踪**：每个构建都带有唯一版本标识，便于回溯
- **流水线更鲁棒**：CI/Pages 对同名产物冲突更不敏感

### 验证

- `npm run build` ✅ 通过

## 2026-04-21: feat: migrate worldview UI copy and import validation

**Commit Hash**: (pending)

### 改动摘要

完成世界观文案能力从“局部字段”到“同类入口全链路”的迁移：将启动页、首回合、编年、朝堂/国策/能力/大事/舆论以及 policy/edict/court 的 placeholder、toast、弹窗标题统一收敛到 runtime accessor。同步补齐导入校验与示例包，确保玩家上传世界观时可直接覆盖新增入口且行为可预期。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/worldview/worldviewRuntimeAccessor.js` | ✏️ 调整 | 新增并扩展 8 组 copy accessor 与 `uiSurfaceCopy`（policy/edict/court）默认字典 |
| `js/worldview/worldviewStorage.js` | ✏️ 调整 | 导入校验器补齐 8 组字段与 `uiSurfaceCopy.court` 扩展键类型校验及关键 warning |
| `js/worldview/worldviewStorage.test.js` | ✏️ 调整 | 新增/扩展校验测试，覆盖 8 组字段与 `uiSurfaceCopy.court` 类型错误场景 |
| `js/ui/startView.js` | ✏️ 调整 | 启动页标题、副标题、开始按钮文案改为从世界观 copy 动态读取 |
| `client/src/ui/views/start/StartView.jsx` | ✏️ 调整 | React 壳层启动页同步接入 `startPageCopy` |
| `js/systems/storySystem.js` | ✏️ 调整 | 首回合开场文案/选项、编年时间、大事与舆论标题和空态改为 world copy 驱动 |
| `js/ui/nationView.js` | ✏️ 调整 | 国策树分支名、皇帝能力、天下大事与舆论区文案改走 accessor |
| `js/ui/policyView.js` | ✏️ 调整 | placeholder、追问、错误/成功提示、历史标题统一接入 `uiSurfaceCopy.policy` |
| `js/ui/edictView.js` | ✏️ 调整 | 页面壳层 title/subtitle/actions/data/main 文案改走 `uiSurfaceCopy.edict` |
| `js/ui/courtView.js` | ✏️ 调整 | 科举/武举/人才/问政弹窗及任命/调岗 toast 与 subtitle 全量迁移到 `uiSurfaceCopy.court` |
| `public/data/import-samples/worldview.sample.json` | ✏️ 调整 | 补全 8 组字段与 `uiSurfaceCopy`（含 court 全量键）示例 |
| `public/data/import-samples/worldview.import.bundle.txt` | ✏️ 调整 | 同步单文件导入包示例字段与 court 文案扩展键 |
| `ChongzhenSim/世界观导入自动适配AI规范.md` | ✏️ 调整 | 增补 8 组字段语义、举一反三入口与 `uiSurfaceCopy` 规范说明 |

### 价值

- **全链路可配置**：同类 UI 入口不再散落硬编码，玩家上传包可一次性替换关键展示面
- **导入更安全**：新增结构校验与 warning，降低错误包导致运行时异常的风险
- **维护成本下降**：文案入口统一经 accessor 管理，后续扩展/换皮只需调整世界观字段

### 验证

- `npm run build` ✅ 通过
- `npx vitest run js/worldview/worldviewStorage.test.js js/storage.test.js js/systems/storySystem.template.test.js js/systems/coreGameplaySystem.test.js` ✅ 通过

## 2026-04-21: feat: complete worldview semantic labels adaptation

**Commit Hash**: `9370b5f`

### 改动摘要

完成世界观导入第四轮能力收敛：将运行时残余历史词汇进一步下沉到 `semanticLabels` 可选包，默认值保持跨题材可运行的极简语义；同步补齐导入规范文档，明确字段语义与模板使用边界，确保“默认通用、历史增强按需开启”。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/worldview/worldviewRuntimeAccessor.js` | ✏️ 调整 | 收缩北方主敌默认别名为通用词，历史词改为模板显式配置；保留叛乱识别必要通用别名避免回归 |
| `js/systems/coreGameplaySystem.js` | ✏️ 调整 | 外交/敌对识别统一走 semantic labels，移除主流程历史词硬编码依赖 |
| `client/src/ui/views/start/StartView.jsx` | ✏️ 调整 | 启动标题改为世界观动态标题，保持 custom worldview 与模式可用性一致 |
| `public/data/import-samples/worldview.sample.json` | ✏️ 调整 | 新增/完善 `semanticLabels` 示例，显式提供“后金/建奴/满清”等历史增强别名 |
| `public/data/import-samples/worldview.import.bundle.txt` | ✏️ 调整 | 同步单文件导入模板中的 `semanticLabels` 对照示例 |
| `ChongzhenSim/世界观导入自动适配AI规范.md` | ✏️ 调整 | 新增 `semanticLabels` 字段语义说明与“极简默认 vs 历史词增强包”对照示例 |

### 价值

- **语义治理收口**：运行时默认文案脱离特定朝代词，跨世界观复用更稳定
- **模板表达更清晰**：历史词仅在导入模板显式声明时生效，行为边界可预期
- **交付可维护**：规范文档与样例同步，后续策划/开发可按统一口径扩展

### 验证

- `npm run build` ✅ 通过
- `npx vitest run js/systems/coreGameplaySystem.test.js js/systems/militarySystem.test.js js/storage.test.js` ✅ 通过

## 2026-04-20: refactor: roll back worldview template transform flow

**Commit Hash**: (pending)

### 改动摘要

将世界观导入流程从“自然语言模板 + 服务端自动转换”回退到“worldview.json + worldviewOverrides.json 双文件导入”。同时移除服务端模板转换相关逻辑与对应测试，恢复更稳定、可控的数据导入路径，降低线上超时与不确定性。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `client/src/ui/views/settings/SettingsView.jsx` | ✏️ 调整 | 恢复双 JSON 上传校验与导入流程，移除模板快速填充与文本转换入口 |
| `server/index.js` | ✏️ 调整 | 移除 worldview 模板转换路由与相关辅助函数（深合并、转换提示词、降级逻辑） |
| `server/index.test.js` | ✏️ 调整 | 删除模板转换相关测试，恢复现有服务端配置/接口验证基线 |
| `js/worldview/worldviewStorage.js` | ✏️ 调整 | `buildWorldviewPackage` 回退为基础双参数版本，移除 meta 覆盖合并 |

### 价值

- **降低线上风险**：避免模板转换请求链路导致的额外超时与故障面
- **行为可预测**：导入结果完全由用户上传 JSON 决定，便于问题复现与调试
- **维护成本更低**：减少服务端特殊分支与冗余测试维护负担

### 验证

- `npm run build` ✅ 通过

## 2026-04-18: fix: apply worldview faction mapping to AI-generated talents

**Commit Hash**: (pending)

### 改动摘要

AI 生成的人才角色仍携带明末派系标签（帝党、东林党、中立、军事将领），因为世界观映射层只处理了静态角色数据，未覆盖 LLM 运行时生成的人才。本次修复在 worldviewAdapter 新增派系名映射函数，在 talentApi 的 normalizeTalent 中调用映射，并在服务端 LLM 提示词中注入当前世界观的派系 ID 约束。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/worldview/worldviewAdapter.js` | ➕ 新增 | `mapFactionLabel()` / `resolveFactionId()` 派系名双向映射 |
| `js/api/talentApi.js` | ✏️ 调整 | `normalizeTalent()` 内调用世界观映射修正 faction/factionLabel；新增 `extractFactionNamesForPrompt()` 传递派系名给服务端 |
| `server/index.js` | ✏️ 调整 | talentRecruit 提示词追加 `factionHint`，约束 LLM 使用正确派系 ID |
| `js/worldview/southernSongAdapter.test.js` | ➕ 新增 | 12 条测试覆盖 mapFactionLabel / resolveFactionId 各路径 |

### 价值

- **派系标签正确**：AI 招募的人才显示南宋世界观派系名（主战清议、务实经世等），不再泄漏明末标签
- **双重防御**：服务端提示词约束 + 客户端归一化映射，确保任何 LLM 输出都能正确转换

### 验证

- `npm run build` ✅ 通过
- `npm run test` ✅ 371 tests passed

## 2026-04-18: chore: switch default LLM provider to Alibaba Qwen (qwen-plus)

**Commit Hash**: (pending)

### 改动摘要

将全局默认 LLM 提供商从智谱 BigModel（glm-4-long）切换到阿里通义千问（qwen-plus），同步更新 API Base、默认模型名和对应测试断言。共 6 个文件，纯配置/常量替换，无逻辑变更。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `client/src/ui/components/ConfigSetupGate.jsx` | ✏️ 调整 | 默认 API Base → dashscope，默认模型 → qwen-plus |
| `client/src/ui/views/settings/SettingsView.jsx` | ✏️ 调整 | 同上 |
| `js/playerRuntimeConfig.js` | ✏️ 调整 | `DEFAULT_LLM_API_BASE` / `DEFAULT_LLM_MODEL` 切换 |
| `server/index.js` | ✏️ 调整 | `getRuntimeConfig` 与 config-status 回退值统一为 qwen-plus |
| `server/index.test.js` | ✏️ 调整 | 测试断言同步更新 |
| `server/config.example.json` | ✏️ 调整 | 示例配置切换为通义千问 |

### 价值

- **提供商切换**：默认使用阿里通义千问 qwen-plus，支持更广泛的国内开发者 API 接入

### 验证

- `npm run build` ✅ 通过

## 2026-04-18: fix: make LLM settings effective immediately and switch default model to glm-4-long

**Commit Hash**: (pending)

### 改动摘要

1. 修复设置页修改大模型参数后需刷新页面才能生效的问题。根因是保存只写入 localStorage，但运行态 `state.config` 仍为启动时快照，后续 LLM 请求继续读取旧值。修复后保存成功时同步将新参数合并进 `state.config`，后续故事/内阁/政策讨论请求立即使用新值，无需刷新。
2. 全局默认模型从 `glm-4-flash` 切换为 `glm-4-long`，覆盖前端默认值、服务端回退值和配置示例。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `client/src/bootstrap/configurationGate.js` | ✏️ 修复 | 保存成功后通过 `setState` 将 llmApiKey/llmApiBase/llmModel/llmChatModel 同步写入运行态 config，保留其余非 LLM 字段不变 |
| `client/src/ui/views/settings/SettingsView.jsx` | ✏️ 修复 | 保存提示文案改为"已立即生效"；默认模型常量改为 `glm-4-long` |
| `client/src/bootstrap/configurationGate.test.js` | ➕ 补测 | 新增"syncs saved config into runtime state immediately without reload"测试 |
| `client/src/ui/components/ConfigSetupGate.jsx` | ✏️ 调整 | 默认模型从 `glm-4-flash` → `glm-4-long` |
| `js/playerRuntimeConfig.js` | ✏️ 调整 | `DEFAULT_LLM_MODEL` 从 `glm-4-flash` → `glm-4-long` |
| `server/index.js` | ✏️ 调整 | 服务端 `getRuntimeConfig` 模型回退值统一为 `glm-4-long` |
| `server/index.test.js` | ✏️ 调整 | 测试断言同步更新为 `glm-4-long` |
| `server/config.example.json` | ✏️ 调整 | 示例配置默认模型改为 `glm-4-long` |

### 价值

- **即时生效**：玩家修改模型/Key/Base 后无需刷新即可在下一次 AI 调用中使用新参数
- **无副作用**：不触发页面刷新，不中断当前游戏进度
- **模型升级**：全局默认模型切换到 `glm-4-long`，支持更长上下文

### 验证

- `npm run build` ✅ 通过
- `npm run test` ✅ 363 项全部通过（34 个测试文件，0 回归）

## 2026-04-15: fix: resolve single-column edict scroll button host

**Commit Hash**: (pending)

### 改动摘要

修复单栏（移动端）布局下诏书页"最新诏书"悬浮按钮不显示且点击无效的问题。根因是 legacy layout 下滚动宿主误用了不可滚动的内容容器，改为向上查找真实滚动祖先（`#main-view` 或 `.desktop-gameplay-panel__body`）。同时新增 build-commit-push 自动化 skill。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/ui/edictView.js` | ✏️ 修复 | 新增 `findLegacyScrollHost` 解析真实可滚动容器，替代直接使用 container 作为 scrollHost |
| `js/ui/edictView.test.js` | ➕ 补测 | 新增单栏 legacy layout 下按钮可见与点击滚动的回归测试 |
| `.github/skills/build-commit-push/SKILL.md` | ➕ 新增 | 打包构建提交推送自动化 skill，支持 `/build-commit-push` 或自然语言触发 |

### 价值

- **单栏布局可用**：移动端诏书页悬浮按钮正确显示并可点击跳转
- **工作流自动化**：build-commit-push 一句话触发完整构建发布流程

### 验证

- `npm run test -- js/ui/edictView.test.js` ✅ 通过（4 项）
- `npm run build` ✅ 通过

## 2026-04-15: fix: stabilize llm turn rollback and settings runtime updates

**Commit Hash**: (pending)

### 改动摘要

这一轮把玩家反馈的两条主线问题和相关稳定性改动合并提交：
1) 诏书页在长剧情/多回合后“最新诏书”按钮偶发不出现；
2) 设置页无法直接更新玩家本地大模型参数。

同时补齐了 LLM 回合失败时的回滚保障、移动端本地联调代理/CORS 兼容，以及 React 壳层移动端玩法视图缓存与样式入口收敛，确保构建产物与回归测试稳定。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/ui/edictView.js` `js/ui/edictView.test.js` | ✏️ 修复 / ➕ 补测 | 诏书悬浮按钮增加渲染帧等待与 MutationObserver 同步，修复多回合内容追加后的显隐时序问题，并补充回归测试 |
| `client/src/ui/views/settings/SettingsView.jsx` `client/src/bootstrap/configurationGate.js` `client/src/bootstrap/configurationGate.test.js` | ✏️ 修复 / ➕ 补测 | 设置页新增大模型参数编辑与本地保存入口；保存时支持“API Key 留空沿用已保存值” |
| `js/systems/turnSystem.js` `js/systems/storySystem.js` `js/systems/turnSystem.pipeline.test.js` | ✏️ 加固 / ➕ 补测 | LLM 模式下下一回合生成失败时回滚状态并提示，不再静默推进错误回合 |
| `js/api/httpClient.js` `js/api/httpClient.test.js` `server/index.js` `server/index.test.js` | ✏️ 兼容 / ➕ 补测 | 本地局域网调试下代理与 CORS 允许私网地址来源，移动端真机联调更稳定 |
| `client/src/App.jsx` `client/src/main.js` `css/layout.css` | ✏️ 优化 | React 视图装载与移动端布局细节收敛，减少切页抖动并统一样式入口 |
| `.github/copilot-instructions.md` | ➕ 新增 | 补充仓库级 Copilot 开发约束说明，统一协作规则 |

### 价值

- **玩家体验更稳定**：多回合诏书浏览可稳定回跳到最新内容
- **设置可维护性提升**：玩家可在设置页直接更新本地模型参数
- **LLM 失败可回退**：回合推进在生成失败时不会破坏状态一致性
- **移动端联调更顺畅**：LAN 场景下前后端联通与预检通过率更高

### 验证

- `npm run test -- js/ui/edictView.test.js client/src/bootstrap/configurationGate.test.js` ✅ 通过
- `npm run build` ✅ 通过

## 2026-04-13: feat: add edict jump-to-latest floating button

**Commit Hash**: (pending)

### 改动摘要

这次在诏书页补了一个面向长历史流的悬浮入口：当玩家从最新诏书向上翻阅旧内容时，右下角会出现“最新诏书”按钮，点击即可平滑回到底部，减少在长文本和多回合历史中手动拖拽的成本。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/ui/edictView.js` | ✏️ 增强 | 为诏书视图挂载可清理的右下角悬浮按钮，按当前滚动位置决定显隐，并统一兼容 legacy / gameplay page 两种布局 |
| `css/modules/edict.css` | ✏️ 增强 | 新增悬浮按钮样式、交互态与移动端尺寸收敛，避免遮挡正文 |
| `js/ui/edictView.test.js` | ➕ 新增 | 为按钮显隐、点击回到底部与清理行为补充 DOM 回归测试 |

### 价值

- **长诏书历史回跳更快**：翻到旧记录后可一键回到最新内容
- **界面负担更低**：只有在仍可继续向下滚动时才显示，不会常驻遮挡正文
- **兼容现有布局**：移动端 legacy 视图和新骨架诏书页都走同一套交互

### 验证

- `npm test -- js/ui/edictView.test.js` ✅ 通过

## 2026-04-13: perf: split react views and trim initial build chunks

**Commit Hash**: `1b25a2b`

### 改动摘要

这一轮聚焦生产构建体积优化：将 React 壳层中的页面组件改为懒加载，避免所有视图同时进入首包；同时把 Vite 的分包策略收敛为稳定的 React vendor 拆分，去掉会触发循环 chunk 告警的激进手动切分。最终构建仍然通过，且原先约 550 kB 的主 JS chunk 被拆散为多个按需加载产物。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `client/src/App.jsx` | ✏️ 优化 | 将 Court / Edict / Nation / Talent / Policy / Settings / Start 等 React 视图改为 `lazy + Suspense` 按需加载，降低首包体积 |
| `vite.config.js` | ✏️ 优化 | 新增稳定的 React / React DOM vendor 分包，并移除会导致循环依赖告警的细粒度 legacy 手动分包 |

### 价值

- **首包更小**：非当前页面代码不再全部打进初始入口
- **加载路径更合理**：页面级资源随访问按需下载，而不是启动时一次性加载
- **构建更稳定**：保留有效拆分收益，同时避免循环 chunk 告警

### 验证

- `npm run build` ✅ 通过
- 构建结果从单个约 `550.56 kB` 大 chunk，收敛为多个较小 chunk；当前较大的产物主要为 `react-dom-vendor` `184.04 kB`、`EdictView` `97.81 kB`、`CourtView` `50.37 kB`

## 2026-04-13: feat: add talent recruitment and policy discussion flows

**Commit Hash**: `4a4c56e`

### 改动摘要

这一轮把朝堂扩展到“人才”与“问政”两条新流程：前端新增人才储备与廷议弹窗入口，补齐相关视图、样式、状态与 API 封装；服务端同步新增人才招募、人才召见、群臣建言接口；同时统一候选角色与在任角色的来源，确保科举、武举、延揽招募产生的人物都能参与任用、问答和回合推进。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/ui/courtView.js` `js/ui/talentView.js` `js/ui/policyView.js` `client/src/ui/views/talent/*` `client/src/ui/views/policy/*` | ➕ 新增 / ✏️ 扩展 | 朝堂页新增“人才”“问政”入口，补齐弹窗式人才储备、召见互动、廷议建言与诏令起草视图 |
| `js/systems/talentSystem.js` `js/systems/policyDiscussionSystem.js` `js/api/talentApi.js` `js/api/policyDiscussionApi.js` | ➕ 新增 | 建立人才招募、人才状态管理、政策讨论与前端 API 调用链路 |
| `server/index.js` `server/index.test.js` `vite.config.js` | ✏️ 扩展 | 新增 `/talentRecruit`、`/talentInteract`、`/ministerAdvise` 代理接口、测试与本地开发代理配置 |
| `js/state.js` `js/storage.js` `js/systems/turnSystem.js` `js/utils/characterRegistry.js` `js/utils/characterStatusRepair.js` | ✏️ 加固 | 统一候选人才、科举/武举人物与在任大臣的状态来源，处理问政待发诏令在回合推进时的拼接与清理 |
| `public/data/worldview.json` `js/worldview/talentPolicyWorldviewAdapter.js` | ➕ 新增 / ✏️ 扩展 | 为人才与问政模块补齐世界观配置入口，支撑不同称谓与语义映射 |
| `js/api/talentApi.test.js` `js/systems/talentSystem.test.js` `js/ui/talentView.test.js` `js/utils/characterStatusRepair.test.js` `server/index.test.js` 等 | ➕ 补测试 | 为人才 API、状态修复、朝堂交互与服务端新接口增加回归保护 |

### 价值

- **朝堂玩法更完整**：从现有的科举、武举继续扩展到人才储备与群臣廷议，形成更完整的人事与决策循环
- **角色流转更一致**：候选人物、已任命角色与角色状态走统一注册/修复链路，减少 UI 与状态不同步
- **联调路径更顺畅**：本地 Vite 代理和服务端接口同步补齐，便于前后端一体开发与验证

### 验证

- `npm run build` ✅ 通过

## 2026-04-09: fix: harden rigid-mode turn flow, effect normalization, and nation UI gating

**Commit Hash**: (pending)

### 改动摘要

这一轮把近期几组真实玩法问题合并收口：修复科举 / 武举放榜后跨月不重置的问题，重写多任免诏书解析避免错配，提前规范化 LLM 返回的 appointments 结构，统一钱粮别名的数值结算路径，并继续清理困难模式下国家面板与季度体系的经典残留。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `ChongzhenSim/js/systems/turnSystem.js` `ChongzhenSim/js/systems/kejuSystem.js` | ✏️ 修复 | 放榜后的科举 / 武举在月推进时自动重置，避免考务状态卡死 |
| `ChongzhenSim/js/utils/appointmentEffects.js` | ✏️ 重写 | 任免解析改为分句配对，支持多职位、多官员、连续 clause 与“着 / 仍掌 / 转任 / 兼任”等真实诏书语义 |
| `ChongzhenSim/js/api/validators.js` `ChongzhenSim/js/api/ministerChat.js` `ChongzhenSim/js/api/llmStory.js` | ✏️ 加固 | 在 API 边界更早规范化 appointments，减少名字 / ID 混用带来的二次错配 |
| `ChongzhenSim/js/utils/effectNormalization.js` `ChongzhenSim/js/utils/effectsProcessor.js` `ChongzhenSim/js/systems/storySystem.js` | ➕ 新增 / ✏️ 统一 | 把银两、现银、漕粮、存粮等别名收敛到统一 treasury / grain 结算链路，保证剧情、诏书、面板数值一致 |
| `ChongzhenSim/js/systems/coreGameplaySystem.js` `ChongzhenSim/js/api/requestContext.js` `ChongzhenSim/js/ui/nationView.js` | ✏️ 清理 | 困难模式不再保留季度议题、季度结算上下文和国家面板中的经典专属展示 |
| `ChongzhenSim/js/ui/nationView.test.js` 及相关测试文件 | ➕ 补测试 | 为考试重置、任免解析、数值归一化、困难模式季度屏蔽和国家面板隐藏经典块增加回归保护 |

### 价值

- **回合推进更稳定**：科举 / 武举不会再在放榜后卡住后续月份
- **诏书语义更可靠**：多任免文本和 LLM appointments 结构更接近真实意图
- **数值反馈更一致**：剧情、国家面板、诏书结算统一走同一条钱粮归一化路径
- **模式边界更清晰**：困难模式国家面板不再暴露经典季度体系残留

### 验证

- `npm test -- js/systems/kejuSystem.test.js js/systems/turnSystem.pipeline.test.js js/utils/appointmentEffects.test.js js/api/validators.test.js js/api/llmStory.test.js js/systems/storySystem.effects.test.js js/utils/effectsProcessor.test.js js/utils/displayStateMetrics.test.js js/systems/coreGameplaySystem.test.js js/api/requestContext.test.js js/ui/nationView.test.js` ✅ 通过（93 项）
- `npm run build` ✅ 通过

## 2026-04-09: feat: expand worldview-aware runtime and persistent browser storage

**Commit Hash**: `6df6c92`

### 改动摘要

把“世界观适配只覆盖静态数据”的现状继续往运行时推进：这次补齐了国策标题、季度议题、敌对势力、任命衍生数值、国家面板与请求上下文的世界观感知链路；同时新增浏览器持久化镜像层，让玩家配置和关键存档键即使在 `localStorage` 丢失后也能从 IndexedDB 自动恢复。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/persistentBrowserStorage.js` | ➕ 新增 | 为玩家模型配置、活跃槽位、自动存档索引和多槽位存档键建立 `localStorage + IndexedDB` 双写镜像与自动回填机制 |
| `js/persistentBrowserStorage.test.js` | ➕ 新增测试 | 验证镜像键在本地存储被清空后可从 IndexedDB 回灌恢复 |
| `js/storage.js` `js/playerRuntimeConfig.js` | ✏️ 接入 | 存档与玩家运行时配置改为走持久化封装，避免关键浏览器数据仅依赖单层 `localStorage` |
| `js/worldview/worldviewAdapter.js` `public/data/worldviewOverrides.json` | ✏️ 扩展 | 新增 `policies` 世界观覆盖层，把南宋语义映射继续扩到国策目录 |
| `js/systems/coreGameplaySystem.js` | ✏️ 扩展 | 国策目录、季度议题、敌对势力初始化与战果结算改为支持世界观与显式战斗结果联动 |
| `js/api/requestContext.js` | ✏️ 修正 | LLM 请求上下文中的 `unlockedPolicyTitles` / `unlockedPolicyTitleMap` 改为读取世界观适配后的标题 |
| `js/utils/appointmentEffects.js` | ✏️ 扩展 | 任命效果新增军职强度推导，任命/罢免会同步反映到 `militaryStrength` 等状态收益 |
| `js/systems/militarySystem.js` `js/systems/storySystem.js` `js/ui/courtView.js` `js/ui/nationView.js` | ✏️ 对齐 | 运行时展示与结算文案继续向南宋世界观语义收敛 |
| `public/data/nationInit.json` | ✏️ 调整 | 初始化敌对势力与国家面板相关基础数据继续对齐当前世界观 |
| `ChongzhenSim/世界观导入自动适配AI规范.md` | ➕ 文档 | 明确世界观导入必须覆盖动态生成入口、请求上下文和统一适配层边界 |

### 价值

- **世界观一致性更强**：UI、LLM 请求上下文和运行时派生标题不再各自看到不同语义层
- **玩法反馈更真实**：任命军职会直接反馈到军事强度，战斗结果也能明确驱动敌对势力变化
- **浏览器侧容错更高**：玩家模型配置和关键存档键在存储丢失后有自动恢复能力

### 验证

- `npm run build` ✅ 通过
- `npm test -- js/api/requestContext.test.js js/systems/coreGameplaySystem.test.js js/systems/militarySystem.test.js js/utils/appointmentEffects.test.js js/worldview/southernSongAdapter.test.js js/persistentBrowserStorage.test.js` ✅ 通过（116 项）

## 2026-04-09: fix: harden local proxy fallback for court and story flows

**Commit Hash**: `f9863c5`

### 改动摘要

补强本地开发与线上代理并存时的 API 访问策略，让剧情和朝堂相关请求在浏览器本地运行、远端 Render 服务代理、以及自定义 `ALLOWED_ORIGINS` 配置下都能更稳定地工作；同时为法庭任命接口补上本地回退，避免服务端不可达时核心交互直接中断。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/api/httpClient.js` | ✏️ 调整 | 统一本地浏览器下的 API base 选择逻辑；当配置指向 Render 远端时优先走当前 Vite 本地代理；新增 `shouldUseLlmProxy()` 供业务层复用 |
| `js/api/httpClient.test.js` | ➕ 补测试 | 覆盖 localhost 开发代理、浏览器 origin 回退、以及 LLM 代理启用条件 |
| `js/systems/storySystem.js` | ✏️ 收敛判断 | 改为复用 `shouldUseLlmProxy()`，避免剧情模块与 HTTP 客户端对代理启用条件判断不一致 |
| `js/ui/courtView.js` | ✏️ 加固 | 任命请求失败时回退到本地状态应用，并统一法庭视图重渲染入口 |
| `client/src/ui/views/court/CourtView.jsx` | ✏️ 调整 | 默认启用 legacy court layout，和当前法庭 DOM 视图挂载方式保持一致 |
| `server/index.js` | ✏️ 兼容 | 保留默认 localhost/CORS 白名单，即使外部自定义 `ALLOWED_ORIGINS` 也不会误伤本地开发预检 |
| `server/index.test.js` | ➕ 补测试 | 新增自定义允许源时 localhost 预检仍然通过的回归测试 |
| `vite.config.js` | ✏️ 调整 | 开发代理目标改为可配置，默认指向 Render 服务，并显式开启 HTTPS 代理校验 |

### 价值

- **本地联调更稳**：本地前端可通过当前 origin 代理远端 API，不再因为 `apiBase` 指向线上而绕过 Vite 代理
- **核心流程可降级**：任命接口异常时，朝堂职位调整仍可在前端本地状态中继续完成
- **环境兼容更强**：即使服务端定制了允许来源，本地 localhost 预检也不会被意外拒绝

### 验证

- `npm run build` ✅ 通过
- `npm test -- js/api/httpClient.test.js server/index.test.js` ✅ 通过（58 项）

## 2026-04-07: fix: stabilize production story requests and template fallback

**Commit Hash**: `ba9d32e`

### 改动摘要

修复上线后剧情接口在 Kurangames 域名下触发的 CORS 预检失败，并补强剧情模板回退逻辑，避免 LLM 请求失败后继续请求不存在的按年月生成静态剧情文件，导致玩家连续看到网络错误和 404。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `server/index.js` | ✏️ 更新 | 扩展默认允许来源，支持 Kurangames 生产域名及其 HTTPS 子域名通过 CORS 预检 |
| `server/index.test.js` | ➕ 补测试 | 增加生产域名 `OPTIONS` 预检通过的回归测试 |
| `js/systems/storySystem.js` | ✏️ 加固 | 将剧情模板回退改为按顺序尝试“动态年月快照 -> 基线 phase 模板”，避免缺失文件时直接报错 |
| `js/systems/storySystem.template.test.js` | ➕ 新增测试 | 锁定 LLM 回退路径与困难模式首回合模板路径 |

### 价值

- **线上可用性**：嵌入 Kurangames 域名后，前端能正常访问 Render 代理接口
- **失败可降级**：当 LLM 请求失败或超时，剧情系统会回退到可用模板而不是中断
- **回归可控**：部署域名和剧情模板路径都有自动化测试保护

### 构建验证

- `npm run build` ✅ 通过（Vite 生产构建完成）

## 2026-04-07: fix: harden public config management and deploy defaults

**Commit Hash**: (pending)

### 改动摘要

收紧公网部署下的服务端默认配置管理能力，避免公开环境暴露 `config-status` 读写入口；同时补充本地开发配置说明，并将前端默认 API 地址切到线上 Render 服务，便于部署后直接联通后端。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `.gitignore` | ✏️ 更新 | 忽略 `ChongzhenSim/server/config.json`，避免误提交本地敏感配置 |
| `public/data/config.json` | ✏️ 更新 | 默认 `apiBase` 从本地地址切换到线上 Render 服务地址 |
| `server/config.example.json` | ✏️ 补充说明 | 明确这是本地开发回退配置，不应提交真实 API Key |
| `server/index.js` | ✏️ 加固 | 新增公网/回环来源判定，默认仅允许本地环境访问和写入 `config-status` |
| `server/index.test.js` | ➕ 补测试 | 增加公网访问 `config-status` 被拒绝的测试，并为本地管理场景显式打开测试开关 |

### 价值

- **部署更安全**：公网实例默认不再暴露服务端模型配置读写入口
- **本地开发更清晰**：配置样例和接口提示明确区分开发用途与公网用途
- **上线更直接**：前端默认请求地址已对齐线上服务，减少部署后的额外手工修改

## 2026-04-06: refactor: unify start/settings views with shared UI primitives

**Commit Hash**: (pending)

### 改动摘要

为开始页和设置页补齐共享 UI 基元与主题 token，收拢原本分散的内联样式和页面私有按钮结构，作为后续持续加玩法页面时的统一骨架。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/ui/viewPrimitives.js` | ➕ 新增 | 提供 `createViewShell`、`createSectionCard`、`createActionButton`、`createInfoLine` 等轻量 DOM/UI 基元 |
| `js/ui/startView.js` | ✏️ 重构 | 开始页改为复用共享基元，移除大部分内联样式 |
| `js/ui/settingsView.js` | ✏️ 重构 | 设置页改为区块化结构，统一存档、模式、运行信息和返回操作 |
| `css/theme.css` | ✏️ 扩展 | 新增 surface、radius、spacing、transition 等主题 token |
| `css/components/common.css` | ✏️ 扩展 | 新增 view shell、section card、button、tag、info line、select 等通用样式 |
| `css/modules/edict.css` | ✏️ 调整 | 开始页保留场景化视觉，但改为建立在共享基元之上 |
| `js/ui/viewPrimitives.test.js` | ➕ 新增测试 | 锁定共享基元的结构输出，避免后续页面扩展时回归 |
| `README.md` | ✏️ 文档 | 补充 UI 维护约定，明确新增页面优先复用共享基元 |

### 价值

- **长期维护**：页面结构和交互风格有统一入口，减少“每页一套写法”
- **持续加玩法**：新玩法页可以直接复用视图骨架、区块卡片和按钮模式
- **UI 一致性**：开始页与设置页的标题、按钮、说明文案和区块层次统一
- **开发速度**：减少重复拼装 DOM 和反复写内联样式的成本

## 2026-04-03: feat: 军事系统扩展/优化/融合版本完整实现 + 75 项测试全覆盖

**Commit Hash**: (pending)

### 改动摘要

根据《骑马与砍杀2核心注意力消耗玩法模块开发文档》，系统性补全了**扩展版本、优化版本、融合版本**三阶段缺失功能，
并新增 27 项单元测试，全项目 244 条测试全部通过（原 217 → 现 244）。

### 核心改动

| 文件 | 改动 | 说明 |
|------|------|------|
| `js/systems/militarySystem.js` | ✅ 新增功能 | 扩展/优化/融合版本实现 |
| `js/systems/militarySystem.test.js` | ✅ 新增测试 | 27 项新测试，覆盖全部新特性 |

### 设计文档四阶段完成情况

| 版本 | 特性 | 状态 |
|------|------|------|
| **基础版本** | 阵型/兵种/主将基础/士气/基础野战 | ✅ 已有（48 测试） |
| **扩展版本** | 天气（雨/雪）、主将亲率+负伤、弹药耗尽、局部溃败扩散 | ✅ 本次实现 |
| **优化版本** | `UNIT_TYPES` / `FORMATIONS` 导出，支持外部 AI 调参 | ✅ 本次实现 |
| **融合版本** | 俘虏处理（`prisoners`）、战后恢复期（`recoveryDays`）写入 effectsPatch | ✅ 本次实现 |

### 新增功能详情

**扩展版本**
- `deriveWeatherFromText()` 导出：从诏书文本推断战场天气（雨/雪/晴）
- `buildInitialSession()` 新增字段：`weather`、`commanderInjured`、`ammo`、`initialEnemyCount`
- `resolveBattleRound()` 新参数 `_injuryRoll`（测试确定性）及新返回值 `commanderInjuredThisRound`、`updatedAmmo`
- 雨天：火铳哑火（攻击=0）；雪天：骑兵攻击力 ×0.6
- 主将亲率（`commanderCharge`）：全军士气+30，20% 负伤概率；负伤后指挥效率 ×0.5
- 弹药系统：`ammo.firearm` / `ammo.artillery` 每回合递减，耗尽则无法攻击
- 局部溃败扩散：有编队士气 < 30 时，友军额外受 collapsingCount×8 的士气惩罚

**优化版本**
- `UNIT_TYPES` 和 `FORMATIONS` 改为 `export const`，支持外部程序直接读取/修改数值后再战

**融合版本**
- `buildBattleEffectsPatch` 新增 `prisoners = enemyKilled × 30%`（胜利专属）
- `buildBattleEffectsPatch` 新增 `recoveryDays = casualtyRate × 30`（战后恢复期天数）
- `renderSummaryPhase` 展示歼敌数、可俘虏兵力、伤兵恢复期
- `buildImpactLines` 展示俘虏处理提示和恢复期提示


- **`.mil-overlay`** — 横向行纹（军册纸感）背景，顶部旗幡渐变彩条，右上角兵符斜边
- **`.mil-phase-title`** — 鎏金字 + 铜线底划 + 左侧菱形战旗符；胜 / 败变色
- **`.mil-section-label`** — 左侧军令竖符（暗红→铜色渐变）
- **`.mil-unit-card`** — 切角令牌clip-path，铜边 + 顶部光线
- **`.mil-formation-btn`** — 军令竹简风，左侧暗红竖条，激活态鎏金高亮
- **`.mil-decision-btn`** — 军令签，左侧4px血红条，「令」字水印，hover铜色高光
- **`.mil-status-card--player/enemy`** — 战报奏折风，顶部彩条区分我/敌
- **`.mil-battle-log`** — 军册滚动记录，细边铜色滚动条，▸ 前缀红箭标
- **`.mil-stat-card`** — 军功册格，右下角小三角勋章装饰
- **`.mil-primary-btn`** — 官印钤章风，圆形水印 + 上方金色高光线，hover 展宽字距

## 2026-03-27: feat: character death detection in appointment effects

**Commit Hash**: (pending)

### 改动摘要

为官员任免系统增加了赐死（处死）官员的检测逻辑，使得两种游戏模式（经典、困难）都能从圣旨文本中识别官员处死事件，并自动关闭相关的故事线。

### 核心改动

| 文件 | 改动 | 作用 |
|------|------|------|
| `js/utils/appointmentEffects.js` | ✏️ 新增死亡模式识别 | 1) 添加deathKeyword正则（赐死、赐予自尽、自尽、饮鸩等）；2) 近邻匹配（0-2字）防止跨句捕获；3) 返回characterDeath字段到effects对象 |
| `js/utils/appointmentEffects.test.js` | ➕ 新增2个测试 | 1) 单独赐死检测测试；2) 组合效果测试（任免+赐死混合） |

### 赐死关键词模式

```javascript
deathKeyword = /(?:赐死|赐予自尽|赐自尽|赐予|自尽|饮鸩|毒酒)/
// 近邻范围: 官员名 ±0-2字 赐死关键词
// 示例: "赐死温体仁" ✅ | "赐死 毕自严为内阁" ❌ (超出范围)
```

### 处理流程

**文本提取** → **模式识别** → **效果生成** → **状态应用**

1. `deriveAppointmentEffectsFromText()` 扫描圣旨文本
2. 近邻正则 `keyword.{0,2}name|name.{0,2}keyword` 匹配
3. 生成 `{ characterDeath: { characterId: "赐死" } }`
4. 两种模式都调用共享的 `applyEffects()`:
   - 标记官员 `isAlive = false`
   - 记录死因和日期
   - 关闭该官员相关的故事线

### 测试结果

## 2026-04-07: feat: migrate simulator to Southern Song runtime shell

**Commit Hash**: (pending)

### 改动摘要

完成一轮较大规模的题材与运行时改造：将游戏主叙事从明末崇祯朝迁移到南宋建炎年间，引入 `client/server` 启动壳与 React 外层界面，补齐玩家本地运行时模型配置入口，并新增 Fleet 工作流、无头试玩回归和世界观适配层，为后续继续扩展玩法与自动化验证打下基础。

### 核心改动

| 文件 / 目录 | 改动 | 说明 |
|------|------|------|
| `client/` | ➕ 新增 | 引入 React 启动壳、顶部/底部导航、设置页与旧 DOM 视图挂载桥接 |
| `js/main.js` `js/router.js` `js/state.js` | ✏️ 重构 | 兼容新启动方式与 React 外层壳，保留旧系统核心逻辑 |
| `js/playerRuntimeConfig.js` `client/src/bootstrap/configurationGate.js` | ➕ 新增 | 支持每个玩家在浏览器本地保存自己的 LLM 配置 |
| `server/index.js` `server/worldviewAdapter.cjs` `server/worldviewPrompt.cjs` | ✏️ 扩展 | 服务端改为支持世界观适配、动态 prompt 注入、运行时配置写入与端口兼容 |
| `public/data/*.json` `public/data/story/*.json` | ✏️ 大量改写 | 将角色、派系、开场文案、目标、事件、剧情文本整体迁移到南宋建炎叙事 |
| `public/data/worldview.json` `public/data/worldviewOverrides.json` `js/worldview/` | ➕ 新增 | 建立玩法骨架与世界观皮层分离的适配数据层 |
| `vite.config.js` `vitest.config.js` | ✏️ 调整 | 切到 `client` 为入口，补齐 React 与别名解析 |
| `scripts/headless-playtest.mjs` `scripts/verify-player-experience.mjs` | ➕ 新增 | 增加 24 回合无头试玩、跨策略回归与玩家体验验证脚本 |
| `.fleet/` `scripts/fleet-runner.mjs` `scripts/fleetRunnerCore.mjs` | ➕ 新增 | 新增 Fleet 三段式工作流与 PR/阶段报告生成能力 |
| `server/index.test.js` `js/testing/` `client/src/**/*.test.js` | ➕ 扩展测试 | 为配置门禁、世界观适配、无头试玩和新前端启动层补测试 |

### 价值

- **题材迁移完成度更高**：静态数据、剧情文本、服务端提示词与角色语义已同步迁移到南宋建炎背景
- **架构更清晰**：形成 `client/server` 启动壳 + 旧玩法核心并存的渐进式迁移路径
- **玩家配置更安全**：模型 Key 改为每位玩家在本地浏览器持有，不再强依赖单份服务端配置
- **自动化验证更强**：新增无头 24 回合体验回归、多策略回归和 Fleet 流程化报告
- **后续扩展更稳**：世界观适配层与共享 UI/视图桥接让继续加玩法、换题材、做验证都更可维护

✅ 7/7 appointmentEffects测试通过  
✅ 169/169 全套测试通过（无回归）  
✅ 经典模式：LLM生成的圣旨现支持赐死提取  
✅ 困难模式：规则引擎生成的效果现支持赐死检测

### 关键设计决策

**近邻限制0-2字**: 允许"赐死 官名"但阻止跨标点如"赐死；任命新官"

---

## 2026-03-27: refactor: unified and merged metrics for rigid/classic modes

**Commit Hash**: (pending)

### 改动摘要

完全重构国家界面的数值展示系统，实现困难模式和经典模式的指标合并、单位统一和面板优化：
- 统一困难模式财务数据单位（国库、内帑）为"两"单位，与经典模式保持一致
- 修复困难模式数值显示中的小数问题，确保所有指标为整数
- 隐藏困难模式下的"大明国势"和"朝局总览"两个面板
- 在困难模式下新建"崇祯·大明国势"面板，整合19项关键指标
- 经典模式保留原有的"大明国势"和"朝局总览"两个面板

### 核心文件改动

| 文件 | 改动 | 作用 |
|------|------|------|
| `js/utils/displayStateMetrics.js` | ✏️ 修改指标定义 + 数值转换逻辑 | 1) rigidTreasury/rigidInnerFund改用treasury格式；2) getDisplayMetricValue中对rigid财务数据×10000转换；3) formatDisplayMetricValue确保所有值四舍五入为整数 |
| `js/ui/nationView.js` | ✏️ 改造面板渲染逻辑 | 1) classic模式显示原有两个面板；2) rigid模式隐藏这两个面板，新建合并面板；3) 合并面板包含5项分类、19个指标 |

### 困难模式新面板结构："崇祯·大明国势"

**财务状况** (4项):
- 💰 国库 (rigidTreasury × 10000 = 两)
- 🪙 内帑 (rigidInnerFund × 10000 = 两)
- 📉 军饷拖欠 (rigidMilitaryArrears)
- 📜 官俸拖欠 (rigidOfficialArrears)

**国家形势** (4项):
- 👥 民心 (civilMorale)
- 🛡️ 边患 (borderThreat)
- 🌪️ 天灾 (disasterLevel)
- 🧾 贪腐 (corruptionLevel)

**军事力量** (3项):
- ⚔️ 辽东兵力 (rigidLiaoDongTroops)
- 🪖 辽东军心 (rigidLiaoDongMorale)
- 🚨 流寇规模 (rigidRebelScale)

**朝廷局势** (4项):
- 👑 权威 (rigidAuthority)
- ⚖️ 党争 (rigidFactionFight)
- 🧱 阻力 (rigidResistance)
- 📌 封驳次数 (rigidRefuteTimes)

**皇帝状态** (5项):
- 😰 焦虑 (rigidAnxiety)
- 🌙 失眠 (rigidInsomnia)
- 🕵️ 暴露风险 (rigidExposureRisk)
- 🗡️ 暗杀风险 (rigidAssassinateRisk)
- 🫥 疑心 (rigidDistrust)

### 关键修复

✅ **单位统一**: 困难模式财务数据从"万两"缩放→"两"，与经典模式国库单位一致
✅ **小数修复**: 所有指标通过Math.round()确保为整数，不显示.5这样的小数
✅ **面板优化**: rigid模式只显示一个统一的综合面板，减少UI冗余
✅ **去重复**: 合并了重复的"党争"等指标，优先使用rigid版本

### 数据流

```
rigid state: finance.treasury (30)
    ↓ × 10000
经典单位: 300000 两
    ↓ 
formatTreasury() → "300,000两"
    ↓
UI显示
```

### 测试结果

✅ 所有165个测试通过
✅ 无语法错误
✅ 向后兼容：经典模式界面不变

---

## 2026-03-27: refactor: separate execution constraints from narrative display

**Commit Hash**: de2cc57

### 改动摘要

系统约束信息从 UI 显示分离，改由 ExecutionConstraint 机制处理：
- 这些信息现在作为"系统推理约束"传入 LLM，而非直接显示给玩家
- 与困难模式记忆锚点同级，共同形成"推理约束链"

### 核心文件改动

| 文件 | 改动 | 作用 |
|------|------|------|
| `js/rigid/memory.js` | +3 函数 | `createExecutionConstraint()`, `appendExecutionConstraint()`, `getLatestExecutionConstraint()` |
| `js/rigid/engine.js` | 导入新函数、集成调用 | 每回合生成并保存约束快照 |
| `js/api/requestContext.js` | +1 字段 | `body.rigid.latestExecutionConstraint` for LLM |
| `js/rigid/moduleComposer.js` | Module2 精简 | 8 字段 → 3 字段，移除系统信息字段 |
| `js/rigid/config.js` | +1 字段 | `executionConstraints: []` 初始化 |
| `js/rigid/moduleComposer.test.js` | 更新测试 | 适应 3-字段结构 |

### 数据流

```
决策完成 
  ↓
createExecutionConstraint() → 包含执行率、封驳、阈值等
  ↓
appendExecutionConstraint() → 存入 state.rigid.executionConstraints
  ↓
buildStoryRequestBody() → latestExecutionConstraint 传入 LLM
  ↓
UI 故事显示 ← 仅显示叙述 (Module2: 开篇、圣断、自述)
```

### 测试结果

- ✅ 159/159 tests passing
- ✅ 无遗漏、无回归

### 设计提升

1. **关注点分离**: 系统信息 vs. 故事叙述
2. **LLM 约束完整**: 执行折扣 + 记忆链 + 阈值触发
3. **UI 清洁**: 不显示内部机制数字

---

## 记忆锚点 + 执行约束 = 完整的推理约束链

- **记忆锚点**: 过去的状态快照 (turn, year, month, risk values)
- **执行约束**: 本回合的结果快照 (execution rates, refute status, triggered events)
- **LLM 接收**: 两者都在请求体中，形成"约束链"
- **UI 显示**: 仅故事叙述，约束信息用于 LLM 推理而非展示

---

## 2026-03-26 以来变更补全（精简版，含文件）

### 2026-03-26 · 0d9349c76f1b42f9993e050533671a3b6d9ff559
- 摘要：处理冲突相关提交。
- 改动文件：
  - `.gitignore`

### 2026-03-26 · 06a813a0cbd5551a1db768bad28ff6f0414bb311
- 摘要：武举/任命规则联动、角色池扩充与寿命调整、剧情上下文压缩与本地约束、敌对势力复活链路。
- 改动文件：
  - `ChongzhenSim/data/characters.json`
  - `ChongzhenSim/js/api/llmStory.js`
  - `ChongzhenSim/js/api/requestContext.js`
  - `ChongzhenSim/js/api/validators.js`
  - `ChongzhenSim/js/api/validators.test.js`
  - `ChongzhenSim/js/main.js`
  - `ChongzhenSim/js/state.js`
  - `ChongzhenSim/js/systems/coreGameplaySystem.js`
  - `ChongzhenSim/js/systems/kejuSystem.js`
  - `ChongzhenSim/js/systems/storySystem.js`
  - `ChongzhenSim/js/systems/turnSystem.js`
  - `ChongzhenSim/js/ui/courtView.js`
  - `ChongzhenSim/js/ui/edictView.js`
  - `ChongzhenSim/js/utils/appointmentEffects.js`
  - `ChongzhenSim/js/utils/characterArchetype.js`
  - `ChongzhenSim/js/utils/displayStateMetrics.js`
  - `ChongzhenSim/js/utils/storyFacts.js`
  - `ChongzhenSim/js/utils/storyParser.js`
  - `ChongzhenSim/js/utils/storyRenderer.js`
  - `ChongzhenSim/scripts/expand_characters_temp.js`
  - `ChongzhenSim/scripts/refine_new_characters_temp.js`
  - `ChongzhenSim/server/index.js`

### 2026-03-27 · 652afacf79fa9dc086b4bb36fe023865424da2c8
- 摘要：困难模式开场链路修复（点击无响应）、独立时间线与规则链路修正。
- 改动文件：
  - `ChongzhenSim/css/theme.css`
  - `ChongzhenSim/data/config.json`
  - `ChongzhenSim/data/rigidHistoryEvents.json`
  - `ChongzhenSim/data/rigidInitialState.json`
  - `ChongzhenSim/data/rigidTriggers.json`
  - `ChongzhenSim/data/story/hard_mode_day1_morning.json`
  - `ChongzhenSim/js/api/requestContext.js`
  - `ChongzhenSim/js/api/requestContext.test.js`
  - `ChongzhenSim/js/main.js`
  - `ChongzhenSim/js/rigid/config.js`
  - `ChongzhenSim/js/rigid/decisionCheck.js`
  - `ChongzhenSim/js/rigid/engine.js`
  - `ChongzhenSim/js/rigid/engine.test.js`
  - `ChongzhenSim/js/rigid/history.js`
  - `ChongzhenSim/js/rigid/mechanisms.js`
  - `ChongzhenSim/js/rigid/memory.js`
  - `ChongzhenSim/js/rigid/moduleComposer.js`
  - `ChongzhenSim/js/rigid/moduleComposer.test.js`
  - `ChongzhenSim/js/rigid/settlement.js`
  - `ChongzhenSim/js/rigid/valueCheck.js`
  - `ChongzhenSim/js/state.js`
  - `ChongzhenSim/js/storage.js`
  - `ChongzhenSim/js/systems/storySystem.js`
  - `ChongzhenSim/js/systems/turnSystem.js`
  - `ChongzhenSim/js/systems/turnSystem.pipeline.test.js`
  - `ChongzhenSim/js/ui/settingsView.js`
  - `ChongzhenSim/js/ui/startView.js`
  - `ChongzhenSim/js/utils/displayStateMetrics.js`
  - `ChongzhenSim/js/utils/displayStateMetrics.test.js`
  - `ChongzhenSim/困难模式设计文档.md`
  - `ChongzhenSim/经典模式与困难模式对比文档.md`

### 2026-03-27 · ba864fe6f2beb754ee984c7182ff4faf8dd8a624
- 摘要：修复 `hard_mode_day1_morning.json` 的 JSON 语法错误。
- 改动文件：
  - `ChongzhenSim/data/story/hard_mode_day1_morning.json`

### 2026-03-27 · de2cc5782512132d8c30c5913c3f2605c30b04a5
- 摘要：将执行约束从叙事展示中拆分，改为 LLM 推理约束链输入。
- 改动文件：
  - `ChongzhenSim/js/api/requestContext.js`
  - `ChongzhenSim/js/rigid/config.js`
  - `ChongzhenSim/js/rigid/engine.js`
  - `ChongzhenSim/js/rigid/memory.js`
  - `ChongzhenSim/js/rigid/moduleComposer.js`
  - `ChongzhenSim/js/rigid/moduleComposer.test.js`

### 当前未提交改动（工作区）
- 摘要：动态选项兜底、国势面板合并优化、任免/赐死效果与资源估算增强、科举候选生成默认逻辑调整、相关测试同步。
- 改动文件：
  - `ChongzhenSim/js/rigid/engine.js`
  - `ChongzhenSim/js/rigid/engine.test.js`
  - `ChongzhenSim/js/rigid/moduleComposer.js`
  - `ChongzhenSim/js/systems/kejuSystem.js`
  - `ChongzhenSim/js/systems/kejuSystem.test.js`
  - `ChongzhenSim/js/systems/storySystem.js`
  - `ChongzhenSim/js/systems/turnSystem.js`
  - `ChongzhenSim/js/systems/turnSystem.pipeline.test.js`
  - `ChongzhenSim/js/ui/courtView.js`
  - `ChongzhenSim/js/ui/nationView.js`
  - `ChongzhenSim/js/utils/appointmentEffects.js`
  - `ChongzhenSim/js/utils/appointmentEffects.test.js`
  - `ChongzhenSim/js/utils/displayStateMetrics.js`
  - `ChongzhenSim/经典模式与困难模式对比文档.md`

---

## 2026-03-28: chore: ignore 模式设计文档并整理提交

**Commit Hash**: (pending)

### 改动摘要

- 将困难模式设计文档与经典/困难模式对比文档加入 `.gitignore`。
- 从 Git 索引移除以上两个文档（保留本地文件），后续不再参与版本控制。
- 合并提交当前工作区内的困难模式链路优化、数值展示与测试更新。

### 改动文件

- `.gitignore`
- `ChongzhenSim/困难模式设计文档.md`（从索引移除）
- `ChongzhenSim/经典模式与困难模式对比文档.md`（从索引移除）
- `ChongzhenSim/js/rigid/engine.js`
- `ChongzhenSim/js/rigid/engine.test.js`
- `ChongzhenSim/js/rigid/moduleComposer.js`
- `ChongzhenSim/js/systems/kejuSystem.js`
- `ChongzhenSim/js/systems/kejuSystem.test.js`
- `ChongzhenSim/js/systems/storySystem.js`
- `ChongzhenSim/js/systems/turnSystem.js`
- `ChongzhenSim/js/systems/turnSystem.pipeline.test.js`
- `ChongzhenSim/js/ui/courtView.js`
- `ChongzhenSim/js/ui/nationView.js`
- `ChongzhenSim/js/utils/appointmentEffects.js`
- `ChongzhenSim/js/utils/appointmentEffects.test.js`
- `ChongzhenSim/js/utils/displayStateMetrics.js`

---

## 2026-03-28: chore: ignore 科举功能模块文档

**Commit Hash**: (pending)

### 改动摘要

- 将根目录 `科举功能模块.md` 加入 `.gitignore`。
- 清理该文档的版本跟踪，避免后续再次误入提交。
- 补充本次补救提交记录。

### 改动文件

- `.gitignore`
- `科举功能模块.md`（停止跟踪）
- `commit.md`
