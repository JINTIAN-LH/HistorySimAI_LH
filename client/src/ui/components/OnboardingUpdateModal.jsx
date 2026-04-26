import React from "react";

export function OnboardingUpdateModal({
  open = false,
  title = "开局提示",
  guideItems = [],
  updateItems = [],
  onConfirm,
}) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
        padding: "16px",
      }}
    >
      <div
        style={{
          width: "min(760px, 96vw)",
          maxHeight: "86vh",
          background: "var(--color-surface, #f1f4ed)",
          color: "var(--color-text-main)",
          borderRadius: "10px",
          border: "1px solid var(--color-border-soft, #c9d3bf)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid var(--color-border-soft, #c9d3bf)",
          }}
        >
          <div style={{ fontSize: "15px", fontWeight: 700 }}>{title}</div>
          <div style={{ marginTop: "4px", fontSize: "12px", color: "var(--color-text-sub)" }}>
            30 秒看完这局怎么推进，以及这版有哪些体验升级。
          </div>
        </div>

        <div style={{ padding: "12px 14px", overflow: "auto", display: "grid", gap: "12px" }}>
          <section>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>玩法引导</div>
            <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", lineHeight: 1.7 }}>
              {guideItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>最近更新</div>
            <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", lineHeight: 1.7 }}>
              {updateItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>

        <div
          style={{
            padding: "10px 14px 14px",
            borderTop: "1px solid var(--color-border-soft, #c9d3bf)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button type="button" className="ui-btn ui-btn--primary" onClick={onConfirm}>
            <div className="ui-btn__title">开始体验</div>
            <div className="ui-btn__desc">继续进入本局并开启目标追踪。</div>
          </button>
        </div>
      </div>
    </div>
  );
}
