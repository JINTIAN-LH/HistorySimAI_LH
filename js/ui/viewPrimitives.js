function joinClasses(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function createElement(tagName, options = {}) {
  const {
    className = "",
    text = null,
    attrs = {},
    dataset = {},
    children = [],
  } = options;
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== null && text !== undefined) element.textContent = text;

  Object.entries(attrs).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    element.setAttribute(key, String(value));
  });

  Object.entries(dataset).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    element.dataset[key] = String(value);
  });

  children.forEach((child) => {
    if (!child) return;
    element.appendChild(child);
  });

  return element;
}

export function createViewShell({ className = "", title = "", subtitle = "", centered = false } = {}) {
  const root = createElement("div", {
    className: joinClasses("view-shell", centered && "view-shell--centered", className),
  });

  let header = null;
  if (title || subtitle) {
    header = createElement("div", { className: "view-shell__header" });
    if (title) {
      header.appendChild(createElement("div", { className: "view-title", text: title }));
    }
    if (subtitle) {
      header.appendChild(createElement("div", { className: "view-subtitle", text: subtitle }));
    }
    root.appendChild(header);
  }

  const content = createElement("div", { className: "view-shell__content" });
  root.appendChild(content);

  return { root, header, content };
}

export function createSectionCard({ className = "", title = "", hint = "" } = {}) {
  const section = createElement("section", {
    className: joinClasses("section-card", className),
  });
  let header = null;
  if (title || hint) {
    header = createElement("div", { className: "section-card__header" });
    if (title) {
      header.appendChild(createElement("div", { className: "section-card__title", text: title }));
    }
    if (hint) {
      header.appendChild(createElement("div", { className: "section-card__hint", text: hint }));
    }
    section.appendChild(header);
  }
  const body = createElement("div", { className: "section-card__body" });
  section.appendChild(body);
  return { section, header, body };
}

export function createFoldPanel({ className = "", title = "", hint = "", open = false } = {}) {
  const section = createElement("section", {
    className: joinClasses("fold-section", open && "fold-section--open", className),
  });
  const header = createElement("button", {
    className: "fold-header",
    attrs: {
      type: "button",
      "aria-expanded": open ? "true" : "false",
    },
  });
  const content = createElement("div", { className: "fold-header__content" });
  content.appendChild(createElement("div", { className: "fold-header__title", text: title }));
  if (hint) {
    content.appendChild(createElement("div", { className: "fold-header__hint", text: hint }));
  }
  const arrow = createElement("span", { className: "fold-arrow", text: "▶" });
  header.appendChild(content);
  header.appendChild(arrow);

  const body = createElement("div", { className: "fold-body" });

  const setOpen = (value) => {
    const nextOpen = Boolean(value);
    section.classList.toggle("fold-section--open", nextOpen);
    header.setAttribute("aria-expanded", nextOpen ? "true" : "false");
  };

  header.addEventListener("click", () => {
    setOpen(!section.classList.contains("fold-section--open"));
  });

  section.appendChild(header);
  section.appendChild(body);

  return {
    title,
    section,
    header,
    body,
    open() {
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
    toggle() {
      setOpen(!section.classList.contains("fold-section--open"));
    },
  };
}

export function createFeedCard({
  className = "",
  icon = "",
  title = "",
  summary = "",
  meta = "",
  tags = [],
} = {}) {
  const card = createElement("article", {
    className: joinClasses("feed-card", className),
  });

  if (icon) {
    card.appendChild(createElement("div", { className: "feed-card__icon", text: icon }));
  }

  const body = createElement("div", { className: "feed-card__body" });
  const head = createElement("div", { className: "feed-card__head" });
  const titleRow = createElement("div", { className: "feed-card__title-row" });
  titleRow.appendChild(createElement("div", { className: "feed-card__title", text: title }));

  if (Array.isArray(tags) && tags.length) {
    const tagRow = createElement("div", { className: "feed-card__tags" });
    tags.forEach((tag) => {
      if (!tag || !tag.text) return;
      tagRow.appendChild(createElement("span", {
        className: joinClasses("feed-card__tag", tag.className),
        text: tag.text,
      }));
    });
    titleRow.appendChild(tagRow);
  }

  head.appendChild(titleRow);
  if (meta) {
    head.appendChild(createElement("div", { className: "feed-card__meta", text: meta }));
  }
  body.appendChild(head);

  if (summary) {
    body.appendChild(createElement("div", { className: "feed-card__summary", text: summary }));
  }

  card.appendChild(body);
  return { card, body, head };
}

export function createOverlayPanel({
  overlayId = "",
  overlayClassName = "",
  panelClassName = "",
  title = "",
  subtitle = "",
  bodyClassName = "",
  footerClassName = "",
  closeLabel = "✕",
  onClose = null,
} = {}) {
  const overlay = createElement("div", {
    className: joinClasses("overlay-panel", overlayClassName),
  });
  if (overlayId) {
    overlay.id = overlayId;
  }

  const panel = createElement("div", {
    className: joinClasses("overlay-panel__card", panelClassName),
  });

  const header = createElement("div", { className: "overlay-panel__header" });
  const titleWrap = createElement("div", { className: "overlay-panel__title-wrap" });
  titleWrap.appendChild(createElement("div", { className: "overlay-panel__title", text: title }));
  if (subtitle) {
    titleWrap.appendChild(createElement("div", { className: "overlay-panel__subtitle", text: subtitle }));
  }

  const closeButton = createElement("button", {
    className: "overlay-panel__close",
    text: closeLabel,
    attrs: { type: "button", "aria-label": "关闭" },
  });
  if (typeof onClose === "function") {
    closeButton.addEventListener("click", onClose);
  }

  header.appendChild(titleWrap);
  header.appendChild(closeButton);

  const body = createElement("div", {
    className: joinClasses("overlay-panel__body", bodyClassName),
  });
  const footer = createElement("div", {
    className: joinClasses("overlay-panel__footer", footerClassName),
  });

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);
  overlay.appendChild(panel);

  return { overlay, panel, header, body, footer, closeButton };
}

export function createGameplayPageTemplate({
  pageClass = "",
  title = "",
  subtitle = "",
  actionsTitle = "操作区",
  actionsHint = "",
  dataTitle = "数据区",
  dataHint = "",
  mainTitle = "玩法区",
  mainHint = "",
} = {}) {
  const { root, header, content } = createViewShell({
    className: joinClasses("gameplay-page", pageClass),
    title,
    subtitle,
  });

  const actions = createSectionCard({
    className: "gameplay-page__section gameplay-page__section--actions",
    title: actionsTitle,
    hint: actionsHint,
  });
  const data = createSectionCard({
    className: "gameplay-page__section gameplay-page__section--data",
    title: dataTitle,
    hint: dataHint,
  });
  const main = createSectionCard({
    className: "gameplay-page__section gameplay-page__section--main",
    title: mainTitle,
    hint: mainHint,
  });

  content.appendChild(actions.section);
  content.appendChild(data.section);
  content.appendChild(main.section);

  return {
    root,
    header,
    content,
    actionsSection: actions.section,
    actionsBody: actions.body,
    dataSection: data.section,
    dataBody: data.body,
    mainSection: main.section,
    mainBody: main.body,
  };
}

export function createActionButton({
  label,
  description = "",
  variant = "secondary",
  selected = false,
  block = true,
  disabled = false,
  className = "",
} = {}) {
  const button = createElement("button", {
    className: joinClasses(
      "ui-btn",
      `ui-btn--${variant}`,
      block && "ui-btn--block",
      selected && "ui-btn--selected",
      className,
    ),
    attrs: { type: "button" },
  });
  button.disabled = Boolean(disabled);
  button.appendChild(createElement("div", { className: "ui-btn__title", text: label || "" }));
  if (description) {
    button.appendChild(createElement("div", { className: "ui-btn__desc", text: description }));
  }
  return button;
}

export function createInfoLine(label, value, { className = "" } = {}) {
  const row = createElement("div", {
    className: joinClasses("info-line", className),
  });
  row.appendChild(createElement("span", { className: "info-line__label", text: label }));
  row.appendChild(createElement("span", { className: "info-line__value", text: value }));
  return row;
}

export function createStatCard({ label = "", value = "", detail = "", className = "" } = {}) {
  const card = createElement("div", {
    className: joinClasses("ui-stat-card", className),
  });
  card.appendChild(createElement("div", { className: "ui-stat-card__label", text: label }));
  card.appendChild(createElement("div", { className: "ui-stat-card__value", text: value }));
  if (detail) {
    card.appendChild(createElement("div", { className: "ui-stat-card__detail", text: detail }));
  }
  return card;
}

export function createButtonRow({ className = "" } = {}) {
  return createElement("div", {
    className: joinClasses("button-row", className),
  });
}

export function createTag(text, { className = "" } = {}) {
  return createElement("span", {
    className: joinClasses("ui-tag", className),
    text,
  });
}