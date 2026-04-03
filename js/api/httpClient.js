export function getApiBase(config, logTag) {
  const apiBase = (config?.apiBase || "").replace(/\/$/, "");
  if (!apiBase) {
    console.error(`${logTag} apiBase not configured`);
    return "";
  }
  return apiBase;
}

export async function postJsonAndReadText(url, payload, logTag) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
