const PLAYER_RUNTIME_CONFIG_STORAGE_KEY = "history_sim_player_llm_config_v1";

const DEFAULT_LLM_API_BASE = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_LLM_MODEL = "glm-4-flash";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRuntimeConfig(raw) {
  const apiKey = trimString(raw?.LLM_API_KEY ?? raw?.llmApiKey);
  const apiBase = trimString(raw?.LLM_API_BASE ?? raw?.llmApiBase) || DEFAULT_LLM_API_BASE;
  const model = trimString(raw?.LLM_MODEL ?? raw?.llmModel) || DEFAULT_LLM_MODEL;
  const chatModel = trimString(raw?.LLM_CHAT_MODEL ?? raw?.llmChatModel) || model;

  return {
    llmApiKey: apiKey,
    llmApiBase: apiBase.replace(/\/$/, ""),
    llmModel: model,
    llmChatModel: chatModel,
  };
}

export function getPlayerRuntimeConfig() {
  if (!canUseStorage()) {
    return normalizeRuntimeConfig(null);
  }

  const raw = window.localStorage.getItem(PLAYER_RUNTIME_CONFIG_STORAGE_KEY);
  if (!raw) {
    return normalizeRuntimeConfig(null);
  }

  try {
    return normalizeRuntimeConfig(JSON.parse(raw));
  } catch (_error) {
    return normalizeRuntimeConfig(null);
  }
}

export function savePlayerRuntimeConfig(nextValues) {
  const normalized = normalizeRuntimeConfig(nextValues);
  if (!normalized.llmApiKey) {
    throw new Error("LLM_API_KEY is required");
  }

  if (!canUseStorage()) {
    throw new Error("当前浏览器不支持本地存储，无法保存玩家模型配置。");
  }

  window.localStorage.setItem(PLAYER_RUNTIME_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function buildPlayerRuntimeConfigStatus() {
  const runtime = getPlayerRuntimeConfig();
  return {
    ready: !!runtime.llmApiKey,
    storageLabel: "当前浏览器本地存储",
    fields: {
      LLM_API_KEY: {
        configured: !!runtime.llmApiKey,
        masked: runtime.llmApiKey ? `已填写（尾号 ${runtime.llmApiKey.slice(-4)}）` : "",
        required: true,
      },
      LLM_API_BASE: {
        value: runtime.llmApiBase,
        required: true,
      },
      LLM_MODEL: {
        value: runtime.llmModel,
        required: true,
      },
      LLM_CHAT_MODEL: {
        value: runtime.llmChatModel,
        required: false,
      },
    },
    tips: [
      "这份配置只保存在你自己的浏览器里，不会写入公共服务器。",
      "后续 AI 推理会带着你的 key 发到代理服务，由你自己的模型账户承担费用。",
    ],
  };
}

export function mergePlayerRuntimeConfig(config) {
  return {
    ...(config && typeof config === "object" ? config : {}),
    ...getPlayerRuntimeConfig(),
  };
}

export function stripPlayerRuntimeConfig(config) {
  if (!config || typeof config !== "object") {
    return config;
  }

  const {
    llmApiKey: _ignoredApiKey,
    llmApiBase: _ignoredApiBase,
    llmModel: _ignoredModel,
    llmChatModel: _ignoredChatModel,
    ...rest
  } = config;

  return rest;
}
