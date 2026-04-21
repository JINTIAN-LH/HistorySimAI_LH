function toNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function cloneObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value };
}

function mergeRecord(base, override) {
  const out = cloneObject(base);
  const patch = cloneObject(override);
  Object.keys(patch).forEach((key) => {
    const next = patch[key];
    const prev = out[key];
    if (Array.isArray(next)) {
      out[key] = next.slice();
      return;
    }
    if (next && typeof next === "object") {
      out[key] = mergeRecord(prev, next);
      return;
    }
    out[key] = next;
  });
  return out;
}

function toStringArray(value, fallback = []) {
  if (!Array.isArray(value)) return fallback.slice();
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return normalized.length ? normalized : fallback.slice();
}

function getWorldviewSection(state, sectionKey) {
  const worldviewData = state?.config?.worldviewData || {};
  const worldviewOverrides = state?.config?.worldviewOverrides || {};
  return mergeRecord(worldviewData?.[sectionKey], worldviewOverrides?.[sectionKey]);
}

function fillPattern(pattern, values) {
  return String(pattern || "").replace(/\{(\w+)\}/g, (_m, key) => {
    const value = values?.[key];
    return value == null ? "" : String(value);
  });
}

function formatChronicleYearValue(year) {
  const normalized = Math.max(1, Number(year) || 1);
  return normalized === 1 ? "元" : normalized;
}

function normalizeChronicleFormat(state) {
  const section = getWorldviewSection(state, "chronicleFormat");
  const eraLabel = toNonEmptyString(section.eraLabel) || "建炎";
  const yearUnit = toNonEmptyString(section.yearUnit) || "年";
  const monthUnit = toNonEmptyString(section.monthUnit) || "月";
  const displayPattern = toNonEmptyString(section.displayPattern) || "{era}{year}{yearUnit}{month}{monthUnit}";
  const fallbackPattern = toNonEmptyString(section.fallbackPattern) || "第{year}{yearUnit}{month}{monthUnit}";
  return {
    eraLabel,
    yearUnit,
    monthUnit,
    displayPattern,
    fallbackPattern,
  };
}

export function isCustomWorldviewActive(state) {
  return Boolean(state?.config?.worldviewOverrides);
}

export function resolveWorldviewEraInfo(state) {
  const worldviewData = state?.config?.worldviewData || {};
  const worldviewOverrides = state?.config?.worldviewOverrides || {};
  const chronicle = normalizeChronicleFormat(state);
  const eraLabel =
    toNonEmptyString(worldviewData.eraLabel)
    || toNonEmptyString(worldviewOverrides.eraLabel)
    || chronicle.eraLabel
    || "建炎";
  const absoluteStartYear = Number(state?.config?.absoluteStartYear);

  return {
    eraLabel,
    absoluteStartYear: Number.isFinite(absoluteStartYear) ? absoluteStartYear : 1627,
  };
}

export function formatEraTimeByAbsoluteYear(state, absoluteYear, month) {
  const { eraLabel, absoluteStartYear } = resolveWorldviewEraInfo(state);
  const chronicle = normalizeChronicleFormat(state);
  const normalizedYear = Number(absoluteYear) || absoluteStartYear;
  const normalizedMonth = Number(month) || 1;
  const eraYear = Math.max(1, normalizedYear - absoluteStartYear + 1);
  const eraYearDisplay = formatChronicleYearValue(eraYear);
  const rendered = fillPattern(chronicle.displayPattern, {
    era: eraLabel,
    year: eraYearDisplay,
    month: normalizedMonth,
    yearUnit: chronicle.yearUnit,
    monthUnit: chronicle.monthUnit,
  });
  return toNonEmptyString(rendered)
    || `${eraLabel}${eraYearDisplay}${chronicle.yearUnit}${normalizedMonth}${chronicle.monthUnit}`;
}

export function formatEraTimeByRelativeYear(state, relativeYear, month) {
  const { eraLabel } = resolveWorldviewEraInfo(state);
  const chronicle = normalizeChronicleFormat(state);
  const normalizedYear = Math.max(1, Number(relativeYear) || 1);
  const normalizedYearDisplay = formatChronicleYearValue(normalizedYear);
  const normalizedMonth = Number(month) || 1;
  const rendered = fillPattern(chronicle.displayPattern, {
    era: eraLabel,
    year: normalizedYearDisplay,
    month: normalizedMonth,
    yearUnit: chronicle.yearUnit,
    monthUnit: chronicle.monthUnit,
  });
  return toNonEmptyString(rendered)
    || `${eraLabel}${normalizedYearDisplay}${chronicle.yearUnit}${normalizedMonth}${chronicle.monthUnit}`;
}

export function resolveWorldviewBattleLabels(state) {
  const worldviewData = state?.config?.worldviewData || {};
  const worldviewOverrides = state?.config?.worldviewOverrides || {};
  const militaryLabels = worldviewOverrides?.militaryLabels || worldviewData?.militaryLabels || {};
  const rulerTitle =
    toNonEmptyString(worldviewData?.playerRole?.title)
    || toNonEmptyString(state?.player?.title)
    || "朝廷";

  return {
    playerForceLabel: toNonEmptyString(militaryLabels.playerForceLabel) || `${rulerTitle}军`,
    hostileTrendLabel: toNonEmptyString(militaryLabels.hostileTrendLabel) || "敌军态势",
  };
}

export function resolveWorldviewSemanticLabels(state) {
  const worldviewData = state?.config?.worldviewData || {};
  const worldviewOverrides = state?.config?.worldviewOverrides || {};
  const semanticLabels = worldviewOverrides?.semanticLabels || worldviewData?.semanticLabels || {};

  const defaultNorthernAliases = ["北方敌军", "江北敌军", "北境强敌"];
  const defaultRebelAliases = ["地方叛军", "流寇", "流民军", "兵乱", "叛军"];
  const defaultDengzhouAliases = ["登州叛军", "叛军"];

  return {
    primaryHostileName: toNonEmptyString(semanticLabels.primaryHostileName) || "北方敌军",
    northernHostileAliases: toStringArray(semanticLabels.northernHostileAliases, defaultNorthernAliases),
    rebelForceAliases: toStringArray(semanticLabels.rebelForceAliases, defaultRebelAliases),
    dengzhouRebelAliases: toStringArray(semanticLabels.dengzhouRebelAliases, defaultDengzhouAliases),
  };
}

export function resolveWorldviewStartPageCopy(state) {
  const section = getWorldviewSection(state, "startPageCopy");
  return {
    heroTitle: toNonEmptyString(section.heroTitle),
    heroSubtitle: toNonEmptyString(section.heroSubtitle),
    startButtonLabel: toNonEmptyString(section.startButtonLabel) || "临朝执政",
    continueButtonLabel: toNonEmptyString(section.continueButtonLabel) || "继续",
  };
}

export function resolveWorldviewStartIntroLines(state) {
  const section = getWorldviewSection(state, "startPageCopy");
  return toStringArray(section.introLines);
}

export function resolveWorldviewOpeningTurn(state) {
  const section = getWorldviewSection(state, "openingTurn");
  const choices = Array.isArray(section.openingChoices) ? section.openingChoices : [];
  const normalizedChoices = choices
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const label = toNonEmptyString(item.label);
      if (!label) return null;
      return {
        id: toNonEmptyString(item.id) || `OPENING_${index + 1}`,
        label,
        summary: toNonEmptyString(item.summary),
      };
    })
    .filter(Boolean);
  return {
    briefingTitle: toNonEmptyString(section.briefingTitle),
    briefingLines: toStringArray(section.briefingLines),
    openingChoices: normalizedChoices,
  };
}

export function resolveWorldviewCourtViewCopy(state) {
  const section = getWorldviewSection(state, "courtViewCopy");
  return {
    headerTitle: toNonEmptyString(section.headerTitle) || "朝堂总览",
    headerSubtitle: toNonEmptyString(section.headerSubtitle),
    quickActionLabel: toNonEmptyString(section.quickActionLabel) || "快捷入口",
    emptyStateText: toNonEmptyString(section.emptyStateText),
  };
}

export function resolveWorldviewPolicyTreeCopy(state) {
  const section = getWorldviewSection(state, "policyTreeCopy");
  const branchLabels = cloneObject(section.branchLabels);
  return {
    treeTitle: toNonEmptyString(section.treeTitle) || "国策树",
    treeSubtitle: toNonEmptyString(section.treeSubtitle),
    branchLabels,
  };
}

export function resolveWorldviewRulerAbilityCopy(state) {
  const section = getWorldviewSection(state, "rulerAbilityCopy");
  const abilityLabels = cloneObject(section.abilityLabels);
  return {
    panelTitle: toNonEmptyString(section.panelTitle) || "皇帝能力",
    abilityLabels,
    abilityHint: toNonEmptyString(section.abilityHint),
  };
}

export function resolveWorldviewWorldEventCopy(state) {
  const section = getWorldviewSection(state, "worldEventCopy");
  const severityLabels = cloneObject(section.severityLabels);
  return {
    sectionTitle: toNonEmptyString(section.sectionTitle) || "天下大事",
    emptyStateText: toNonEmptyString(section.emptyStateText) || "暂无奏报，推进剧情后将产生新的军国大事。",
    severityLabels,
  };
}

export function resolveWorldviewPublicOpinionCopy(state) {
  const section = getWorldviewSection(state, "publicOpinionCopy");
  return {
    sectionTitle: toNonEmptyString(section.sectionTitle) || "民间舆论",
    positiveLabel: toNonEmptyString(section.positiveLabel) || "民心向治",
    neutralLabel: toNonEmptyString(section.neutralLabel) || "观望未定",
    negativeLabel: toNonEmptyString(section.negativeLabel) || "民议汹汹",
    emptyStateText: toNonEmptyString(section.emptyStateText) || "暂无民间舆论。",
  };
}

export function resolveWorldviewUiSurfaceCopy(state) {
  const section = getWorldviewSection(state, "uiSurfaceCopy");
  const policy = cloneObject(section.policy);
  const edict = cloneObject(section.edict);
  const court = cloneObject(section.court);

  return {
    policy: {
      inputPlaceholder: toNonEmptyString(policy.inputPlaceholder) || "输入具体问题，或点击上方议题快速填入…",
      followupPlaceholder: toNonEmptyString(policy.followupPlaceholder) || "就此议题进一步垂询…",
      emptyQuestionError: toNonEmptyString(policy.emptyQuestionError) || "请先输入或选择议题。",
      emptyEdictError: toNonEmptyString(policy.emptyEdictError) || "诏令内容不得为空。",
      askFailedError: toNonEmptyString(policy.askFailedError) || "廷议失败，请稍后重试。",
      followupFailedError: toNonEmptyString(policy.followupFailedError) || "追问失败，请稍后重试。",
      issueFailedError: toNonEmptyString(policy.issueFailedError) || "颁旨失败，请稍后重试。",
      issueSuccess: toNonEmptyString(policy.issueSuccess) || "诏旨已拟定，待你本轮选择旨意时一并生效。",
      closeSessionLabel: toNonEmptyString(policy.closeSessionLabel) || "结束廷议",
      summaryPrefix: toNonEmptyString(policy.summaryPrefix) || "综议：",
      adoptAdviceLabel: toNonEmptyString(policy.adoptAdviceLabel) || "采纳此议",
      followupLabel: toNonEmptyString(policy.followupLabel) || "继续追问群臣：",
      followupButtonLabel: toNonEmptyString(policy.followupButtonLabel) || "追问",
      followupBusyLabel: toNonEmptyString(policy.followupBusyLabel) || "议…",
      historyTitle: toNonEmptyString(policy.historyTitle) || "历次廷议",
    },
    edict: {
      pageTitle: toNonEmptyString(edict.pageTitle) || "诏书中枢",
      pageSubtitle: toNonEmptyString(edict.pageSubtitle) || "将剧情正文、诏令选择、奏报与自拟诏书入口固定在统一玩法骨架内，后续主玩法扩展继续沿用这一页模板。",
      actionsTitle: toNonEmptyString(edict.actionsTitle) || "诏令选择",
      actionsHint: toNonEmptyString(edict.actionsHint) || "固定保留选择区与自拟诏书入口，季度议题锁定后也在这里继续操作。",
      dataTitle: toNonEmptyString(edict.dataTitle) || "奏报与回响",
      dataHint: toNonEmptyString(edict.dataHint) || "把新闻流和舆论反馈固定在数据区，减少主玩法页面的信息漂移。",
      mainTitle: toNonEmptyString(edict.mainTitle) || "诏书正文",
      mainHint: toNonEmptyString(edict.mainHint) || "正文区继续承载历史记录、当回合文本、批注和数值反馈。",
    },
    court: {
      kejuPanelTitle: toNonEmptyString(court.kejuPanelTitle) || "科举大典",
      kejuPanelSubtitle: toNonEmptyString(court.kejuPanelSubtitle) || "统一弹窗骨架后，文官选拔、待录用推荐与后续人才系统都走同一套面板结构。",
      wujuPanelTitle: toNonEmptyString(court.wujuPanelTitle) || "武举",
      wujuPanelSubtitle: toNonEmptyString(court.wujuPanelSubtitle) || "统一朝堂人才弹窗骨架，武举与科举共享同类信息布局与操作区。",
      talentPanelTitle: toNonEmptyString(court.talentPanelTitle) || "人才储备",
      talentPanelSubtitle: toNonEmptyString(court.talentPanelSubtitle) || "延揽招募与职位任用，同科举武举共用弹窗结构。",
      policyPanelTitle: toNonEmptyString(court.policyPanelTitle) || "问政廷议",
      policyPanelSubtitle: toNonEmptyString(court.policyPanelSubtitle) || "廷议群臣、建言采纳与诏令起草，统一弹窗骨架。",
      appointByPositionSubtitle: toNonEmptyString(court.appointByPositionSubtitle) || "统一任命类弹窗骨架，后续扩展筛选、排序与推荐逻辑时不再重复写外层结构。",
      appointByMinisterSubtitle: toNonEmptyString(court.appointByMinisterSubtitle) || "统一任命弹窗骨架，官员与官职两种调整路径沿用同一外层模板。",
      appointLegacySubtitle: toNonEmptyString(court.appointLegacySubtitle) || "统一老任命路径的弹窗骨架，保留现有角色筛选与确认逻辑。",
      positionSelectSubtitle: toNonEmptyString(court.positionSelectSubtitle) || "统一官职选择弹窗骨架，保持任命与调岗流程使用同一套外层结构。",
      ministerDetailSubtitle: toNonEmptyString(court.ministerDetailSubtitle) || "统一详情弹窗骨架，内部仍保留头像、忠诚、态度与转岗入口。",
      factionPanelSubtitle: toNonEmptyString(court.factionPanelSubtitle) || "统一派系弹窗骨架，后续可继续接入派系成员、忠诚与党争信息。",
      ministerPanelSubtitle: toNonEmptyString(court.ministerPanelSubtitle) || "统一群臣列表弹窗骨架，保留点击人物进入奏对与详情的现有流转。",
      unknownError: toNonEmptyString(court.unknownError) || "未知错误",
      appointFailedPrefix: toNonEmptyString(court.appointFailedPrefix) || "任命失败: ",
      adjustFailedPrefix: toNonEmptyString(court.adjustFailedPrefix) || "调整失败: ",
      kejuStartSuccess: toNonEmptyString(court.kejuStartSuccess) || "乡试已开启，考生名单已入册。",
      kejuHuishiSuccess: toNonEmptyString(court.kejuHuishiSuccess) || "会试候选名单已生成。",
      kejuDianshiSuccess: toNonEmptyString(court.kejuDianshiSuccess) || "殿试候选名单已生成。",
      kejuPublishSuccess: toNonEmptyString(court.kejuPublishSuccess) || "殿试放榜完成。",
      kejuReserveSavedSuccess: toNonEmptyString(court.kejuReserveSavedSuccess) || "已写入待录用名单。",
      kejuEntryAppliedSuccess: toNonEmptyString(court.kejuEntryAppliedSuccess) || "科举入仕已生效。",
      officeAppointmentAppliedSuccess: toNonEmptyString(court.officeAppointmentAppliedSuccess) || "官职任免已生效",
      positionOccupiedRegenerateError: toNonEmptyString(court.positionOccupiedRegenerateError) || "该官职已有人在任，请重新生成推荐名单。",
      positionOccupiedRegenerateSimpleError: toNonEmptyString(court.positionOccupiedRegenerateSimpleError) || "该官职已有人在任，请重新生成名单。",
      candidateDeadCannotAppointError: toNonEmptyString(court.candidateDeadCannotAppointError) || "该人物已故，无法任命。",
      candidateDeadCannotAdjustError: toNonEmptyString(court.candidateDeadCannotAdjustError) || "该人物已故，无法调岗。",
      candidateDeadCannotGrantError: toNonEmptyString(court.candidateDeadCannotGrantError) || "该人物已故，无法授予官职。",
      ministerDeadCannotDiscussError: toNonEmptyString(court.ministerDeadCannotDiscussError) || "该人物已故，无法继续议事。请返回朝堂。",
    },
  };
}