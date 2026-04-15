const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { adaptCharactersData, adaptPositionsData } = require("./worldviewAdapter.cjs");
const { buildStorySystemPrompt } = require("./worldviewPrompt.cjs");

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:3000",
  "http://localhost:3002",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3002",
  "https://api.kurangames.com",
  "https://funloom.kurangames.com",
];

const DEFAULT_ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i,
  /^https?:\/\/(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(:\d+)?$/i,
  /^https:\/\/([a-z0-9-]+\.)?kurangames\.com$/i,
];

const REQUEST_TIMEOUT_MS = 60000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 200;

const TALENT_RECRUIT_PROFILES = {
  imperial_exam: {
    talentSource: "科举、荐举、太学与州县贡举",
    profileHint: "重点生成经义、策论、吏治见长的士人，主体应是文官苗子。可少量出现兼擅理财者，但不要把边将、游侠、隐士作为主流。",
    fieldBias: "能力倾向以 politics、culture 为主，economy 可作辅项，military 仅少量点缀。",
    tagHint: "标签优先体现清议、经术、治政、理财、馆阁、州县历练。",
  },
  recommend: {
    talentSource: "地方征辟、幕府举荐、官员保举与乡里名望",
    profileHint: "重点生成被地方官、将领或士绅举荐的人才，来源可以是幕僚、能吏、理财手、熟悉军政之才，不要全部写成科举出身。",
    fieldBias: "能力倾向以 politics、economy 为主，可混入少量 military 强项，用于体现实务型人才。",
    tagHint: "标签优先体现举荐、幕僚、能吏、理财、镇抚、地方历练。",
  },
  search: {
    talentSource: "民间寻访、山林隐逸、边地奇士、江湖游历与异才访求",
    profileHint: "重点生成隐士、边才、奇谋之士、工匠型或游历型人物，气质应明显区别于科举文士，禁止把三分之二以上人物写成科举士子。",
    fieldBias: "能力分布可偏 military、economy 或 culture 的偏科型奇才，允许个性更强、履历更异。",
    tagHint: "标签优先体现寻访、隐逸、边才、奇谋、游历、异士、匠作。",
  },
};

function readJsonSafely(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writeJsonSafely(filePath, value) {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(filePath, payload, "utf8");
}

function isLoopbackHost(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function extractHostname(input) {
  if (!input) return "";
  try {
    return new URL(input).hostname || "";
  } catch (_) {
    const raw = String(input || "").trim();
    const withoutPort = raw.split(":")[0];
    return withoutPort;
  }
}

function normalizeAllowedOrigins(value) {
  const merged = new Set(DEFAULT_ALLOWED_ORIGINS);

  if (Array.isArray(value)) {
    value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .forEach((item) => merged.add(item));
    return Array.from(merged);
  }

  if (typeof value === "string") {
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => merged.add(item));
    return Array.from(merged);
  }

  return Array.from(merged);
}

function isAllowedCorsOrigin(origin, allowedOrigins, allowedOriginPatterns) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return allowedOriginPatterns.some((pattern) => pattern.test(origin));
}

function createApp(options = {}) {
  const app = express();
  
  const allowedOrigins = normalizeAllowedOrigins(options.allowedOrigins || process.env.ALLOWED_ORIGINS);
  const allowedOriginPatterns = Array.isArray(options.allowedOriginPatterns) && options.allowedOriginPatterns.length
    ? options.allowedOriginPatterns
    : DEFAULT_ALLOWED_ORIGIN_PATTERNS;
  
  app.use(cors({ 
    origin: (origin, callback) => {
      if (isAllowedCorsOrigin(origin, allowedOrigins, allowedOriginPatterns)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }));
  app.use(express.json({ limit: "1mb" }));

  const configPath = options.configPath || path.join(__dirname, "config.json");
  const charactersPath = options.charactersPath || path.join(__dirname, "..", "public", "data", "characters.json");
  const positionsPath = options.positionsPath || path.join(__dirname, "..", "public", "data", "positions.json");
  const worldviewPath = options.worldviewPath || path.join(__dirname, "..", "public", "data", "worldview.json");
  const worldviewOverrides = options.worldviewOverrides && typeof options.worldviewOverrides === "object"
    ? options.worldviewOverrides
    : undefined;
  const worldviewData = options.worldviewData || readJsonSafely(worldviewPath) || {};

  let config = options.config || readJsonSafely(configPath) || {};
  if (!options.config && !Object.keys(config).length && !options.allowMissingConfig) {
    console.warn("未找到 server/config.json 或格式错误。服务将以无默认模型配置启动；公网玩家仍可通过请求级模型配置游玩。");
  }

  const charactersData = options.charactersData || adaptCharactersData(readJsonSafely(charactersPath), worldviewOverrides);
  const positionsData = options.positionsData || adaptPositionsData(readJsonSafely(positionsPath), worldviewOverrides);

  function normalizeRequestHeaderValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function getRuntimeConfig(req) {
    const currentConfig = config && typeof config === "object" ? config : {};
    const requestApiKey = normalizeRequestHeaderValue(req?.get?.("X-LLM-API-Key"));
    const requestApiBase = normalizeRequestHeaderValue(req?.get?.("X-LLM-API-Base"));
    const requestModel = normalizeRequestHeaderValue(req?.get?.("X-LLM-Model"));
    const requestChatModel = normalizeRequestHeaderValue(req?.get?.("X-LLM-Chat-Model"));
    const apiKey = requestApiKey || String(currentConfig.LLM_API_KEY || "").trim();
    const apiBase = (requestApiBase || String(currentConfig.LLM_API_BASE || "https://open.bigmodel.cn/api/paas/v4").trim()).replace(/\/$/, "");
    const model = requestModel || String(currentConfig.LLM_MODEL || "glm-4-flash").trim() || "glm-4-flash";
    const chatModel = requestChatModel || String(currentConfig.LLM_CHAT_MODEL || model || "glm-4-flash").trim() || model || "glm-4-flash";
    return {
      apiKey,
      apiBase,
      model,
      chatModel,
    };
  }

  function buildConfigStatusPayload() {
    const runtime = getRuntimeConfig();
    return {
      ready: !!runtime.apiKey,
      configPath,
      fields: {
        LLM_API_KEY: {
          configured: !!runtime.apiKey,
          masked: runtime.apiKey ? `已填写（尾号 ${runtime.apiKey.slice(-4)}）` : "",
          required: true,
        },
        LLM_API_BASE: {
          value: runtime.apiBase,
          required: true,
        },
        LLM_MODEL: {
          value: runtime.model,
          required: true,
        },
        LLM_CHAT_MODEL: {
          value: runtime.chatModel,
          required: false,
        },
      },
      tips: [
        "这是本地开发用的服务端默认配置入口，不面向公网玩家开放。",
        "公开部署时，推荐让玩家通过请求级模型配置使用自己的 API Key。",
      ],
    };
  }

  function isConfigManagementEnabled(req) {
    if (options.allowConfigManagement === true) {
      return true;
    }

    if (String(process.env.ENABLE_SERVER_CONFIG_STATUS || "").trim().toLowerCase() === "true") {
      return true;
    }

    const forwardedFor = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim().replace(/^::ffff:/, "");
    if (forwardedFor) {
      return isLoopbackHost(forwardedFor);
    }

    const host = extractHostname(req?.get?.("host"));
    if (host) {
      return isLoopbackHost(host);
    }

    const originHost = extractHostname(req?.get?.("origin"));
    if (originHost) {
      return isLoopbackHost(originHost);
    }

    const refererHost = extractHostname(req?.get?.("referer"));
    if (refererHost) {
      return isLoopbackHost(refererHost);
    }

    const ip = String(req?.ip || req?.socket?.remoteAddress || "").replace(/^::ffff:/, "");
    if (isLoopbackHost(ip)) {
      return true;
    }

    return false;
  }

  function rejectPublicConfigManagement(res) {
    return res.status(403).json({
      error: "config-status is disabled for public deployments",
    });
  }

  function getCharacters() {
    return (charactersData && (charactersData.characters || charactersData.ministers)) || [];
  }

  function getCharactersWithStateExtras(state) {
    const merged = new Map();
    getCharacters().forEach((item) => {
      if (item?.id) merged.set(item.id, item);
    });
    const extras = Array.isArray(state?.extraCharacters) ? state.extraCharacters : [];
    extras.forEach((item) => {
      if (item?.id) merged.set(item.id, item);
    });
    return Array.from(merged.values());
  }

  function getPositions() {
    return (positionsData && positionsData.positions) || [];
  }

  function getDepartments() {
    return (positionsData && positionsData.departments) || [];
  }

  function getRanks() {
    const positions = getPositions();
    return Array.from(new Set(positions.map((p) => p.rank).filter(Boolean)));
  }

  function getAliveStatus(state, characterId) {
    return state?.characterStatus?.[characterId]?.isAlive !== false;
  }

  function sanitizeMinisterReplyText(reply, deceasedList) {
    if (typeof reply !== "string" || !reply.trim()) return reply;
    const deceasedNames = (Array.isArray(deceasedList) ? deceasedList : [])
      .map((item) => (typeof item?.name === "string" ? item.name.trim() : ""))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    if (!deceasedNames.length) return reply;

    let output = reply;
    const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    deceasedNames.forEach((name) => {
      const pattern = new RegExp(escapeRegex(name), "g");
      output = output.replace(pattern, "旧臣");
    });

    return output;
  }

  function escapeRegExp(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildUnlockedPolicyLabelMap(body) {
    const ids = Array.isArray(body?.unlockedPolicies)
      ? body.unlockedPolicies.filter((id) => typeof id === "string" && id.trim())
      : [];
    const titleMap = body?.unlockedPolicyTitleMap && typeof body.unlockedPolicyTitleMap === "object"
      ? body.unlockedPolicyTitleMap
      : {};
    const titles = Array.isArray(body?.unlockedPolicyTitles)
      ? body.unlockedPolicyTitles.map((item) => String(item || "").trim())
      : [];

    const map = {};
    ids.forEach((id, index) => {
      const mapped = typeof titleMap[id] === "string" && titleMap[id].trim()
        ? titleMap[id].trim()
        : (titles[index] || "");
      map[id] = mapped || id;
    });
    return map;
  }

  function replacePolicyIdsInText(text, policyLabelMap) {
    if (typeof text !== "string" || !text) return text;
    let output = text;
    const entries = Object.entries(policyLabelMap || {})
      .filter(([id, label]) => typeof id === "string" && id && typeof label === "string" && label)
      .sort((a, b) => b[0].length - a[0].length);

    entries.forEach(([id, label]) => {
      const pattern = new RegExp(`\\b${escapeRegExp(id)}\\b`, "g");
      output = output.replace(pattern, label);
    });
    return output;
  }

  function sanitizeStoryPayloadLanguage(payload, policyLabelMap) {
    if (!payload || typeof payload !== "object") return payload;
    const next = { ...payload };

    if (Array.isArray(next.storyParagraphs)) {
      next.storyParagraphs = next.storyParagraphs.map((line) => replacePolicyIdsInText(line, policyLabelMap));
    }

    if (Array.isArray(next.choices)) {
      next.choices = next.choices.map((choice) => {
        if (!choice || typeof choice !== "object") return choice;
        const updated = { ...choice };
        ["text", "hint", "title", "description"].forEach((key) => {
          if (typeof updated[key] === "string") {
            updated[key] = replacePolicyIdsInText(updated[key], policyLabelMap);
          }
        });
        return updated;
      });
    }

    if (typeof next.news === "string") next.news = replacePolicyIdsInText(next.news, policyLabelMap);
    if (typeof next.publicOpinion === "string") next.publicOpinion = replacePolicyIdsInText(next.publicOpinion, policyLabelMap);
    return next;
  }

  function getDefeatedHostilesFromBody(body) {
    const list = Array.isArray(body?.hostileForces)
      ? body.hostileForces
      : (Array.isArray(body?.state?.hostileForces) ? body.state.hostileForces : []);
    return list
      .filter((item) => item && (item.isDefeated || (typeof item.power === "number" && item.power <= 0)))
      .map((item) => ({
        id: String(item.id || ""),
        name: String(item.name || "").trim(),
        leader: String(item.leader || "").trim(),
      }));
  }

  function sanitizeDefeatedHostileText(text, defeatedHostiles) {
    if (typeof text !== "string" || !text.trim()) return text;
    let output = text;
    const escapeRegex = (input) => String(input || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const aliases = [];
    defeatedHostiles.forEach((item) => {
      [item.name, item.leader].forEach((alias) => {
        const raw = String(alias || "").trim();
        if (raw) aliases.push(raw);
      });
    });

    Array.from(new Set(aliases)).sort((a, b) => b.length - a.length).forEach((alias) => {
      const pattern = new RegExp(escapeRegex(alias), "g");
      output = output.replace(pattern, (match, offset, source) => {
        const nextSlice = source.slice(offset, offset + match.length + 8);
        const prevSlice = source.slice(Math.max(0, offset - 4), offset + match.length);
        if (/已灭|覆灭|已亡|既灭|已剿|已被剿/.test(nextSlice) || /已灭|覆灭|已亡|既灭|已剿|已被剿/.test(prevSlice)) {
          return match;
        }
        return `${match}余部`;
      });
    });

    return output;
  }

  function sanitizeStoryPayloadConsistency(payload, body) {
    if (!payload || typeof payload !== "object") return payload;
    const defeatedHostiles = getDefeatedHostilesFromBody(body);
    if (!defeatedHostiles.length) return payload;

    const next = { ...payload };
    const defeatedAliasSet = new Set();
    defeatedHostiles.forEach((item) => {
      [item.id, item.name, item.leader].forEach((alias) => {
        const raw = String(alias || "").trim();
        if (raw) defeatedAliasSet.add(raw);
      });
    });

    if (Array.isArray(next.storyParagraphs)) {
      next.storyParagraphs = next.storyParagraphs.map((line) => sanitizeDefeatedHostileText(line, defeatedHostiles));
    }

    if (Array.isArray(next.choices)) {
      next.choices = next.choices.map((choice) => {
        if (!choice || typeof choice !== "object") return choice;
        const updated = { ...choice };
        ["text", "hint", "title", "description"].forEach((key) => {
          if (typeof updated[key] === "string") {
            updated[key] = sanitizeDefeatedHostileText(updated[key], defeatedHostiles);
          }
        });
        if (updated.effects && typeof updated.effects === "object" && !Array.isArray(updated.effects)) {
          const effects = { ...updated.effects };
          if (effects.hostileDamage && typeof effects.hostileDamage === "object" && !Array.isArray(effects.hostileDamage)) {
            const hostileDamage = {};
            Object.entries(effects.hostileDamage).forEach(([targetId, delta]) => {
              if (defeatedAliasSet.has(String(targetId || "").trim())) return;
              hostileDamage[targetId] = delta;
            });
            effects.hostileDamage = hostileDamage;
          }
          updated.effects = effects;
        }
        return updated;
      });
    }

    if (typeof next.news === "string") next.news = sanitizeDefeatedHostileText(next.news, defeatedHostiles);
    if (typeof next.publicOpinion === "string") next.publicOpinion = sanitizeDefeatedHostileText(next.publicOpinion, defeatedHostiles);
    return next;
  }

  function getSeasonByMonth(month) {
    const m = Number(month) || 1;
    if (m >= 3 && m <= 5) return "春";
    if (m >= 6 && m <= 8) return "夏";
    if (m >= 9 && m <= 11) return "秋";
    return "冬";
  }

  function buildUserMessage(body) {
    const {
      state = {},
      lastChoiceId,
      lastChoiceText,
      courtChatSummary,
      unlockedPolicies = [],
      customPolicies = [],
      hostileForces = [],
      closedStorylines = [],
      storyFacts = null,
    } = body || {};

    const day = state.currentDay ?? 1;
    const year = state.currentYear ?? 1;
    const month = state.currentMonth ?? 1;
    const phase = state.currentPhase ?? "morning";
    const phaseLabel = phase === "morning" ? "早朝" : phase === "afternoon" ? "午后" : "夜间";
    const season = getSeasonByMonth(month);
    const weather = state.weather || "未记载";

    const nation = state.nation || {};
    const treasury = nation.treasury ?? 0;
    const grain = nation.grain ?? 0;
    const militaryStrength = nation.militaryStrength ?? 50;
    const civilMorale = nation.civilMorale ?? 50;
    const borderThreat = nation.borderThreat ?? 50;
    const disasterLevel = nation.disasterLevel ?? 50;
    const corruptionLevel = nation.corruptionLevel ?? 50;

    const treasuryStatus = treasury >= 5000000 ? "极度充裕" : treasury >= 1000000 ? "充裕" : treasury >= 300000 ? "一般" : treasury >= 100000 ? "紧张" : "极度空虚";

    const nationStr = `国库=${treasury.toLocaleString()}两（${treasuryStatus}）, 粮储=${grain.toLocaleString()}石, 军力=${militaryStrength}, 民心=${civilMorale}, 边患=${borderThreat}, 天灾=${disasterLevel}, 贪腐=${corruptionLevel}`;
    const timeContext = `当前是建炎${year}年${month}月（第${day}回合）${phaseLabel}，季节=${season}，天气=${weather}。国势：${nationStr}。`;

    let base = "";
    if (lastChoiceId == null || lastChoiceText == null) {
      base = `${timeContext}这是新开档第一回合，请生成完整剧情与 3 个选项，并在 header 中提供 time、season、weather。`;
    } else {
      const isCustomEdict = lastChoiceId === "custom_edict";
      const hint = isCustomEdict
        ? "上一回合是自拟诏书，请在 lastChoiceEffects 中体现执行效果。"
        : "上一回合是预设选项，请推演执行效果。";
      base = `${timeContext}上一回合陛下选择了：id=${lastChoiceId}，文案="${lastChoiceText}"。${hint} 请在 header 中提供 time、season、weather。`;
    }

    const ministers = getCharacters();
    const positions = getPositions();
    const positionById = new Map((Array.isArray(positions) ? positions : []).map((p) => [String(p.id || ""), p]));
    const ministerById = new Map((Array.isArray(ministers) ? ministers : []).map((m) => [String(m.id || ""), m]));
    const appointments = state.appointments && typeof state.appointments === "object" ? state.appointments : {};

    if (Array.isArray(ministers) && ministers.length) {
      const positionNameByHolder = {};
      Object.entries(appointments).forEach(([positionId, characterId]) => {
        if (typeof characterId !== "string" || !characterId.trim()) return;
        const position = positionById.get(String(positionId || ""));
        if (!position?.name) return;
        if (!getAliveStatus(state, characterId)) return;
        positionNameByHolder[characterId] = position.name;
      });
      const ministerList = ministers.map((m) => {
        const dynamicRole = positionNameByHolder[m.id] || m.role || "未任官职";
        return `${m.id}（${m.name}，${dynamicRole}）`;
      }).join("、");
      base += `\n\n当前大臣 id 与名字对应：${ministerList}`;
    }

    const activeAppointments = Object.entries(appointments)
      .filter(([positionId, characterId]) => {
        if (!positionById.has(String(positionId || ""))) return false;
        if (typeof characterId !== "string" || !characterId.trim()) return false;
        return getAliveStatus(state, characterId);
      })
      .map(([positionId, characterId]) => {
        const pos = positionById.get(String(positionId || ""));
        const minister = ministerById.get(String(characterId || ""));
        return {
          positionId,
          positionName: pos?.name || positionId,
          characterId,
          characterName: minister?.name || characterId,
        };
      });

    const inOfficeIds = new Set(activeAppointments.map((item) => item.characterId));
    const aliveNotInOffice = (Array.isArray(ministers) ? ministers : [])
      .filter((m) => m && m.id && getAliveStatus(state, m.id) && !inOfficeIds.has(m.id))
      .map((m) => ({ id: m.id, name: m.name }));

    const deceasedMinisters = (Array.isArray(ministers) ? ministers : [])
      .filter((m) => m && m.id && !getAliveStatus(state, m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        reason: state?.characterStatus?.[m.id]?.deathReason || "已故",
      }));

    base += `\n\n朝堂任职快照（推理硬约束）：在任且在世=${JSON.stringify(activeAppointments)}；在世未任=${JSON.stringify(aliveNotInOffice)}；已故=${JSON.stringify(deceasedMinisters)}。请保持称谓与任职状态一致。`;
    const hostiles = Array.isArray(hostileForces) ? hostileForces : [];
    if (hostiles.length) {
      const activeHostiles = hostiles
        .filter((item) => item && !item.isDefeated && !(typeof item.power === "number" && item.power <= 0))
        .map((item) => ({
          id: item.id,
          name: item.name,
          leader: item.leader,
          power: item.power,
        }));
      const defeatedHostiles = hostiles
        .filter((item) => item && (item.isDefeated || (typeof item.power === "number" && item.power <= 0)))
        .map((item) => ({
          id: item.id,
          name: item.name,
          leader: item.leader,
          defeatedYear: item.defeatedYear || null,
          defeatedMonth: item.defeatedMonth || null,
        }));
      base += `\n\n敌对势力快照（推理硬约束）：存活=${JSON.stringify(activeHostiles)}；已灭亡=${JSON.stringify(defeatedHostiles)}。已灭亡势力不可复活为存活势力，只可描述余部、流寇或后续影响。`;
    }
    if (Array.isArray(closedStorylines) && closedStorylines.length) {
      base += `\n\n已闭锁剧情线（硬约束）：${JSON.stringify(closedStorylines.slice(-40))}。闭锁剧情线不得反向重开。`;
    }
    if (storyFacts && typeof storyFacts === "object") {
      const hardFacts = Array.isArray(storyFacts.hardFacts) ? storyFacts.hardFacts.slice(0, 24) : [];
      if (hardFacts.length) {
        base += `\n\n本地压缩关键事实（高优先级约束）：${JSON.stringify(hardFacts)}。`;
      }
    }
    const officialPositionNames = (Array.isArray(positions) ? positions : [])
      .map((item) => String(item?.name || "").trim())
      .filter(Boolean);
    if (officialPositionNames.length) {
      base += `\n\n官职标准名录（剧情文本与选项中若出现官职称谓，必须优先使用以下标准名，避免近义混写）：${officialPositionNames.join("、")}。`;
    }

    const unlocked = Array.isArray(unlockedPolicies) ? unlockedPolicies.filter((id) => typeof id === "string" && id.trim()) : [];
    const unlockedPolicyLabelMap = buildUnlockedPolicyLabelMap(body);
    const unlockedDisplay = unlocked.map((id) => unlockedPolicyLabelMap[id] || id);
    const custom = Array.isArray(customPolicies)
      ? customPolicies
        .map((item) => (item && typeof item === "object" ? String(item.name || item.title || item.id || "").trim() : ""))
        .filter(Boolean)
      : [];
    if (unlockedDisplay.length || custom.length) {
      const unlockedText = unlockedDisplay.length ? unlockedDisplay.join("、") : "无";
      const customText = custom.length ? custom.join("、") : "无";
      base += `\n\n已实施国策（纳入全局推理）：国策树=${unlockedText}；自定义国策=${customText}。请在剧情、选项和数值推演中综合考虑其持续影响，并且所有输出文案必须为中文。`;
    }

    if (courtChatSummary && typeof courtChatSummary === "string" && courtChatSummary.trim()) {
      base += `\n\n（以下为陛下与大臣的私下议事记录）\n${courtChatSummary.trim()}`;
    }

    return base;
  }

  app.get("/api/chongzhen/config-status", (req, res) => {
    if (!isConfigManagementEnabled(req)) {
      return rejectPublicConfigManagement(res);
    }
    return res.json(buildConfigStatusPayload());
  });

  app.post("/api/chongzhen/config-status", (req, res) => {
    if (!isConfigManagementEnabled(req)) {
      return rejectPublicConfigManagement(res);
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const nextApiKey = String(body.LLM_API_KEY || "").trim();
    const nextApiBase = String(body.LLM_API_BASE || "").trim() || "https://open.bigmodel.cn/api/paas/v4";
    const nextModel = String(body.LLM_MODEL || "").trim() || "glm-4-flash";
    const nextChatModel = String(body.LLM_CHAT_MODEL || "").trim() || nextModel;

    if (!nextApiKey) {
      return res.status(400).json({ error: "LLM_API_KEY is required" });
    }

    const nextConfig = {
      ...(config && typeof config === "object" ? config : {}),
      LLM_API_KEY: nextApiKey,
      LLM_API_BASE: nextApiBase,
      LLM_MODEL: nextModel,
      LLM_CHAT_MODEL: nextChatModel,
    };

    try {
      writeJsonSafely(configPath, nextConfig);
      config = nextConfig;
      return res.json({
        success: true,
        status: buildConfigStatusPayload(),
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "failed to write config.json" });
    }
  });

  app.post("/api/chongzhen/story", async (req, res) => {
    const runtimeConfig = getRuntimeConfig(req);
    if (!runtimeConfig.apiKey) {
      return res.status(500).json({ error: "LLM_API_KEY not configured" });
    }

    const body = req.body || {};
    const messages = [
      { role: "system", content: buildStorySystemPrompt(worldviewData) },
      { role: "user", content: buildUserMessage(body) },
    ];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      
      let response;
      try {
        response = await fetch(`${runtimeConfig.apiBase}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runtimeConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: runtimeConfig.model,
            messages,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: errText || "LLM request failed" });
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content == null) {
        return res.status(502).json({ error: "No content in LLM response" });
      }

      const policyLabelMap = buildUnlockedPolicyLabelMap(body);
      try {
        const parsed = JSON.parse(content);
        const languageSanitized = sanitizeStoryPayloadLanguage(parsed, policyLabelMap);
        const consistencySanitized = sanitizeStoryPayloadConsistency(languageSanitized, body);
        return res.json(consistencySanitized);
      } catch (_e) {
        // If model returns non-JSON text unexpectedly, keep original passthrough behavior.
      }

      res.set("Content-Type", "application/json; charset=utf-8");
      return res.send(content);
    } catch (e) {
      return res.status(500).json({ error: e.message || "Proxy error" });
    }
  });

  app.post("/api/chongzhen/ministerChat", async (req, res) => {
    const runtimeConfig = getRuntimeConfig(req);
    if (!runtimeConfig.apiKey) {
      return res.status(500).json({ error: "LLM_API_KEY not configured" });
    }

    const body = req.body || {};
    const ministerId = body.ministerId;
    const history = Array.isArray(body.history) ? body.history : [];
    const clientState = body.state && typeof body.state === "object" ? body.state : {};
    const ministers = getCharactersWithStateExtras(clientState);
    if (!Array.isArray(ministers) || ministers.length === 0) {
      return res.status(500).json({ error: "characters.json not loaded" });
    }

    if (!ministerId) {
      return res.status(400).json({ error: "ministerId is required" });
    }

    const minister = ministers.find((m) => m.id === ministerId);
    if (!minister) {
      return res.status(404).json({ error: "minister not found" });
    }

    if (!getAliveStatus(clientState, ministerId)) {
      return res.status(400).json({ error: "minister is deceased" });
    }

    const positions = getPositions();
    const positionIds = positions.map((p) => p.id).filter(Boolean);
    const ministerIds = ministers.map((m) => m.id).filter(Boolean);
    const currentAppointments = clientState.appointments && typeof clientState.appointments === "object"
      ? clientState.appointments
      : {};

    const normalizeAppointmentsMap = (raw) => {
      if (!raw) return undefined;

      const positionById = new Map(positions.map((p) => [String(p.id || ""), p]));
      const positionIdByName = new Map(positions.map((p) => [String(p.name || "").trim(), String(p.id || "")]));
      const characterById = new Map(ministers.map((m) => [String(m.id || ""), m]));
      const characterIdByName = new Map(ministers.map((m) => [String(m.name || "").trim(), String(m.id || "")]));

      const toPositionId = (value) => {
        if (typeof value !== "string") return "";
        const trimmed = value.trim();
        if (!trimmed) return "";
        if (positionById.has(trimmed)) return trimmed;
        return positionIdByName.get(trimmed) || "";
      };

      const toCharacterId = (value) => {
        if (typeof value !== "string") return "";
        const trimmed = value.trim();
        if (!trimmed) return "";
        if (characterById.has(trimmed)) return trimmed;
        return characterIdByName.get(trimmed) || "";
      };

      const mapped = {};
      const pairs = [];

      if (Array.isArray(raw)) {
        raw.forEach((item) => {
          if (!item || typeof item !== "object") return;
          pairs.push([item.positionId, item.characterId]);
        });
      } else if (typeof raw === "object") {
        Object.entries(raw).forEach(([positionRaw, characterRaw]) => {
          pairs.push([positionRaw, characterRaw]);
        });
      } else {
        return undefined;
      }

      for (const [positionRaw, characterRaw] of pairs) {
        const positionId = toPositionId(positionRaw);
        const characterId = toCharacterId(characterRaw);
        if (!positionId || !characterId) continue;
        mapped[positionId] = characterId;
      }

      return Object.keys(mapped).length ? mapped : undefined;
    };

    const characterStatus = clientState.characterStatus && typeof clientState.characterStatus === "object"
      ? clientState.characterStatus
      : {};
    const positionById = new Map(positions.map((p) => [String(p.id || ""), p]));
    const activeAppointments = Object.entries(currentAppointments)
      .filter(([positionId, characterId]) => {
        if (!positionById.has(String(positionId || ""))) return false;
        if (typeof characterId !== "string" || !characterId.trim()) return false;
        return getAliveStatus(clientState, characterId);
      })
      .map(([positionId, characterId]) => {
        const p = positionById.get(String(positionId || ""));
        const c = ministers.find((item) => item.id === characterId);
        return {
          positionId,
          positionName: p?.name || positionId,
          characterId,
          characterName: c?.name || characterId,
        };
      });

    const inOfficeAliveIds = new Set(activeAppointments.map((item) => item.characterId));
    const aliveMinisters = ministers.filter((m) => getAliveStatus(clientState, m.id));
    const retiredAliveMinisters = aliveMinisters
      .filter((m) => !inOfficeAliveIds.has(m.id))
      .map((m) => ({ id: m.id, name: m.name }));
    const deceasedMinisters = ministers
      .filter((m) => !getAliveStatus(clientState, m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        reason: characterStatus[m.id]?.deathReason || "已故",
      }));

    const currentOffice = activeAppointments.find((item) => item.characterId === ministerId);

    const systemPrompt = `你现在是 ${minister.name}。\n你必须只输出一个合法 JSON：{"reply":"...","loyaltyDelta":0,"appointments":{},"effects":{}}。\nappointments/effects 可选；只有皇帝明确下达任免或政策调整时才填写。\n不得让已故大臣重新出现、复活、任职或发言；不得将未任职者称作在任官员。\n称谓与官职必须匹配当前朝堂快照，除非本轮在 appointments 中明确变更。`;
    const contextPrompt = `可用官职ID: ${positionIds.join(", ")}\n可用大臣ID: ${ministerIds.join(", ")}\n当前说话大臣: ${minister.id}(${minister.name})，在任官职=${currentOffice?.positionName || "无"}\n在任且在世名单: ${JSON.stringify(activeAppointments)}\n在世未任名单: ${JSON.stringify(retiredAliveMinisters)}\n已故名单: ${JSON.stringify(deceasedMinisters)}\n当前任命映射: ${JSON.stringify(currentAppointments)}`;
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "system", content: contextPrompt },
      ...history.slice(-20),
    ];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      
      let response;
      try {
        response = await fetch(`${runtimeConfig.apiBase}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runtimeConfig.apiKey}`,
          },
          body: JSON.stringify({ model: runtimeConfig.chatModel, messages }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: errText || "LLM request failed" });
      }

      const data = await response.json();
      let content = data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        return res.status(502).json({ error: "No content in LLM response" });
      }

      content = content.trim();
      let reply = content;
      let loyaltyDelta = 0;
      let appointments;
      let effects;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (typeof parsed.reply === "string") reply = parsed.reply.trim();
          if (typeof parsed.loyaltyDelta === "number" && Number.isFinite(parsed.loyaltyDelta)) {
            loyaltyDelta = Math.max(-2, Math.min(2, Math.round(parsed.loyaltyDelta)));
          }
          appointments = normalizeAppointmentsMap(parsed.appointments);
          if (parsed.effects && typeof parsed.effects === "object" && !Array.isArray(parsed.effects)) {
            effects = parsed.effects;
          }
        } catch (_) {
          // keep fallback reply
        }
      }

      if (appointments) {
        const filtered = {};
        for (const [positionId, characterId] of Object.entries(appointments)) {
          if (!getAliveStatus(clientState, characterId)) continue;
          filtered[positionId] = characterId;
        }
        appointments = Object.keys(filtered).length ? filtered : undefined;
      }

      reply = sanitizeMinisterReplyText(reply, deceasedMinisters);

      const payload = { reply, loyaltyDelta };
      if (appointments) payload.appointments = appointments;
      if (effects) payload.effects = effects;
      payload.ministerId = ministerId;
      return res.json(payload);
    } catch (e) {
      return res.status(500).json({ error: e.message || "Proxy error" });
    }
  });

  // ── 人才延揽：招募人才池 ──────────────────────────────────────────────────────
  app.post("/api/chongzhen/talentRecruit", async (req, res) => {
    const runtimeConfig = getRuntimeConfig(req);
    if (!runtimeConfig.apiKey) {
      return res.status(500).json({ error: "LLM_API_KEY not configured" });
    }

    const body = req.body || {};
    const recruitType = typeof body.recruitType === "string" ? body.recruitType : "search";
    const clientState = body.state && typeof body.state === "object" ? body.state : {};
    const worldviewData = body.worldviewData && typeof body.worldviewData === "object" ? body.worldviewData : {};
    const existingTalentIds = Array.isArray(body.existingTalentIds) ? body.existingTalentIds.filter((item) => typeof item === 'string' && item.trim()) : [];
    const existingTalentNames = Array.isArray(body.existingTalentNames) ? body.existingTalentNames.filter((item) => typeof item === 'string' && item.trim()) : [];

    const worldviewTitle = worldviewData?.worldviewTitle || worldviewData?.title || "历史架空";
    const talentCfg = worldviewData?.talentConfig || {};
    const recruitTypeLabel = talentCfg?.recruitTypes?.[recruitType] || recruitType;
    const recruitProfile = TALENT_RECRUIT_PROFILES[recruitType] || TALENT_RECRUIT_PROFILES.search;
    const rulerTitle = talentCfg?.rulerTitle || "君主";
    const talentNoun = talentCfg?.talentNoun || "人才";
    const qualityLabels = talentCfg?.qualityLabels || { ordinary: "普通", excellent: "优秀", epic: "史诗" };
    const abilityFields = talentCfg?.abilityFields || { military: "武略", politics: "政务", economy: "理财", culture: "文化" };
    const tagHints = Object.values(abilityFields).join("、");
    const existingConstraint = existingTalentNames.length || existingTalentIds.length
      ? `\n已有候选不可重复。禁止复用这些姓名：${existingTalentNames.slice(0, 24).join("、") || "无"}。禁止复用这些ID：${existingTalentIds.slice(0, 24).join(", ") || "无"}。`
      : "";

    const systemPrompt = `你是${worldviewTitle}世界的人才生成器。
${rulerTitle}正以"${recruitTypeLabel}"的方式延揽${talentNoun}。
请生成3到5位风格各异的${talentNoun}，输出严格合法的 JSON：
  {"talents":[{"id":"talent_<随机8位>","name":"姓名","quality":"ordinary|excellent|epic","field":"military|politics|economy|culture","ability":{"military":0-100,"politics":0-100,"economy":0-100,"culture":0-100,"loyalty":40-80},"personality":"性格描述（20字以内）","faction":"所属派系（可为空字符串）","background":"人物背景（30字以内）","openingLine":"首次见面的自述（30字以内）","tags":["标签1","标签2","标签3"],"source":"${recruitType}"}]}
quality 分布：epic 约占 10%，excellent 约占 30%，ordinary 约占 60%。
  本次招募来源：${recruitProfile.talentSource}。
  人物画像要求：${recruitProfile.profileHint}
  能力倾向要求：${recruitProfile.fieldBias}
  tags 必须反映人才特征、专长或出身，优先围绕：${tagHints}；同时${recruitProfile.tagHint}${existingConstraint}
  严格输出 JSON，不要有任何额外内容。`;

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `请为${rulerTitle}生成此次${recruitTypeLabel}获得的${talentNoun}名单。` },
    ];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(`${runtimeConfig.apiBase}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runtimeConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: runtimeConfig.chatModel,
            messages,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: errText || "LLM request failed" });
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return res.status(502).json({ error: "No content in LLM response" });

      let parsed;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch (_) {
        return res.status(502).json({ error: "Failed to parse LLM response as JSON" });
      }

      const talents = Array.isArray(parsed.talents) ? parsed.talents : Array.isArray(parsed) ? parsed : [];
      return res.json({ talents });
    } catch (e) {
      if (e.name === "AbortError") {
        return res.status(504).json({ error: "LLM request timed out" });
      }
      return res.status(500).json({ error: e.message || "Proxy error" });
    }
  });

  // ── 人才召见：单人对话 ────────────────────────────────────────────────────────
  app.post("/api/chongzhen/talentInteract", async (req, res) => {
    const runtimeConfig = getRuntimeConfig(req);
    if (!runtimeConfig.apiKey) {
      return res.status(500).json({ error: "LLM_API_KEY not configured" });
    }

    const body = req.body || {};
    const clientState = body.state && typeof body.state === "object" ? body.state : {};
    const stateCharacters = getCharactersWithStateExtras(clientState);
    const requestedTalentId = typeof body.talentId === "string" ? body.talentId : "";
    const talentFromState = requestedTalentId
      ? stateCharacters.find((item) => item?.id === requestedTalentId)
      : null;
    const talent = body.talent && typeof body.talent === "object"
      ? { ...(talentFromState || {}), ...body.talent }
      : talentFromState;
    const playerMessage = typeof body.playerMessage === "string" ? body.playerMessage.trim() : "";
    const history = Array.isArray(body.history) ? body.history : [];
    const worldviewData = body.worldviewData && typeof body.worldviewData === "object" ? body.worldviewData : {};

    if (!talent || !playerMessage) {
      return res.status(400).json({ error: "talent and playerMessage are required" });
    }

    const talentCfg = worldviewData?.talentConfig || {};
    const rulerTitle = talentCfg?.rulerTitle || "君主";
    const loyalty = talent?.ability?.loyalty ?? 50;
    const loyaltyDesc = loyalty >= 80 ? "对君主忠心耿耿" : loyalty >= 50 ? "对君主态度中立" : "对是否出仕尚存犹豫";
    const qualityDesc = talent.quality === "epic" ? "名满天下的大贤" : talent.quality === "excellent" ? "颇有才名" : "才华横溢的寒士";

    const systemPrompt = `你现在扮演${talent.name}，一位${qualityDesc}。性格：${talent.personality || "沉稳"}。背景：${talent.background || "出身不详"}。${loyaltyDesc}。
${rulerTitle}正在召见你，请以第一人称回应，保持人物性格，字数200字以内。
严格输出 JSON：{"reply":"回应内容","loyaltyDelta":[-3..3],"attitude":"willing|hesitant|reluctant","suggestion":"可选的建议或信息，可为空字符串"}
loyaltyDelta 正数表示好感上升，负数表示下降。`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10),
      { role: "user", content: playerMessage },
    ];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(`${runtimeConfig.apiBase}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runtimeConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: runtimeConfig.chatModel,
            messages,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: errText || "LLM request failed" });
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return res.status(502).json({ error: "No content in LLM response" });

      let parsed = {};
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch (_) {
        parsed = { reply: content };
      }

      return res.json({
        reply: typeof parsed.reply === "string" ? parsed.reply : content,
        loyaltyDelta: typeof parsed.loyaltyDelta === "number" ? Math.max(-5, Math.min(5, Math.round(parsed.loyaltyDelta))) : 0,
        attitude: ["willing", "hesitant", "reluctant"].includes(parsed.attitude) ? parsed.attitude : "hesitant",
        suggestion: typeof parsed.suggestion === "string" ? parsed.suggestion : "",
      });
    } catch (e) {
      if (e.name === "AbortError") {
        return res.status(504).json({ error: "LLM request timed out" });
      }
      return res.status(500).json({ error: e.message || "Proxy error" });
    }
  });

  // ── 廷议建言：多位大臣分析议题 ───────────────────────────────────────────────
  app.post("/api/chongzhen/ministerAdvise", async (req, res) => {
    const runtimeConfig = getRuntimeConfig(req);
    if (!runtimeConfig.apiKey) {
      return res.status(500).json({ error: "LLM_API_KEY not configured" });
    }

    const body = req.body || {};
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const ministers = Array.isArray(body.ministers) ? body.ministers : [];
    const clientState = body.state && typeof body.state === "object" ? body.state : {};
    const conversationHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory : [];
    const worldviewData = body.worldviewData && typeof body.worldviewData === "object" ? body.worldviewData : {};

    if (!question) {
      return res.status(400).json({ error: "question is required" });
    }

    const worldviewTitle = worldviewData?.worldviewTitle || worldviewData?.title || "历史架空";
    const policyCfg = worldviewData?.policyConfig || {};
    const rulerTitle = policyCfg?.rulerTitle || "君主";
    const edictLabel = policyCfg?.edictLabel || "诏令";

    // 从角色数据中取得大臣信息
    const allCharacters = getCharacters();
    const appointments = clientState.appointments && typeof clientState.appointments === "object"
      ? clientState.appointments : {};
    const appointedIds = new Set(Object.values(appointments).filter(Boolean));

    // 若前端传了大臣 ID，则优先使用；否则自动从在任大臣中选取最多 3 人
    let selectedMinisters = ministers;
    if (!selectedMinisters.length) {
      selectedMinisters = allCharacters
        .filter((m) => appointedIds.has(m.id) && getAliveStatus(clientState, m.id))
        .slice(0, 3)
        .map((m) => ({ id: m.id, name: m.name, faction: m.faction || "" }));
    }

    if (selectedMinisters.length === 0) {
      // 回退：无在任大臣时用通用提示
      selectedMinisters = [
        { id: "minister_a", name: "某臣甲", faction: "" },
        { id: "minister_b", name: "某臣乙", faction: "" },
      ];
    }

    const ministerList = selectedMinisters.map((m) => `${m.name}（${m.faction || "无派"}）`).join("、");
    const systemPrompt = `你正在扮演${worldviewTitle}中的朝廷议政场景。
${rulerTitle}就以下议题向群臣垂询：「${question}」
参与廷议的大臣：${ministerList}
请为每位大臣生成一份有针对性、符合其性格和派系利益的建言。
严格输出合法 JSON：
{"advices":[{"ministerId":"id","ministerName":"姓名","faction":"派系","attitude":"support|oppose|neutral","content":"建言正文（100字以内）","reason":"理由（50字以内）","estimatedEffects":["效果描述1","效果描述2"]}],"summary":"群臣议论综述（80字以内）"}
每位大臣的 attitude 不必相同，体现不同派系利益的冲突。`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-6),
      { role: "user", content: `${rulerTitle}问：${question}` },
    ];

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(`${runtimeConfig.apiBase}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runtimeConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: runtimeConfig.chatModel,
            messages,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: errText || "LLM request failed" });
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return res.status(502).json({ error: "No content in LLM response" });

      let parsed = {};
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch (_) {
        return res.status(502).json({ error: "Failed to parse LLM response as JSON" });
      }

      const advices = Array.isArray(parsed.advices) ? parsed.advices.map((a) => ({
        ministerId: a.ministerId || "",
        ministerName: a.ministerName || a.ministerId || "臣",
        faction: a.faction || "",
        attitude: ["support", "oppose", "neutral"].includes(a.attitude) ? a.attitude : "neutral",
        content: typeof a.content === "string" ? a.content : "",
        reason: typeof a.reason === "string" ? a.reason : "",
        estimatedEffects: Array.isArray(a.estimatedEffects) ? a.estimatedEffects : [],
      })) : [];

      return res.json({ advices, summary: typeof parsed.summary === "string" ? parsed.summary : "" });
    } catch (e) {
      if (e.name === "AbortError") {
        return res.status(504).json({ error: "LLM request timed out" });
      }
      return res.status(500).json({ error: e.message || "Proxy error" });
    }
  });

  app.get("/api/chongzhen/characters", (_req, res) => {
    const characters = getCharacters();
    return res.json({
      total: characters.length,
      characters,
      positions: getPositions(),
      departments: getDepartments(),
    });
  });

  app.get("/api/chongzhen/positions", (_req, res) => {
    const positions = getPositions();
    return res.json({
      total: positions.length,
      positions,
      departments: getDepartments(),
      ranks: getRanks(),
    });
  });

  app.post("/api/chongzhen/appoint", (req, res) => {
    const { positionId, characterId, state = {} } = req.body || {};

    if (!positionId || !characterId) {
      return res.status(400).json({ success: false, error: "positionId and characterId are required" });
    }

    const positions = getPositions();
    const characters = getCharactersWithStateExtras(state);

    const targetPosition = positions.find((item) => item.id === positionId);
    if (!targetPosition) {
      return res.status(404).json({ success: false, error: "position not found" });
    }

    const targetCharacter = characters.find((item) => item.id === characterId);
    if (!targetCharacter) {
      return res.status(404).json({ success: false, error: "character not found" });
    }

    if (!getAliveStatus(state, characterId)) {
      return res.status(400).json({ success: false, error: "该角色已故，无法任命" });
    }

    const appointments = { ...(state.appointments || {}) };
    const oldHolder = appointments[positionId];

    let oldPosition;
    for (const [posId, holderId] of Object.entries(appointments)) {
      if (holderId === characterId && posId !== positionId) {
        oldPosition = posId;
        delete appointments[posId];
      }
    }

    appointments[positionId] = characterId;

    return res.json({
      success: true,
      appointment: {
        positionId,
        characterId,
        positionName: targetPosition.name || positionId,
        characterName: targetCharacter.name || characterId,
        oldHolder,
        oldPosition,
      },
      appointments,
    });
  });

  app.post("/api/chongzhen/punish", (req, res) => {
    const { characterId, action, reason, state = {} } = req.body || {};

    if (!characterId || !action) {
      return res.status(400).json({ error: "characterId and action are required" });
    }

    const characters = getCharacters();
    const targetCharacter = characters.find((item) => item.id === characterId);
    if (!targetCharacter) {
      return res.status(404).json({ error: "character not found" });
    }

    if (!getAliveStatus(state, characterId)) {
      return res.status(400).json({ error: "该角色已故" });
    }

    if (!["execute", "exile", "demote"].includes(action)) {
      return res.status(400).json({ error: "invalid action" });
    }

    const appointments = { ...(state.appointments || {}) };
    let removedPosition;
    for (const [posId, holderId] of Object.entries(appointments)) {
      if (holderId === characterId) {
        removedPosition = posId;
        delete appointments[posId];
      }
    }

    const characterStatus = { ...(state.characterStatus || {}) };
    const current = characterStatus[characterId] || {};

    if (action === "execute") {
      characterStatus[characterId] = {
        ...current,
        isAlive: false,
        deathReason: reason || "处死",
        deathDay: state.currentDay || 1,
      };
    } else if (action === "exile") {
      characterStatus[characterId] = {
        ...current,
        exiled: true,
        exileReason: reason || "流放",
      };
    } else {
      characterStatus[characterId] = {
        ...current,
        demoted: true,
      };
    }

    return res.json({
      success: true,
      action,
      characterId,
      removedPosition,
      characterStatus,
      appointments,
    });
  });

  return {
    app,
    buildUserMessage,
    buildStorySystemPrompt: () => buildStorySystemPrompt(worldviewData),
    sanitizeMinisterReplyText,
    buildUnlockedPolicyLabelMap,
    sanitizeStoryPayloadLanguage,
    getCharacters,
    getPositions,
  };
}

module.exports = { createApp };

if (require.main === module) {
  const { app } = createApp();
  const localConfig = readJsonSafely(path.join(__dirname, "config.json")) || {};
  const envPort = Number(process.env.PORT);
  const configuredPort = Number(localConfig.PORT);
  const PORT = Number.isFinite(envPort) && envPort > 0
    ? envPort
    : (Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 3002);
  app.listen(PORT, () => {
    console.log(`ChongzhenSim proxy listening on http://localhost:${PORT} (routes: /api/chongzhen/story, /api/chongzhen/ministerChat, /api/chongzhen/talentRecruit, /api/chongzhen/talentInteract, /api/chongzhen/ministerAdvise, /api/chongzhen/characters, /api/chongzhen/positions, /api/chongzhen/appoint, /api/chongzhen/punish)`);
    if (!localConfig.LLM_API_KEY) {
      console.warn("config.json 中 LLM_API_KEY 未填写; API 将返回 500。");
    }
  });
}
