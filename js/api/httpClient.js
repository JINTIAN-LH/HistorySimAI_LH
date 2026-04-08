function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function getBrowserFallbackApiBase() {
  if (typeof window === "undefined" || !window.location) {
    return "";
  }

  const { origin, protocol, hostname, port } = window.location;
  const safeOrigin = String(origin || "").replace(/\/$/, "");
  const isLocalHost = isLoopbackHost(hostname);

  if (isLocalHost && port !== "3002") {
    return safeOrigin;
  }

  return safeOrigin;
}

function shouldUseBrowserProxyForConfiguredBase(configuredApiBase) {
  if (typeof window === "undefined" || !window.location || !configuredApiBase) {
    return false;
  }

  if (!isLoopbackHost(window.location.hostname)) {
    return false;
  }

  try {
    const targetUrl = new URL(configuredApiBase);
    if (isLoopbackHost(targetUrl.hostname)) {
      return false;
    }
    return /(^|\.)onrender\.com$/i.test(targetUrl.hostname);
  } catch (_error) {
    return false;
  }
}

export function getApiBase(config, logTag) {
  const configuredApiBase = (config?.apiBase || "").replace(/\/$/, "");
  if (configuredApiBase) {
    if (shouldUseBrowserProxyForConfiguredBase(configuredApiBase)) {
      const fallbackApiBase = getBrowserFallbackApiBase();
      if (fallbackApiBase) {
        return fallbackApiBase;
      }
    }
    return configuredApiBase;
  }

  const fallbackApiBase = getBrowserFallbackApiBase();
  if (fallbackApiBase) {
    return fallbackApiBase;
  }

  console.error(`${logTag} apiBase not configured`);
  return "";
}

export function shouldUseLlmProxy(config, logTag) {
  return (config?.storyMode || "template") === "llm" && !!getApiBase(config, logTag);
}

export function buildLlmProxyHeaders(config) {
  const headers = {};

  if (typeof config?.llmApiKey === "string" && config.llmApiKey.trim()) {
    headers["X-LLM-API-Key"] = config.llmApiKey.trim();
  }
  if (typeof config?.llmApiBase === "string" && config.llmApiBase.trim()) {
    headers["X-LLM-API-Base"] = config.llmApiBase.trim().replace(/\/$/, "");
  }
  if (typeof config?.llmModel === "string" && config.llmModel.trim()) {
    headers["X-LLM-Model"] = config.llmModel.trim();
  }
  if (typeof config?.llmChatModel === "string" && config.llmChatModel.trim()) {
    headers["X-LLM-Chat-Model"] = config.llmChatModel.trim();
  }

  return headers;
}

export async function postJsonAndReadText(url, payload, logTag, options = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error(`${logTag} fetch error`, e);
    return null;
  }

  let text;
  try {
    text = await res.text();
  } catch (e) {
    console.error(`${logTag} read body error`, e);
    return null;
  }

  if (!res.ok) {
    console.error(`${logTag} non-ok`, res.status, text);
    return null;
  }

  return text;
}
