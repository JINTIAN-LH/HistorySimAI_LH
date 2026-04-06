import { router } from "../router.js";
import { runCurrentTurn } from "../systems/turnSystem.js";
import { createGameplayPageTemplate } from "./viewPrimitives.js";

export async function renderEdictView(container, options = {}) {
  const { useLegacyLayout = false } = options;
  container.classList.add("main-view--edict");
  container.innerHTML = "";

  if (useLegacyLayout) {
    container._storyLayout = null;
    container._storyRenderId = (container._storyRenderId || 0) + 1;
    await runCurrentTurn(container, { renderId: container._storyRenderId });
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    return;
  }

  const template = createGameplayPageTemplate({
    pageClass: "edict-page",
    title: "诏书中枢",
    subtitle: "将剧情正文、诏令选择、奏报与自拟诏书入口固定在统一玩法骨架内，后续主玩法扩展继续沿用这一页模板。",
    actionsTitle: "诏令选择",
    actionsHint: "固定保留选择区与自拟诏书入口，季度议题锁定后也在这里继续操作。",
    dataTitle: "奏报与回响",
    dataHint: "把新闻流和舆论反馈固定在数据区，减少主玩法页面的信息漂移。",
    mainTitle: "诏书正文",
    mainHint: "正文区继续承载历史记录、当回合文本、批注和数值反馈。",
  });

  template.root._storyLayout = {
    mainBody: template.mainBody,
    actionsBody: template.actionsBody,
    dataBody: template.dataBody,
  };
  template.root._storyRenderId = (container._storyRenderId || 0) + 1;
  container._storyRenderId = template.root._storyRenderId;
  container.appendChild(template.root);

  await runCurrentTurn(template.root, { renderId: template.root._storyRenderId });
  requestAnimationFrame(() => {
    template.mainBody.scrollTop = template.mainBody.scrollHeight;
  });
}

export function removeEdictPanelsWrap() {
  const panels = document.querySelectorAll(".edict-panels-wrap");
  panels.forEach((panel) => panel.remove());
}

export function registerEdictView() {
  router.registerView("edict", renderEdictView);
}
