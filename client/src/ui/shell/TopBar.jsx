import { router } from "@legacy/router.js";
import { showGoalPanel } from "@ui/goalPanel.js";
import { checkGoalCompleted } from "@systems/goalCheck.js";
import { shallowEqual, useLegacySelector } from "@client/ui/hooks/useLegacySelector.js";

function buildTopbarStatus(state) {
  if (!state) return "";
  const config = state.config || {};
  const phaseLabels = config.phaseLabels || {
    morning: "早朝",
    afternoon: "午后",
    evening: "夜间",
  };
  const phaseKey = state.currentPhase || "morning";
  const phaseLabel = phaseLabels[phaseKey] || "";
  const year = state.currentYear || 3;
  const month = state.currentMonth || 4;
  const weather = state.weather ? `·${state.weather}` : "";
  return `建炎${year}年·${month}月·${phaseLabel}${weather}`;
}

function buildGoalText(state) {
  const goals = state?.goals || [];
  const trackedId = state?.trackedGoalId;
  if (!trackedId) {
    return goals.length > 0 ? "点击查看目标" : "";
  }
  const trackedGoal = goals.find((goal) => goal.id === trackedId);
  if (!trackedGoal) {
    return goals.length > 0 ? "点击查看目标" : "";
  }
  if (checkGoalCompleted(trackedId, state)) {
    return `${trackedGoal.title}（已完成）`;
  }
  return trackedGoal.title;
}

export function TopBar() {
  const state = useLegacySelector(
    (currentState) => ({
      config: currentState.config,
      currentPhase: currentState.currentPhase,
      currentYear: currentState.currentYear,
      currentMonth: currentState.currentMonth,
      weather: currentState.weather,
      goals: currentState.goals,
      trackedGoalId: currentState.trackedGoalId,
    }),
    shallowEqual
  );

  return (
    <header id="topbar" data-ui-shell="react">
      <div className="topbar-left">
        <div id="topbar-status" className="topbar-subtitle">
          {buildTopbarStatus(state)}
        </div>
        <button
          id="topbar-goal-bar"
          className="topbar-goal-bar"
          type="button"
          onClick={() => showGoalPanel()}
        >
          <span className="goal-tag">目标</span>
          <span id="topbar-goal-text" className="topbar-goal-text">
            {buildGoalText(state)}
          </span>
        </button>
      </div>
      <div className="topbar-right">
        <button
          type="button"
          className="topbar-settings-btn"
          aria-label="设置"
          onClick={() => router.setView(router.VIEW_IDS.SETTINGS)}
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
