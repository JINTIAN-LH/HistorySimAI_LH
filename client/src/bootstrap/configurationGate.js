import {
  buildPlayerRuntimeConfigStatus,
  savePlayerRuntimeConfig,
} from "@legacy/playerRuntimeConfig.js";

export async function fetchConfigStatus() {
  return buildPlayerRuntimeConfigStatus();
}

export async function saveRuntimeConfig(values) {
  savePlayerRuntimeConfig(values);
  return buildPlayerRuntimeConfigStatus();
}
