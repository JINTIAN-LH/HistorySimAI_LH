const defaultWorldviewData = require("../public/data/worldview.json");

const BASE_STORY_PROMPT_LINES = [
  "每回合你必须只输出一个合法 JSON 对象，且结构中包含 header、storyParagraphs、choices。",
  "若涉及任命或处置，请写入 lastChoiceEffects.appointments / lastChoiceEffects.characterDeath。",
  "必须严格遵循传入的朝堂快照：已故角色不得复活、任职或作为在任官员出现；未在任角色不得被称作在任。",
  "已灭亡敌对势力不得在后续剧情中“复活”为完整存活势力。",
  "剧情、旁白、选项文案、提示必须使用中文，不得出现英文国策ID（如 civil_tax_reform）或英文句子。"
];

function normalizePromptLines(value) {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function buildStorySystemPrompt(worldviewData = defaultWorldviewData) {
  const storyPrompt = worldviewData && typeof worldviewData === "object" && worldviewData.storyPrompt && typeof worldviewData.storyPrompt === "object"
    ? worldviewData.storyPrompt
    : {};
  const role = typeof storyPrompt.role === "string" && storyPrompt.role.trim()
    ? storyPrompt.role.trim()
    : "你是模拟器游戏的剧情写手。";

  return [
    role,
    ...BASE_STORY_PROMPT_LINES,
    ...normalizePromptLines(storyPrompt.worldview),
    ...normalizePromptLines(storyPrompt.gameplayConstraints),
  ].join("\n");
}

module.exports = {
  defaultWorldviewData,
  buildStorySystemPrompt,
};