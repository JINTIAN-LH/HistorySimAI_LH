import {
  buildPlayerRuntimeConfigStatus,
  getPlayerRuntimeConfig,
  savePlayerRuntimeConfig,
} from "@legacy/playerRuntimeConfig.js";

export async function fetchConfigStatus() {
  return buildPlayerRuntimeConfigStatus();
}

export async function saveRuntimeConfig(values) {
  const payload = {
    ...(values && typeof values === "object" ? values : {}),
  };

  if (!String(payload.LLM_API_KEY || "").trim()) {
    const current = getPlayerRuntimeConfig();
    if (current?.llmApiKey) {
      payload.LLM_API_KEY = current.llmApiKey;
    }
  }

  savePlayerRuntimeConfig(payload);
  return buildPlayerRuntimeConfigStatus();
}
