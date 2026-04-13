/**
 * 人才与问政玩法的世界观映射层
 *
 * 从 worldview.json / worldviewOverrides 中读取 talentConfig / policyConfig，
 * 返回标准化的配置对象；缺省时使用通用兜底值，确保任意世界观都能运行。
 */

const DEFAULT_TALENT_CONFIG = {
  tabLabel: "人才",
  tabIcon: "🎓",
  viewTitle: "人才储备",
  viewSubtitle: "广纳贤才，择优任用",
  recruitLabel: "招募",
  recruitTypes: {
    imperial_exam: "科举",
    recommend: "举荐",
    search: "寻访",
  },
  qualityLabels: {
    ordinary: "普通",
    excellent: "优秀",
    epic: "传奇",
  },
  abilityFields: {
    military: "武略",
    politics: "政务",
    economy: "经济",
    culture: "文化",
  },
  rulerTitle: "主上",
  talentNoun: "臣僚",
  poolLabel: "候选人才",
  interactVerb: "交谈",
  appointVerb: "任用",
  trainVerb: "培养",
  recruitCostResource: "prestige",
  recruitCostLabel: "声望",
};

const DEFAULT_POLICY_CONFIG = {
  tabLabel: "问政",
  tabIcon: "📋",
  viewTitle: "廷议",
  viewSubtitle: "兼听则明，广询臣工",
  sessionLabel: "廷议",
  edictLabel: "诏令",
  issueLabel: "议题",
  ministerLabel: "臣工",
  adviceLabel: "建言",
  rulerTitle: "主上",
  askVerb: "询问",
  issueVerb: "下令",
  supportLabel: "赞同",
  opposeLabel: "反对",
  neutralLabel: "中立",
  historyLabel: "往议记录",
};

function mergeConfig(defaults, override) {
  if (!override || typeof override !== "object") return { ...defaults };
  const out = { ...defaults };
  Object.keys(defaults).forEach((key) => {
    const val = override[key];
    if (val == null) return;
    if (typeof defaults[key] === "object" && !Array.isArray(defaults[key])) {
      out[key] = { ...defaults[key], ...(typeof val === "object" ? val : {}) };
    } else {
      out[key] = val;
    }
  });
  return out;
}

/**
 * 从世界观数据中提取人才玩法配置。
 * @param {Object} worldviewData - worldview.json 内容（可含 talentConfig 字段）
 * @param {Object} [worldviewOverrides] - worldviewOverrides.json 内容（可含 talentConfig 字段）
 * @returns {Object} 标准化人才配置
 */
export function getTalentWorldviewConfig(worldviewData = {}, worldviewOverrides = {}) {
  const base = mergeConfig(DEFAULT_TALENT_CONFIG, worldviewData?.talentConfig);
  return mergeConfig(base, worldviewOverrides?.talentConfig);
}

/**
 * 从世界观数据中提取问政玩法配置。
 * @param {Object} worldviewData - worldview.json 内容（可含 policyConfig 字段）
 * @param {Object} [worldviewOverrides] - worldviewOverrides.json 内容（可含 policyConfig 字段）
 * @returns {Object} 标准化问政配置
 */
export function getPolicyWorldviewConfig(worldviewData = {}, worldviewOverrides = {}) {
  const base = mergeConfig(DEFAULT_POLICY_CONFIG, worldviewData?.policyConfig);
  return mergeConfig(base, worldviewOverrides?.policyConfig);
}

/**
 * 从游戏当前 state 中快速获取人才配置（通过 state.config.worldviewData 路径）。
 * 若未配置则返回默认值。
 */
export function getTalentConfigFromState(state) {
  return getTalentWorldviewConfig(
    state?.config?.worldviewData,
    state?.config?.worldviewOverrides
  );
}

/**
 * 从游戏当前 state 中快速获取问政配置。
 */
export function getPolicyConfigFromState(state) {
  return getPolicyWorldviewConfig(
    state?.config?.worldviewData,
    state?.config?.worldviewOverrides
  );
}

/**
 * 为 LLM prompt 构建人才招募系统提示语，完全基于世界观配置，不硬编码任何朝代名词。
 */
export function buildTalentSystemPromptFromConfig(talentCfg, policyWorldview) {
  const ruler = talentCfg.rulerTitle || "主上";
  const noun = talentCfg.talentNoun || "臣僚";
  const fields = Object.entries(talentCfg.abilityFields || {})
    .map(([, v]) => v)
    .join("、");
  const qualities = Object.entries(talentCfg.qualityLabels || {})
    .map(([k, v]) => `${k}=${v}`)
    .join("，");
  return [
    `你是一个历史模拟游戏的人才生成引擎。`,
    `当前世界观：${policyWorldview?.title || "历史世界"}。`,
    `${ruler}需要招募${noun}，能力维度包括：${fields}。`,
    `人才品质档次：${qualities}。`,
    `请根据当前局势与招募方式，生成3位候选${noun}，贴合世界观历史背景。`,
    `只输出合法 JSON：{"talents":[{"id":"string","name":"string","quality":"ordinary|excellent|epic","field":"military|politics|economy|culture","ability":{"military":0,"politics":0,"economy":0,"culture":0,"loyalty":0},"personality":"string","faction":"string","background":"string","openingLine":"string"}]}`,
    `id 用下划线英文，name/background/openingLine 使用中文，符合历史语境。`,
    `openingLine 是候选${noun}首次见到${ruler}时说的话，需体现性格与立场。`,
  ].join("\n");
}

/**
 * 为 LLM prompt 构建人才交互系统提示语。
 */
export function buildTalentInteractSystemPrompt(talent, talentCfg) {
  const ruler = talentCfg?.rulerTitle || "主上";
  const abilityFields = talentCfg?.abilityFields || {};
  const abilityDesc = Object.entries(talent?.ability || {})
    .filter(([k]) => k !== "loyalty")
    .map(([k, v]) => `${abilityFields[k] || k}=${v}`)
    .join("，");
  return [
    `你现在是 ${talent.name || "臣僚"}（性格：${talent.personality || "未知"}，派系：${talent.faction || "中立"}）。`,
    `你的能力：${abilityDesc}，忠诚度=${talent.ability?.loyalty ?? 50}/100。`,
    `你与${ruler}交谈时，言辞须与性格、立场相符，语气古雅，贴合历史世界观。`,
    `只输出合法 JSON：{"reply":"string","loyaltyDelta":0,"attitude":"string","suggestion":null}`,
    `suggestion 仅在对方明确询问策略建议时才填写：{"content":"string","effect":"string"}，否则为 null。`,
    `loyaltyDelta 范围 -5 到 +5；attitude 为当前情绪状态（恭敬/不满/坚定/犹豫/激昂等）。`,
  ].join("\n");
}

/**
 * 为 LLM prompt 构建大臣建言系统提示语。
 */
export function buildMinisterAdviseSystemPrompt(policyCfg, worldviewTitle) {
  const ruler = policyCfg?.rulerTitle || "主上";
  const noun = policyCfg?.ministerLabel || "臣工";
  const adviceLabel = policyCfg?.adviceLabel || "建言";
  return [
    `你是《${worldviewTitle || "历史模拟器"}》朝堂议政顾问。`,
    `${ruler}发起廷议，你需要为2-3位${noun}分别生成有区别度的${adviceLabel}。`,
    `每位${noun}的观点须贴合其性格、派系、专长，且互有异同，体现朝堂分歧。`,
    `只输出合法 JSON：`,
    `{"advices":[{"ministerId":"string","ministerName":"string","faction":"string","attitude":"support|oppose|neutral","content":"string","reason":"string","estimatedCost":{"silver":0,"grain":0},"estimatedEffects":{"militaryStrength":0,"civilMorale":0,"treasury":0,"borderThreat":0,"other":"string"}}],"summary":"string"}`,
    `attitude 只可取 support/oppose/neutral；summary 为${ruler}视角的建言总括（50字以内）。`,
    `所有文字使用中文，符合历史语境，避免现代词语。`,
  ].join("\n");
}
