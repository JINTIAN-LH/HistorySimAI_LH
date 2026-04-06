import { describe, expect, it } from "vitest";
import { createActionButton, createFeedCard, createFoldPanel, createGameplayPageTemplate, createInfoLine, createOverlayPanel, createSectionCard, createStatCard, createViewShell } from "./viewPrimitives.js";

describe("viewPrimitives", () => {
  it("creates a view shell with header and content container", () => {
    const { root, header, content } = createViewShell({
      title: "设置",
      subtitle: "统一入口",
      centered: true,
    });

    expect(root.className).toContain("view-shell");
    expect(root.className).toContain("view-shell--centered");
    expect(header?.textContent).toContain("设置");
    expect(header?.textContent).toContain("统一入口");
    expect(content.className).toBe("view-shell__content");
  });

  it("creates a section card with title, hint and body", () => {
    const { section, header, body } = createSectionCard({
      title: "玩法模式",
      hint: "用于快速切换",
    });

    expect(section.className).toContain("section-card");
    expect(header?.textContent).toContain("玩法模式");
    expect(header?.textContent).toContain("用于快速切换");
    expect(body.className).toBe("section-card__body");
  });

  it("creates buttons and info rows with expected semantic classes", () => {
    const button = createActionButton({
      label: "保存",
      description: "写入指定槽位",
      variant: "primary",
      selected: true,
      block: false,
    });
    const info = createInfoLine("当前进度", "崇祯三年四月");

    expect(button.className).toContain("ui-btn--primary");
    expect(button.className).toContain("ui-btn--selected");
    expect(button.textContent).toContain("保存");
    expect(button.textContent).toContain("写入指定槽位");
    expect(info.className).toBe("info-line");
    expect(info.textContent).toContain("当前进度");
    expect(info.textContent).toContain("崇祯三年四月");
  });

  it("creates a gameplay page template with fixed action, data and main regions", () => {
    const template = createGameplayPageTemplate({
      title: "国家总览",
      actionsTitle: "快捷操作",
      dataTitle: "核心数据",
      mainTitle: "玩法面板",
    });
    const statCard = createStatCard({ label: "未读奏对", value: "3", detail: "等待处理" });

    template.dataBody.appendChild(statCard);

    expect(template.root.className).toContain("gameplay-page");
    expect(template.actionsSection.textContent).toContain("快捷操作");
    expect(template.dataSection.textContent).toContain("核心数据");
    expect(template.mainSection.textContent).toContain("玩法面板");
    expect(template.dataBody.textContent).toContain("未读奏对");
    expect(template.dataBody.textContent).toContain("等待处理");
  });

  it("creates reusable fold panels and feed cards", () => {
    const panel = createFoldPanel({
      title: "天下大事",
      hint: "用于统一折叠内容区",
      open: true,
    });
    const feedCard = createFeedCard({
      icon: "📜",
      title: "辽东军报",
      summary: "边防需补饷增援。",
      meta: "关联：军务、边防",
      tags: [{ text: "急", className: "feed-card__tag--urgent" }],
    });

    panel.body.appendChild(feedCard.card);

    expect(panel.section.className).toContain("fold-section");
    expect(panel.section.className).toContain("fold-section--open");
    expect(panel.header.getAttribute("aria-expanded")).toBe("true");
    expect(panel.body.textContent).toContain("辽东军报");
    expect(feedCard.card.className).toContain("feed-card");
    expect(feedCard.card.textContent).toContain("边防需补饷增援");
  });

  it("creates a reusable overlay panel shell", () => {
    const panel = createOverlayPanel({
      overlayId: "panel-test",
      title: "朝堂派系",
      subtitle: "统一弹窗骨架",
    });

    expect(panel.overlay.id).toBe("panel-test");
    expect(panel.overlay.className).toContain("overlay-panel");
    expect(panel.panel.className).toContain("overlay-panel__card");
    expect(panel.header.textContent).toContain("朝堂派系");
    expect(panel.header.textContent).toContain("统一弹窗骨架");
  });
});