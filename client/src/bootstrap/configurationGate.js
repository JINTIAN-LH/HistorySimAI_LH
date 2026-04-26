import {
  buildPlayerRuntimeConfigStatus,
  getPlayerRuntimeConfig,
  savePlayerRuntimeConfig,
} from "@legacy/playerRuntimeConfig.js";
import { getState, setState } from "@legacy/state.js";

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

  const saved = savePlayerRuntimeConfig(payload);

  // Sync saved config into runtime state so subsequent LLM requests
  // use the new parameters immediately without page reload.
  const currentConfig = getState().config || {};
  setState({
    config: {
      ...currentConfig,
      llmApiKey: saved.llmApiKey,
      llmApiBase: saved.llmApiBase,
      llmModel: saved.llmModel,
      llmChatModel: saved.llmChatModel,
    },
  });

  return buildPlayerRuntimeConfigStatus();
}
