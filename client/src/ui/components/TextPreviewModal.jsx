import React, { useEffect, useState } from "react";

export function TextPreviewModal({
  open = false,
  title = "文本预览",
  text = "",
  loading = false,
  error = "",
  onClose,
  emptyText = "（内容为空）",
  copyLabel = "复制全文",
  copiedLabel = "已复制",
  copyFailedLabel = "复制失败",
}) {
  const [copyHint, setCopyHint] = useState("");

  useEffect(() => {
    if (open) {
      setCopyHint("");
    }
  }, [open, text]);

  if (!open) return null;

  const handleCopy = async () => {
    if (!text) return;
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(text);
      setCopyHint(copiedLabel);
    } catch (_error) {
      setCopyHint(copyFailedLabel);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
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
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(960px, 96vw)",
          maxHeight: "85vh",
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
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            padding: "10px 12px",
            borderBottom: "1px solid var(--color-border-soft, #c9d3bf)",
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: "600" }}>{title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button type="button" onClick={handleCopy} disabled={loading || !!error || !text}>
              {copyLabel}
            </button>
            <button type="button" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>

        <div style={{ padding: "12px", overflow: "auto", fontSize: "12px", lineHeight: 1.6 }}>
          {copyHint ? (
            <div style={{ marginBottom: "8px", color: "var(--color-text-sub)" }}>{copyHint}</div>
          ) : null}
          {loading ? (
            <div style={{ color: "var(--color-text-sub)" }}>正在读取示例文件…</div>
          ) : null}
          {!loading && error ? (
            <div style={{ color: "var(--color-danger)" }}>{error}</div>
          ) : null}
          {!loading && !error ? (
            <pre style={{ margin: 0, whiteSpace: "pre", fontFamily: "Consolas, Menlo, Monaco, monospace" }}>
              {text || emptyText}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
