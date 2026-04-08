import { router } from "../router.js";
import { getState, setState } from "../state.js";
import { loadJSON } from "../dataLoader.js";
import { getStatBarClass } from "../systems/nationSystem.js";
import { PLAYER_ABILITY_KEYS, getPolicyCatalog, spendAbilityPoint, unlockPolicy } from "../systems/coreGameplaySystem.js";
import { formatDisplayMetricValue, getDisplayMetricBarValue, getDisplayMetricsBySection } from "../utils/displayStateMetrics.js";
import { isRigidMode } from "../rigid/config.js";

let nationInitCache = null;
let provinceRulesCache = null;

const DEFAULT_PROVINCE_RULES = {
  regionRules: [
    { namePattern: "江淮|沿江", default: { threat: "critical", status: "金军压力犹存，沿江防线需持续戒备。" } },
    { namePattern: "江淮|河南", default: { threat: "high", status: "兵火与流民问题仍需持续处置。" } },
    { namePattern: "山东", default: { threat: "medium", status: "军务可控，但需防局部哗变反复。" } },
    { namePattern: "两浙|江南|湖广", default: { threat: "low", status: "税粮产出稳定，仍是行在财政与粮运的主要支撑。" } },
    { namePattern: "四川", default: { threat: "low", status: "整体安稳，可作为战略后方调度区域。" } },
  ],
};

function createNode(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function appendMetricGrid(parent, state, sectionName, title) {
  const wrap = createNode("div", "nation-overview");
  wrap.appendChild(createNode("div", "nation-overview-title", title));
  const grid = createNode("div", "nation-stats-grid");

  getDisplayMetricsBySection(sectionName).forEach((metric) => {
    const item = createNode("div", "nation-stat-item");
    item.appendChild(createNode("div", "nation-stat-label", `${metric.icon} ${metric.label}`));
    item.appendChild(createNode("div", "nation-stat-value", formatDisplayMetricValue(state, metric.key)));

    const bar = createNode("div", "nation-stat-bar");
    const barInner = createNode(
      "div",
      `nation-stat-bar-inner ${getStatBarClass(getDisplayMetricBarValue(state, metric.key), metric.invert)}`
    );
    barInner.style.width = `${Math.min(100, getDisplayMetricBarValue(state, metric.key))}%`;
    bar.appendChild(barInner);
    item.appendChild(bar);
    grid.appendChild(item);
  });

  wrap.appendChild(grid);
  parent.appendChild(wrap);
}

function createFoldSection(title, renderBody) {
  const section = createNode("div", "fold-section");
  const header = createNode("div", "fold-header");
  header.appendChild(createNode("span", "", title));
  header.appendChild(createNode("span", "fold-arrow", "▶"));
  const body = createNode("div", "fold-body");
  header.addEventListener("click", () => section.classList.toggle("fold-section--open"));
  renderBody(body);
  section.appendChild(header);
  section.appendChild(body);
  return section;
}

function createCard({ icon = "", title = "", summary = "" }) {
  const card = createNode("div", "nation-card");
  if (icon) {
    card.appendChild(createNode("div", "nation-card-icon", icon));
  }
  const body = createNode("div", "nation-card-body");
  body.appendChild(createNode("div", "nation-card-title", title));
  if (summary) {
    body.appendChild(createNode("div", "nation-card-summary", summary));
  }
  card.appendChild(body);
  return { card, body };
}

function deriveProvinceRuntimeState(province) {
  const rules = provinceRulesCache?.regionRules || DEFAULT_PROVINCE_RULES.regionRules;
  const matched = rules.find((rule) => {
    try {
      return new RegExp(rule.namePattern).test(province?.name || "");
    } catch {
      return false;
    }
  });
  return {
    threat: matched?.default?.threat || province?.threat || "medium",
    status: matched?.default?.status || province?.status || "暂无情报",
  };
}

export function getProvinceRuntimeState(province) {
  return deriveProvinceRuntimeState(province);
}

export function getNationInitData() {
  return nationInitCache;
}

function rerender(container) {
  container.innerHTML = "";
  renderNationView(container);
}

function appendClassicSections(root, state, container) {
  const factionSupport = state.factionSupport || {};
  const quarterAgenda = state.currentQuarterAgenda || [];
  const provinceStats = state.provinceStats || {};

  root.appendChild(createFoldSection("派系支持度", (body) => {
    (state.factions || []).forEach((faction) => {
      body.appendChild(createCard({
        icon: "🏛️",
        title: `${faction.name} · ${factionSupport[faction.id] || 0}/100`,
        summary: faction.stance || faction.description || "",
      }).card);
    });
  }));

  root.appendChild(createFoldSection("季度奏折", (body) => {
    if (!quarterAgenda.length) {
      body.appendChild(createNode("div", "nation-feed-empty", "当前无季度核心议题，推进至季度月后将生成 3-5 条时政议题。"));
      return;
    }
    quarterAgenda.forEach((item) => {
      body.appendChild(createCard({
        icon: "📜",
        title: item.title,
        summary: `${item.summary} 关联：${(item.impacts || []).join("、")}`,
      }).card);
    });
  }));

  const abilityMeta = {
    management: { label: "管理", desc: "提升季度财政与粮储效率。" },
    military: { label: "军事", desc: "强化军事类诏书收益。" },
    scholarship: { label: "学识", desc: "提高改革与农政收益。" },
    politics: { label: "政治", desc: "提高执行率并缓和党争。" },
  };
  root.appendChild(createFoldSection(`皇帝能力（可用点数 ${state.abilityPoints || 0}）`, (body) => {
    PLAYER_ABILITY_KEYS.forEach((key) => {
      const { card } = createCard({
        title: `${abilityMeta[key].label} · Lv.${state.playerAbilities?.[key] || 0}`,
        summary: abilityMeta[key].desc,
      });
      if ((state.abilityPoints || 0) > 0) {
        const btn = createNode("button", "nation-mini-btn", "加点");
        btn.type = "button";
        btn.addEventListener("click", () => {
          const patch = spendAbilityPoint(getState(), key);
          if (!patch) return;
          setState(patch);
          rerender(container);
        });
        card.appendChild(btn);
      }
      body.appendChild(card);
    });
  }));

  const policies = getPolicyCatalog(state);
  const policyTitleMap = Object.fromEntries(policies.map((item) => [item.id, item.title]));
  root.appendChild(createFoldSection(`国策树（可用点数 ${state.policyPoints || 0}）`, (body) => {
    policies.forEach((policy) => {
      const unlocked = (state.unlockedPolicies || []).includes(policy.id);
      const canUnlock = !unlocked
        && (state.policyPoints || 0) >= policy.cost
        && (policy.requires || []).every((id) => (state.unlockedPolicies || []).includes(id));
      const requiresText = (policy.requires || []).length
        ? ` 前置：${(policy.requires || []).map((id) => policyTitleMap[id] || id).join("、")}`
        : "";
      const { card } = createCard({
        title: `${policy.branch} · ${policy.title}${unlocked ? "（已实施）" : ""}`,
        summary: `${policy.description} 消耗 ${policy.cost} 点。${requiresText}`,
      });
      if (!unlocked) {
        const btn = createNode("button", `nation-mini-btn${canUnlock ? "" : " nation-mini-btn--disabled"}`, canUnlock ? "实施" : "未满足");
        btn.type = "button";
        btn.disabled = !canUnlock;
        btn.addEventListener("click", () => {
          const patch = unlockPolicy(getState(), policy.id);
          if (!patch) return;
          setState(patch);
          rerender(container);
        });
        card.appendChild(btn);
      }
      body.appendChild(card);
    });
  }));

  root.appendChild(createFoldSection(`自定义国策（${Array.isArray(state.customPolicies) ? state.customPolicies.length : 0}）`, (body) => {
    const customPolicies = Array.isArray(state.customPolicies) ? state.customPolicies : [];
    if (!customPolicies.length) {
      body.appendChild(createNode("div", "nation-feed-empty", "尚未设立自定义国策。可在自拟诏书中写入“设立某机构定为国策”自动收录。"));
      return;
    }
    const categoryText = {
      fiscal: "季度财政加成",
      agri: "季度粮储加成",
      military: "季度军务加成",
      governance: "执行与监察加成",
      general: "综合微幅加成",
    };
    customPolicies.forEach((policy) => {
      body.appendChild(createCard({
        icon: "🏛️",
        title: policy.name,
        summary: `${categoryText[policy.category] || categoryText.general} · 设立于建炎${policy.createdYear || "?"}年${policy.createdMonth || "?"}月`,
      }).card);
    });
  }));

  if (nationInitCache?.provinces) {
    root.appendChild(createFoldSection("各省概况", (body) => {
      nationInitCache.provinces.forEach((province) => {
        const runtime = deriveProvinceRuntimeState(province);
        const ps = provinceStats[province.name] || {};
        const { card, body: cardBody } = createCard({
          title: province.name,
          summary: runtime.status,
        });
        const statsRow = createNode("div", "province-stats-row");
        const tags = [
          `税：${(ps.taxSilver || 0).toLocaleString()}两 / ${(ps.taxGrain || 0).toLocaleString()}石`,
          `兵：${(ps.recruits || 0).toLocaleString()}人`,
          `民心：${ps.morale ?? 50}/100`,
          `贪腐：${ps.corruption ?? 50}/100`,
          `天灾：${ps.disaster ?? 50}/100`,
        ];
        tags.forEach((text, index) => statsRow.appendChild(createNode("span", "province-tag", text)));
        cardBody.appendChild(statsRow);
        body.appendChild(card);
      });
    }));
  }
}

function appendSharedSections(root, state) {
  const hostileForces = Array.isArray(state.hostileForces) && state.hostileForces.length
    ? state.hostileForces
    : (nationInitCache?.externalThreats || []);

  if (hostileForces.length) {
    root.appendChild(createFoldSection("敌对势力", (body) => {
      hostileForces.forEach((item) => {
        const power = typeof item.power === "number" ? Math.max(0, Math.min(100, item.power)) : 100;
        const { card, body: cardBody } = createCard({
          icon: "⚔️",
          title: `${item.name}（${item.leader || "未知"}）${item.isDefeated ? "（已灭亡）" : ""}`,
          summary: `${item.status || "暂无情报"} · 势力值 ${power}/100${item.isDefeated ? " · 相关故事线已闭锁" : ""}`,
        });
        const value = createNode("div", "nation-stat-value", `势力：${power}/100`);
        const bar = createNode("div", "nation-stat-bar");
        const barInner = createNode("div", "nation-stat-bar-inner");
        barInner.style.width = `${power}%`;
        bar.appendChild(barInner);
        cardBody.appendChild(value);
        cardBody.appendChild(bar);
        body.appendChild(card);
      });
    }));
  }

  const feed = createNode("div", "nation-feed");
  feed.appendChild(createNode("div", "nation-feed-header", "天下大事"));
  const news = state.newsToday || [];
  if (!news.length) {
    feed.appendChild(createNode("div", "nation-feed-empty", "暂无奏报，推进剧情后将产生新的军国大事。"));
  } else {
    news.forEach((item) => {
      feed.appendChild(createCard({
        icon: item.icon || "📜",
        title: item.title,
        summary: item.summary || "",
      }).card);
    });
  }
  root.appendChild(feed);

  const opinions = createNode("div", "nation-opinions");
  opinions.appendChild(createNode("div", "nation-opinions-header", "民间舆论"));
  const publicOpinion = state.publicOpinion || [];
  if (!publicOpinion.length) {
    opinions.appendChild(createNode("div", "nation-feed-empty", "暂无民间舆论。"));
  } else {
    publicOpinion.forEach((item) => {
      const line = createNode("div", "nation-opinion-item");
      const user = createNode(
        "span",
        `nation-opinion-user ${item.type === "loyal" ? "nation-opinion-user--loyal" : item.type === "angry" ? "nation-opinion-user--angry" : "nation-opinion-user--neutral"}`,
        item.user || "百姓"
      );
      const text = createNode("span", "nation-opinion-text", item.text || "");
      line.appendChild(user);
      line.appendChild(text);
      opinions.appendChild(line);
    });
  }
  root.appendChild(opinions);
}

export function renderNationView(container) {
  const state = getState();
  const root = createNode("div", "nation-root");

  if (isRigidMode(state)) {
    appendMetricGrid(root, state, "rigid", "建炎·南宋国势");
  } else {
    appendMetricGrid(root, state, "nation", "南宋国势");
    appendMetricGrid(root, state, "governance", "朝局总览");
    appendClassicSections(root, state, container);
  }

  appendSharedSections(root, state);
  container.appendChild(root);
}

export async function ensureNationViewDataLoaded() {
  if (!nationInitCache) {
    try {
      nationInitCache = await loadJSON("data/nationInit.json");
    } catch {
      nationInitCache = {};
    }
  }
  if (!provinceRulesCache) {
    try {
      provinceRulesCache = await loadJSON("data/provinceRules.json");
    } catch {
      provinceRulesCache = null;
    }
  }
}

export function registerNationView() {
  router.registerView("nation", async (container) => {
    await ensureNationViewDataLoaded();
    renderNationView(container);
  });
}
