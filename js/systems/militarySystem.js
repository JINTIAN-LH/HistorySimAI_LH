/**
 * 军事战斗子系统（mililtarySystem）
 *
 * 触发条件：玩家在诏书界面选择对敌对势力发动进攻的选项
 * 流程：战前部署 → 战场推演（若干回合决策）→ 战斗结算总结 → 回调继续正常诏书流程
 *
 * 本模块不改写全局 state，只产出一个 battleOutcome 对象供上层
 * handleChoice 使用，以保持与现有 resolveHostileForcesAfterChoice 的一致性。
 */

import { resolveWorldviewBattleLabels } from "../worldview/worldviewRuntimeAccessor.js";

/* ─────────────────────────────────────────────────────────
   一、兵种配置（JSON 友好，支持后续迁移至 config 文件）
   ───────────────────────────────────────────────────────── */
export const UNIT_TYPES = [
  {
    id: "infantry_spear",
    name: "边军长枪兵",
    icon: "🗡️",
    attack: 8,
    defense: 12,
    speed: 3,
    morale_base: 70,
    counters: ["cavalry_guanning"],
    weak_against: ["firearm", "artillery"],
  },
  {
    id: "cavalry_guanning",
    name: "关宁铁骑",
    icon: "🐎",
    attack: 16,
    defense: 8,
    speed: 9,
    morale_base: 80,
    counters: ["infantry_sword", "infantry_spear"],
    weak_against: ["firearm", "artillery", "infantry_spear"],
    chargeBonus: 1.5,
    chargeCooldown: 2,
  },
  {
    id: "firearm",
    name: "神机营火铳手",
    icon: "🔫",
    attack: 14,
    defense: 5,
    speed: 3,
    morale_base: 65,
    counters: ["infantry_sword", "infantry_spear"],
    weak_against: ["cavalry_guanning"],
    reloadTurns: 1,
  },
  {
    id: "artillery",
    name: "车营炮兵",
    icon: "💣",
    attack: 20,
    defense: 6,
    speed: 1,
    morale_base: 60,
    counters: ["infantry_spear", "firearm"],
    weak_against: ["cavalry_guanning"],
    areaDamage: true,
  },
];

/* ─────────────────────────────────────────────────────────
   二、阵型配置
   ───────────────────────────────────────────────────────── */
export const FORMATIONS = [
  {
    id: "phalanx",
    name: "长枪方阵",
    icon: "⬛",
    defenseMod: 1.5,
    attackMod: 0.8,
    speedMod: 0.6,
    cavalryResist: 2.0,
    desc: "防御极强，移动缓慢，抗骑兵冲锋。",
  },
  {
    id: "wedge",
    name: "骑兵楔形阵",
    icon: "🔺",
    defenseMod: 0.9,
    attackMod: 1.6,
    speedMod: 1.3,
    cavalryResist: 0.7,
    desc: "攻击力强，适合冲锋突破，但防御较弱。",
  },
  {
    id: "volley",
    name: "火铳三段阵",
    icon: "🔲",
    defenseMod: 1.0,
    attackMod: 1.3,
    speedMod: 0.8,
    cavalryResist: 1.2,
    desc: "火力持续输出，对步兵压制显著。",
  },
  {
    id: "wagon_circle",
    name: "车营圆阵",
    icon: "⭕",
    defenseMod: 2.0,
    attackMod: 0.7,
    speedMod: 0.3,
    cavalryResist: 2.5,
    desc: "守城/防御战首选，火铳炮兵在内射击，移动极慢。",
  },
  {
    id: "scattered",
    name: "散阵游击",
    icon: "💠",
    defenseMod: 0.7,
    attackMod: 1.0,
    speedMod: 1.5,
    cavalryResist: 0.6,
    desc: "机动灵活，适合骚扰侧翼，防御极弱。",
  },
];

/* ─────────────────────────────────────────────────────────
   三、辅助函数
   ───────────────────────────────────────────────────────── */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function resolveUnitById(id) {
  return UNIT_TYPES.find((u) => u.id === id) || UNIT_TYPES[0];
}

function resolveFormationById(id) {
  return FORMATIONS.find((f) => f.id === id) || FORMATIONS[0];
}

function buildBattleScale(state, targetForce) {
  const nationStrength = clamp(state?.nation?.militaryStrength || 50, 20, 100);
  const hostileStrength = clamp(targetForce?.power || 50, 10, 100);
  const militaryAbility = clamp(state?.playerAbilities?.military || 0, 0, 10);

  return {
    playerBaseCount: Math.round(2200 + nationStrength * 50 + militaryAbility * 450),
    enemyBaseCount: Math.round(2000 + hostileStrength * 52 + Math.max(0, hostileStrength - nationStrength) * 18),
    playerMoraleBias: clamp(Math.round((nationStrength - hostileStrength) * 0.35 + militaryAbility * 3), -12, 15),
    enemyMoraleBias: clamp(Math.round((hostileStrength - nationStrength) * 0.25), -8, 12),
  };
}

/** 判断一次选择是否应触发军事系统 */
export function isMilitaryCombatChoice(choiceId, choiceText, state) {
  const activeHostiles = (state.hostileForces || []).filter((f) => !f.isDefeated);
  if (!activeHostiles.length) return false;

  const COMBAT_PATTERNS = [
    /军事|征讨|围剿|剿灭|北伐|平叛|出征|攻打|进剿|开拓/,
  ];
  const isMilitary = COMBAT_PATTERNS.some((rx) => rx.test(choiceText || ""));
  const isForcedMilitary = choiceId === "military_expansion_auto";
  return isMilitary || isForcedMilitary;
}

/* ─────────────────────────────────────────────────────────
   四、战斗计算核心
   ───────────────────────────────────────────────────────── */

/**
 * 根据玩家决策计算单回合战场结果
 * @param {object} session  - 战斗会话（含 weather / commanderInjured / ammo 等扩展字段）
 * @param {string} playerDecision - hold | advance | charge | flank | commanderCharge
 * @param {number} [_injuryRoll]  - [测试用] 主将受伤判定随机数（0‒1），默认 Math.random()
 */
export function resolveBattleRound(session, playerDecision, _injuryRoll = Math.random()) {
  const {
    playerUnits,                            // { unitId, count, morale }[]
    enemyUnits,                             // { unitId, count, morale }[]
    formation,                              // formationId
    terrain,                                // 'plain'|'mountain'|'city'
    weather = "clear",                      // 扩展版本：天气
    commanderInjured = false,               // 扩展版本：主将是否负伤
    ammo = { firearm: 99, artillery: 99 },  // 扩展版本：弹药存量（默认不限）
    lastChargeRound = 0,                    // 扩展版本：上次骑兵冲锋的回合（用于 chargeCooldown 判断）
    round,
  } = session;

  const f = resolveFormationById(formation);
  const terrainMod = terrain === "mountain" ? 0.7 : terrain === "city" ? 1.2 : 1.0;

  // 天气修正
  const isRain = weather === "rain";
  const isSnow = weather === "snow";

  // 主将临场决策修正
  const isCommanderCharge = playerDecision === "commanderCharge";
  const commanderEfficiencyMod = commanderInjured ? 0.5 : 1.0; // 负伤后指挥效率 -50%

  // 侧翼包抄：我方防御减半，敌方士气额外下降
  const effectiveDefMod = playerDecision === "flank" ? f.defenseMod * 0.5 : f.defenseMod;
  const flankMoralePenalty = playerDecision === "flank" ? 15 : 0;

  const enemyUnitIds = enemyUnits.map((eu) => eu.unitId);
  const playerUnitIds = playerUnits.map((pu) => pu.unitId);

  // 弹药追踪（副本，避免直接污染 session）
  const updatedAmmo = { firearm: ammo.firearm, artillery: ammo.artillery };

  let playerDmg = 0;
  let enemyDmg = 0;

  // 玩家一方攻击
  playerUnits.forEach((pu) => {
    const unit = resolveUnitById(pu.unitId);
    const moraleMod = clamp(pu.morale / 100, 0.3, 1.0);

    // 火铳装填冷却：奇数回合射击，偶数回合装填
    if (unit.reloadTurns && round % 2 === 0) return;
    // 扩展版本：弹药耗尽则无法射击
    if (unit.id === "firearm" && updatedAmmo.firearm <= 0) return;
    if (unit.id === "artillery" && updatedAmmo.artillery <= 0) return;
    // 扩展版本：雨天火铳哑火
    if (isRain && unit.id === "firearm") return;

    let atk = unit.attack * f.attackMod * moraleMod * terrainMod * commanderEfficiencyMod;

    // 扩展版本：雪天骑兵速度 -40%（攻击力折减）
    if (isSnow && unit.id === "cavalry_guanning") atk *= 0.6;
    // 骑兵冲锋 / 主将亲率均触发冲锋加成（受 chargeCooldown 约束）
    const isChargeCoolingDown = unit.chargeCooldown
      ? lastChargeRound > 0 && (lastChargeRound + unit.chargeCooldown) > round
      : false;
    if ((playerDecision === "charge" || isCommanderCharge) && unit.chargeBonus && !isChargeCoolingDown) {
      atk *= unit.chargeBonus;
    }
    // 炮兵范围伤害
    if (unit.areaDamage) atk *= 1.3;
    // 兵种克制
    if (unit.counters?.some((c) => enemyUnitIds.includes(c))) atk *= 1.4;
    if (unit.weak_against?.some((w) => enemyUnitIds.includes(w))) atk *= 0.7;

    playerDmg += atk * (pu.count / 1000);

    // 消耗弹药（火铳仅奇数回合消耗，炮兵每回合消耗）
    if (unit.id === "firearm" && round % 2 !== 0) {
      updatedAmmo.firearm = Math.max(0, updatedAmmo.firearm - 1);
    }
    if (unit.id === "artillery") {
      updatedAmmo.artillery = Math.max(0, updatedAmmo.artillery - 1);
    }
  });

  // 敌方反击（简化规则：不跟踪弹药/冷却，但天气对火铳的影响对称适用）
  enemyUnits.forEach((eu) => {
    const unit = resolveUnitById(eu.unitId);
    const moraleMod = clamp(eu.morale / 100, 0.3, 1.0);

    // 天气对称性：雨天敌方火铳同样哑火
    if (isRain && unit.id === "firearm") return;

    let atk = unit.attack * moraleMod;

    if (unit.counters?.some((c) => playerUnitIds.includes(c))) atk *= 1.4;
    if (unit.weak_against?.some((w) => playerUnitIds.includes(w))) atk *= 0.7;

    enemyDmg += atk * (eu.count / 1000);
  });

  // 防御减免（含侧翼暴露惩罚）
  const actualEnemyDmg = Math.max(0, enemyDmg / effectiveDefMod);

  const playerLoss = clamp(actualEnemyDmg * 0.08, 0, 0.25);
  const enemyLoss = clamp(playerDmg * 0.08, 0, 0.25);

  // 士气变化：主将亲率+30 / 坚守+5
  const commanderMoraleBonus = isCommanderCharge ? 30 : (playerDecision === "hold" ? 5 : 0);

  const updatedPlayer = playerUnits.map((pu) => ({
    ...pu,
    count: Math.max(0, Math.round(pu.count * (1 - playerLoss))),
    morale: clamp(pu.morale - playerLoss * 60 + commanderMoraleBonus, 10, 100),
  }));

  // 扩展版本：局部溃败扩散 — 低士气编队向友军传染
  const collapsingCount = updatedPlayer.filter((u) => u.morale < 30).length;
  const finalPlayer =
    collapsingCount > 0
      ? updatedPlayer.map((u) => ({
          ...u,
          morale: u.morale < 30 ? u.morale : clamp(u.morale - collapsingCount * 8, 10, 100),
        }))
      : updatedPlayer;

  const updatedEnemy = enemyUnits.map((eu) => ({
    ...eu,
    count: Math.max(0, Math.round(eu.count * (1 - enemyLoss))),
    morale: clamp(eu.morale - enemyLoss * 70 - flankMoralePenalty, 5, 100),
  }));

  const playerTotalAlive = finalPlayer.reduce((s, u) => s + u.count, 0);
  const enemyTotalAlive = updatedEnemy.reduce((s, u) => s + u.count, 0);

  // 胜败判断（双方同回合满足条件时，优先判玩家胜利——设计意图：同归于尽仍算克敌制胜）
  let outcome = "ongoing";
  if (enemyTotalAlive <= 0 || updatedEnemy.every((u) => u.morale < 20)) {
    outcome = "victory";
  } else if (playerTotalAlive <= 0 || finalPlayer.every((u) => u.morale < 20)) {
    outcome = "defeat";
  } else if (round >= session.maxRounds) {
    outcome = playerDmg > enemyDmg / effectiveDefMod ? "victory" : "defeat";
  }

  // 扩展版本：主将负伤判定（commanderCharge 有 20% 概率）
  const commanderInjuredThisRound = isCommanderCharge && _injuryRoll < 0.20;

  // 扩展版本：本回合是否触发了骑兵冲锋（用于 chargeCooldown 跟踪，冷却期内不计入）
  const chargeUsedThisRound = playerDecision === "charge" || isCommanderCharge;

  return {
    updatedPlayer: finalPlayer,
    updatedEnemy,
    playerDmgDealt: Math.round(playerDmg * 10),
    enemyDmgDealt: Math.round(actualEnemyDmg * 10),
    outcome,
    commanderInjuredThisRound,   // 扩展版本：本回合主将是否受伤
    chargeUsedThisRound,          // 扩展版本：本回合是否使用了冲锋指令（供 session.lastChargeRound 更新）
    updatedAmmo,                  // 扩展版本：更新后的弹药存量
  };
}

/** 根据战斗结果推算传递给 handleChoice 的 effects patch */
export function buildBattleEffectsPatch(battleResult, choice) {
  // 深拷贝 hostileDamage 避免污染原始 choice.effects 对象
  const src = choice.effects || {};
  const base = {
    ...src,
    ...(src.hostileDamage ? { hostileDamage: { ...src.hostileDamage } } : {}),
  };

  let hostilePowerDelta = 0;

  if (battleResult.outcome === "victory") {
    const damageBonus = Math.min(20, 8 + Math.round(battleResult.playerMoraleAvg / 10));
    if (base.hostileDamage && typeof base.hostileDamage === "object") {
      for (const key of Object.keys(base.hostileDamage)) {
        base.hostileDamage[key] = (base.hostileDamage[key] || 0) + damageBonus;
      }
      if (battleResult.targetId && typeof base.hostileDamage[battleResult.targetId] === "number") {
        hostilePowerDelta = base.hostileDamage[battleResult.targetId];
      }
    } else if (battleResult.targetId) {
      base.hostileDamage = { [battleResult.targetId]: damageBonus + 8 };
      hostilePowerDelta = base.hostileDamage[battleResult.targetId];
    }
    base.borderThreat = (base.borderThreat || 0) - 4;
    base.civilMorale = (base.civilMorale || 0) + 3;

    // 融合版本：俘虏处理（胜利时歼敌数 × 30% 可俘虏）
    if (battleResult.enemyKilled != null && battleResult.enemyKilled > 0) {
      base.prisoners = Math.round(battleResult.enemyKilled * 0.3);
    }
  } else {
    // defeat: 减轻 hostileDamage，增加 borderThreat
    if (base.hostileDamage) {
      for (const key of Object.keys(base.hostileDamage)) {
        base.hostileDamage[key] = Math.max(0, (base.hostileDamage[key] || 0) - 6);
      }
    }
    hostilePowerDelta = -Math.max(3, Math.round((1 - (battleResult.survivorRatio || 0.8)) * 8 + Math.max(0, 55 - (battleResult.playerMoraleAvg || 50)) / 10));
    base.borderThreat = (base.borderThreat || 0) + 5;
    base.militaryStrength = (base.militaryStrength || 0) - 2;
  }

  // 兵员伤亡折算为 militaryStrength（仅施加惩罚，不截断正向加成）
  const casualtyRate = 1 - (battleResult.survivorRatio || 0.8);
  const militaryPenalty = -Math.round(casualtyRate * 6);
  base.militaryStrength = Math.max(-20, (base.militaryStrength || 0) + militaryPenalty);

  // 融合版本：战后伤兵恢复期（重伤 30 天基准，轻伤按比例）
  base.recoveryDays = Math.round(casualtyRate * 30);
  base.battleOutcome = {
    type: "military",
    outcome: battleResult.outcome,
    targetId: battleResult.targetId || null,
    targetName: battleResult.targetName || null,
    hostilePowerDelta,
    survivorRatio: battleResult.survivorRatio || 0,
    playerMoraleAvg: battleResult.playerMoraleAvg || 0,
  };

  return base;
}

/* ─────────────────────────────────────────────────────────
   五、UI 渲染
   ───────────────────────────────────────────────────────── */

/**
 * 主入口：在 container 内渲染完整军事战斗流程
 * 结束后调用 onComplete(battleResult) 
 *   battleResult = { outcome: 'victory'|'defeat', effectsPatch: {...}, summary: string }
 */
export function runMilitarySystem(container, choice, state, onComplete) {
  // 找到目标敌对势力
  const activeHostiles = (state.hostileForces || []).filter((f) => !f.isDefeated);
  const damageMap = choice.effects?.hostileDamage || {};
  let targetForce =
    activeHostiles.find((f) => damageMap[f.id] != null || damageMap[f.name] != null) ||
    activeHostiles.sort((a, b) => (b.power || 0) - (a.power || 0))[0];

  if (!targetForce) {
    // 无活跃敌对势力，直接跳过
    onComplete({ outcome: "skipped", effectsPatch: choice.effects || {}, summary: "" });
    return;
  }

  // 初始化战场会话
  const session = buildInitialSession(state, targetForce, choice);
  renderDeploymentPhase(container, session, choice, state, targetForce, onComplete);
}

export function buildInitialSession(state, targetForce, choice) {
  const scale = buildBattleScale(state, targetForce);
  const baseCount = scale.playerBaseCount;
  const initialEnemyUnits = buildEnemyUnits(targetForce, scale.enemyBaseCount, scale.enemyMoraleBias);
  // 优先从 choice.text 推断天气，未命中时用 state.weather 兜底（避免全局天气与战场天气脱节）
  const textWeather = deriveWeatherFromText(choice.text || "");
  const sessionWeather = textWeather !== "clear" ? textWeather : deriveWeatherFromText(state.weather || "");
  return {
    initialPlayerCount: baseCount,
    initialEnemyCount: initialEnemyUnits.reduce((s, u) => s + u.count, 0),
    round: 0,
    maxRounds: 3,
    formation: "phalanx",
    terrain: deriveTerrainFromText(choice.text || ""),
    weather: sessionWeather,
    commanderInjured: false,
    lastChargeRound: 0,           // 扩展版本：上次骑兵冲锋回合（chargeCooldown 跟踪）
    ammo: { firearm: 3, artillery: 2 },
    targetId: targetForce.id,
    targetName: targetForce.name,
    playerUnits: [
      { unitId: "infantry_spear", count: Math.round(baseCount * 0.5), morale: clamp(75 + scale.playerMoraleBias, 35, 95) },
      { unitId: "cavalry_guanning", count: Math.round(baseCount * 0.2), morale: clamp(80 + scale.playerMoraleBias, 35, 98) },
      { unitId: "firearm", count: Math.round(baseCount * 0.2), morale: clamp(65 + scale.playerMoraleBias, 30, 92) },
      { unitId: "artillery", count: Math.round(baseCount * 0.1), morale: clamp(60 + scale.playerMoraleBias, 30, 90) },
    ],
    enemyUnits: initialEnemyUnits,
    roundHistory: [],
  };
}

function deriveTerrainFromText(text) {
  if (/山|山地|山区/.test(text)) return "mountain";
  if (/城|城池|守城|攻城/.test(text)) return "city";
  return "plain";
}

/** 扩展版本：从文本推断天气（雨/雪/晴） */
export function deriveWeatherFromText(text) {
  if (/雨|雨天|潮湿|阴雨/.test(text)) return "rain";
  if (/雪|雪地|冬|冰/.test(text)) return "snow";
  return "clear";
}

export function buildEnemyUnits(force, baseCount = null, moraleBias = 0) {
  const base = typeof baseCount === "number"
    ? Math.max(1500, Math.round(baseCount))
    : clamp(force.power || 50, 10, 100) * 50;
  return [
    { unitId: "infantry_spear", count: Math.round(base * 0.6), morale: clamp(65 + moraleBias, 30, 95) },
    { unitId: "cavalry_guanning", count: Math.round(base * 0.25), morale: clamp(70 + moraleBias, 30, 96) },
    { unitId: "firearm", count: Math.round(base * 0.15), morale: clamp(55 + moraleBias, 25, 90) },
  ];
}

/* ---- 阶段一：战前部署 ---- */
function renderDeploymentPhase(container, session, choice, state, targetForce, onComplete) {
  const overlay = createMilitaryOverlay();

  const inner = overlay.querySelector(".mil-inner");
  inner.innerHTML = "";

  // 标题
  const hdr = el("div", "mil-phase-title", `⚔️ 战前部署 — 征讨${targetForce.name}`);
  inner.appendChild(hdr);

  const sub = el("div", "mil-phase-sub", `地形：${terrainLabel(session.terrain)}　目标势力值：${targetForce.power}/100`);
  inner.appendChild(sub);

  // 兵力概况
  const unitsWrap = el("div", "mil-units-row");
  session.playerUnits.forEach((pu) => {
    const unit = resolveUnitById(pu.unitId);
    const card = el("div", "mil-unit-card");
    card.innerHTML = `<div class="mil-unit-icon">${unit.icon}</div><div class="mil-unit-name">${unit.name}</div><div class="mil-unit-count">${pu.count.toLocaleString()}人</div>`;
    unitsWrap.appendChild(card);
  });
  inner.appendChild(el("div", "mil-section-label", "我方兵力配置"));
  inner.appendChild(unitsWrap);

  // 阵型选择
  inner.appendChild(el("div", "mil-section-label", "选择初始阵型"));
  const formationRow = el("div", "mil-formation-row");
  let selectedFormation = session.formation;
  const formationBtns = [];

  FORMATIONS.forEach((f) => {
    const btn = el("button", "mil-formation-btn" + (f.id === selectedFormation ? " mil-formation-btn--active" : ""));
    btn.type = "button";
    btn.innerHTML = `<span class="mil-formation-icon">${f.icon}</span><span class="mil-formation-name">${f.name}</span><span class="mil-formation-desc">${f.desc}</span>`;
    btn.addEventListener("click", () => {
      selectedFormation = f.id;
      formationBtns.forEach((b, i) => {
        b.classList.toggle("mil-formation-btn--active", FORMATIONS[i].id === selectedFormation);
      });
    });
    formationBtns.push(btn);
    formationRow.appendChild(btn);
  });
  inner.appendChild(formationRow);

  // 开战按钮
  const startBtn = el("button", "mil-primary-btn", "⚔️ 开始作战");
  startBtn.type = "button";
  startBtn.addEventListener("click", () => {
    session.formation = selectedFormation;
    session.round = 0;
    renderBattlePhase(overlay, session, choice, state, targetForce, onComplete);
  });
  inner.appendChild(startBtn);

  container.appendChild(overlay);
  overlay.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---- 阶段二：战场推演回合 ---- */
function renderBattlePhase(overlay, session, choice, state, targetForce, onComplete) {
  const inner = overlay.querySelector(".mil-inner");
  inner.innerHTML = "";

  session.round += 1;

  const playerTotal = session.playerUnits.reduce((s, u) => s + u.count, 0);
  const enemyTotal = session.enemyUnits.reduce((s, u) => s + u.count, 0);
  const avgPlayerMorale = Math.round(
    session.playerUnits.reduce((s, u) => s + u.morale, 0) / session.playerUnits.length
  );
  const battleLabels = resolveWorldviewBattleLabels(state);

  inner.appendChild(el("div", "mil-phase-title", `⚔️ 第 ${session.round} / ${session.maxRounds} 回合 — 与${targetForce.name}交战`));

  // 扩展版本：天气提示
  if (session.weather === "rain") {
    inner.appendChild(el("div", "mil-phase-sub mil-phase-sub--warn", "🌧️ 天气：雨天 — 火铳哑火，弓箭射程减半"));
  } else if (session.weather === "snow") {
    inner.appendChild(el("div", "mil-phase-sub mil-phase-sub--warn", "❄️ 天气：雪天 — 骑兵移速 -40%，攻击力折减"));
  }

  // 扩展版本：主将负伤提示
  if (session.commanderInjured) {
    inner.appendChild(el("div", "mil-phase-sub mil-phase-sub--warn", "🩸 主将负伤！全军指挥效率 -50%"));
  }

  // 战场态势
  const statusRow = el("div", "mil-status-row");
  statusRow.appendChild(buildStatusCard(`🏳 ${battleLabels.playerForceLabel}`, playerTotal, avgPlayerMorale, "player"));
  statusRow.appendChild(buildStatusCard(`🚩 ${targetForce.name}`, enemyTotal, Math.round(session.enemyUnits.reduce((s, u) => s + u.morale, 0) / session.enemyUnits.length), "enemy"));
  inner.appendChild(statusRow);

  // 扩展版本：弹药状态
  if (session.ammo) {
    const ammoText = `弹药 — 火铳：剩余 ${session.ammo.firearm} 次射击　炮兵：剩余 ${session.ammo.artillery} 次射击`;
    inner.appendChild(el("div", "mil-section-label", ammoText));
  }

  // 当前阵型
  const curF = resolveFormationById(session.formation);
  inner.appendChild(el("div", "mil-section-label", `当前阵型：${curF.icon} ${curF.name}（可临阵换阵）`));

  const formationRow = el("div", "mil-formation-row mil-formation-row--compact");
  let selectedFormation = session.formation;
  const formationBtns = [];
  FORMATIONS.forEach((f) => {
    const btn = el("button", "mil-formation-btn mil-formation-btn--sm" + (f.id === selectedFormation ? " mil-formation-btn--active" : ""));
    btn.type = "button";
    btn.textContent = `${f.icon} ${f.name}`;
    btn.addEventListener("click", () => {
      selectedFormation = f.id;
      formationBtns.forEach((b, i) => {
        b.classList.toggle("mil-formation-btn--active", FORMATIONS[i].id === selectedFormation);
      });
    });
    formationBtns.push(btn);
    formationRow.appendChild(btn);
  });
  inner.appendChild(formationRow);

  // 决策选项（扩展版本：新增主将亲率）
  inner.appendChild(el("div", "mil-section-label", "本回合指令"));
  // 扩展版本：计算骑兵冲锋冷却状态（chargeCooldown:2）
  const cavalryDef = UNIT_TYPES.find((u) => u.id === "cavalry_guanning");
  const chargeCooldown = cavalryDef?.chargeCooldown || 0;
  const chargeOnCooldown = chargeCooldown > 0 && session.lastChargeRound > 0
    && (session.lastChargeRound + chargeCooldown) > session.round;
  const chargeHint = chargeOnCooldown
    ? `⏳ 冲锋冷却中（上次第${session.lastChargeRound}回合），下回合可用`
    : "高伤害突破，若遇长枪方阵易受损";
  const decisions = [
    { id: "hold",            label: "🛡️ 坚守待机",    hint: "防御加强，等待战机，士气稳固" },
    { id: "advance",         label: "⚔️ 稳步推进",   hint: "均衡进攻，消耗敌力" },
    { id: "charge",          label: "🐎 骑兵冲锋",    hint: chargeHint },
    { id: "flank",           label: "🌀 侧翼包抄",    hint: "绕后打击，敌士气大损，但我方暴露" },
    {
      id: "commanderCharge",
      label: "🗡️ 主将亲率",
      hint: session.commanderInjured
        ? `（主将已负伤，指挥效率 -50%；全军士气仍+30${chargeCooldown > 0 ? "，受冲锋冷却影响" : ""}）`
        : "全军士气+30，有 20% 主将负伤风险",
    },
  ];

  const decisionWrap = el("div", "mil-decisions");
  decisions.forEach((d) => {
    const btn = el("button", "mil-decision-btn");
    btn.type = "button";
    btn.innerHTML = `<span class="mil-decision-label">${d.label}</span><span class="mil-decision-hint">${d.hint}</span>`;
    btn.addEventListener("click", () => {
      session.formation = selectedFormation;
      const roundResult = resolveBattleRound(session, d.id);
      session.playerUnits = roundResult.updatedPlayer;
      session.enemyUnits = roundResult.updatedEnemy;
      // 扩展版本：更新主将状态、弹药、骑兵冲锋冷却
      if (roundResult.commanderInjuredThisRound) session.commanderInjured = true;
      if (roundResult.chargeUsedThisRound) session.lastChargeRound = session.round;
      if (roundResult.updatedAmmo) session.ammo = roundResult.updatedAmmo;
      session.roundHistory.push({
        round: session.round,
        decision: d.label,
        playerDmg: roundResult.playerDmgDealt,
        enemyDmg: roundResult.enemyDmgDealt,
        outcome: roundResult.outcome,
      });

      if (roundResult.outcome !== "ongoing") {
        renderSummaryPhase(overlay, session, roundResult.outcome, choice, state, targetForce, onComplete);
      } else {
        renderBattlePhase(overlay, session, choice, state, targetForce, onComplete);
      }
    });
    decisionWrap.appendChild(btn);
  });
  inner.appendChild(decisionWrap);

  // 战斗日志
  if (session.roundHistory.length > 0) {
    inner.appendChild(el("div", "mil-section-label", "战斗日志"));
    const log = el("div", "mil-battle-log");
    session.roundHistory.forEach((r) => {
      const line = el("div", "mil-log-line", `第${r.round}回合【${r.decision}】 击伤敌军 ${r.playerDmg} · 我方受损 ${r.enemyDmg}`);
      log.appendChild(line);
    });
    inner.appendChild(log);
  }
}

/* ---- 阶段三：战斗总结 ---- */
function renderSummaryPhase(overlay, session, outcome, choice, state, targetForce, onComplete) {
  const inner = overlay.querySelector(".mil-inner");
  inner.innerHTML = "";

  const isVictory = outcome === "victory";
  const battleLabels = resolveWorldviewBattleLabels(state);
  const playerSurvivorCount = session.playerUnits.reduce((s, u) => s + u.count, 0);
  const initialPlayerCount = session.initialPlayerCount || (5000 + (state.playerAbilities?.military || 0) * 500);
  const survivorRatio = initialPlayerCount > 0 ? playerSurvivorCount / initialPlayerCount : 0.8;
  const playerMoraleAvg = Math.round(
    session.playerUnits.reduce((s, u) => s + u.morale, 0) / Math.max(1, session.playerUnits.length)
  );

  // 融合版本：计算歼敌数与俘虏
  const enemySurvivorCount = session.enemyUnits.reduce((s, u) => s + u.count, 0);
  const enemyKilled = Math.max(0, (session.initialEnemyCount || 0) - enemySurvivorCount);

  inner.appendChild(
    el("div", `mil-phase-title ${isVictory ? "mil-phase-title--victory" : "mil-phase-title--defeat"}`,
      isVictory ? `🏆 战斗告捷 — ${targetForce.name}重创` : `💀 兵败鸣金 — 撤军收兵`)
  );

  // 总结数据
  const statsGrid = el("div", "mil-stats-grid");
  const stats = [
    { label: "作战回合", value: `${session.round} 回合` },
    { label: "我方存活", value: `${playerSurvivorCount.toLocaleString()}人（${Math.round(survivorRatio * 100)}%）` },
    { label: `${battleLabels.playerForceLabel}平均士气`, value: `${playerMoraleAvg}/100` },
    { label: "目标势力", value: `${targetForce.name}` },
    { label: "战果评定", value: isVictory ? "✅ 胜利" : "❌ 败退" },
  ];
  if (isVictory && enemyKilled > 0) {
    stats.push({ label: "歼敌数", value: `${enemyKilled.toLocaleString()}人` });
    stats.push({ label: "可俘虏兵力", value: `约 ${Math.round(enemyKilled * 0.3).toLocaleString()}人` });
  }
  const recoveryDays = Math.round((1 - survivorRatio) * 30);
  if (recoveryDays > 0) {
    stats.push({ label: "伤兵恢复期", value: `${recoveryDays} 天` });
  }
  stats.forEach(({ label, value }) => {
    const card = el("div", "mil-stat-card");
    card.innerHTML = `<div class="mil-stat-label">${label}</div><div class="mil-stat-value">${value}</div>`;
    statsGrid.appendChild(card);
  });
  inner.appendChild(statsGrid);

  // 战斗历程
  if (session.roundHistory.length) {
    inner.appendChild(el("div", "mil-section-label", "作战经过"));
    const log = el("div", "mil-battle-log");
    session.roundHistory.forEach((r) => {
      const line = el("div", "mil-log-line", `第${r.round}回合【${r.decision}】 击伤 ${r.playerDmg} / 受损 ${r.enemyDmg}`);
      log.appendChild(line);
    });
    inner.appendChild(log);
  }

  // 影响预示
  const effectsPatch = buildBattleEffectsPatch(
    { outcome, survivorRatio, playerMoraleAvg, targetId: targetForce.id, targetName: targetForce.name, enemyKilled },
    choice
  );
  const impactLines = buildImpactLines(effectsPatch, isVictory);
  if (impactLines.length) {
    inner.appendChild(el("div", "mil-section-label", "战后影响（将写入本回合结算）"));
    const impactWrap = el("div", "mil-impacts");
    impactLines.forEach((line) => {
      impactWrap.appendChild(el("div", "mil-impact-line", line));
    });
    inner.appendChild(impactWrap);
  }

  // 继续按钮
  const continueBtn = el("button", "mil-primary-btn", "返回诏书界面 →");
  continueBtn.type = "button";
  continueBtn.addEventListener("click", () => {
    overlay.remove();
    const summary = buildSummaryText(session, outcome, targetForce, state);
    onComplete({
      outcome,
      effectsPatch,
      summary,
      survivorRatio,
      playerMoraleAvg,
      targetId: targetForce.id,
    });
  });
  inner.appendChild(continueBtn);
}

/* ─────────────────────────────────────────────────────────
   六、DOM 辅助
   ───────────────────────────────────────────────────────── */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function createMilitaryOverlay() {
  const existing = document.getElementById("mil-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "mil-overlay";
  overlay.className = "mil-overlay";

  const inner = document.createElement("div");
  inner.className = "mil-inner";
  overlay.appendChild(inner);

  return overlay;
}

function buildStatusCard(label, count, morale, side) {
  const card = el("div", `mil-status-card mil-status-card--${side}`);
  const moraleClass = morale >= 60 ? "good" : morale >= 35 ? "warn" : "danger";
  card.innerHTML = `
    <div class="mil-status-card__label">${label}</div>
    <div class="mil-status-card__count">${count.toLocaleString()} 人</div>
    <div class="mil-status-card__morale">
      士气 <span class="mil-morale--${moraleClass}">${morale}</span>/100
    </div>`;
  return card;
}

function terrainLabel(t) {
  return t === "mountain" ? "山地" : t === "city" ? "城池" : "平原";
}

function buildImpactLines(patch, isVictory) {
  const lines = [];
  if (isVictory) {
    lines.push("✅ 敌势受重创，可能触发残部覆灭");
  } else {
    lines.push("❌ 进攻受挫，敌势将反弹");
  }
  if (typeof patch.militaryStrength === "number" && patch.militaryStrength < 0) {
    lines.push(`⚔ 兵力损耗 → 军力 ${patch.militaryStrength}`);
  }
  if (typeof patch.borderThreat === "number") {
    const sign = patch.borderThreat > 0 ? "+" : "";
    lines.push(`🛡 边境威胁 ${sign}${patch.borderThreat}`);
  }
  if (typeof patch.civilMorale === "number" && patch.civilMorale !== 0) {
    const sign = patch.civilMorale > 0 ? "+" : "";
    lines.push(`❤ 民心 ${sign}${patch.civilMorale}`);
  }
  // 融合版本：俘虏与恢复期
  if (typeof patch.prisoners === "number" && patch.prisoners > 0) {
    lines.push(`⚓ 俘虏 ${patch.prisoners.toLocaleString()}人（可收编/释放/斩杀）`);
  }
  if (typeof patch.recoveryDays === "number" && patch.recoveryDays > 0) {
    lines.push(`🏥 伤兵恢复期约 ${patch.recoveryDays} 天`);
  }
  return lines;
}

function buildSummaryText(session, outcome, targetForce, state) {
  const isVictory = outcome === "victory";
  const battleLabels = resolveWorldviewBattleLabels(state);
  const playerForceLabel = battleLabels.playerForceLabel || "我军";
  const roundsText = session.roundHistory.map((r) => `第${r.round}回合：${r.decision}`).join("；");
  return isVictory
    ? `历经 ${session.round} 回合激战（${roundsText}），${playerForceLabel}大破${targetForce.name}，敌势力值大幅下降。`
    : `历经 ${session.round} 回合（${roundsText}），攻势受阻，${playerForceLabel}鸣金撤军，${targetForce.name}趁机反扑。`;
}
