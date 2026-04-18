import { useEffect, useState } from "react";

const DEFAULT_API_BASE = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_MODEL = "glm-4-long";

function buildFormState(status) {
  const fields = status?.fields || {};
  return {
    LLM_API_KEY: "",
    LLM_API_BASE: fields.LLM_API_BASE?.value || DEFAULT_API_BASE,
    LLM_MODEL: fields.LLM_MODEL?.value || DEFAULT_MODEL,
    LLM_CHAT_MODEL: fields.LLM_CHAT_MODEL?.value || fields.LLM_MODEL?.value || DEFAULT_MODEL,
  };
}

function buildSubmitPayload(formState) {
  const apiKey = String(formState.LLM_API_KEY || "").trim();
  const apiBase = String(formState.LLM_API_BASE || "").trim() || DEFAULT_API_BASE;
  const model = String(formState.LLM_MODEL || "").trim() || DEFAULT_MODEL;
  const chatModel = String(formState.LLM_CHAT_MODEL || "").trim() || model;

  return {
    LLM_API_KEY: apiKey,
    LLM_API_BASE: apiBase,
    LLM_MODEL: model,
    LLM_CHAT_MODEL: chatModel,
  };
}

export function ConfigSetupGate({
  checking = false,
  status = null,
  error = "",
  submitError = "",
  submitting = false,
  onRetry,
  onSubmit,
}) {
  const [formState, setFormState] = useState(() => buildFormState(status));

  useEffect(() => {
    setFormState(buildFormState(status));
  }, [status]);

  const storageLabel = status?.storageLabel || "当前浏览器本地存储";
  const tips = Array.isArray(status?.tips) ? status.tips : [];

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (typeof onSubmit !== "function") return;
    await onSubmit(buildSubmitPayload(formState));
  };

  return (
    <div className="overlay-panel config-gate" role="dialog" aria-modal="true" aria-labelledby="config-gate-title">
      <div className="overlay-panel__card config-gate__card">
        <div className="overlay-panel__header config-gate__header">
          <div className="overlay-panel__title-wrap">
            <div id="config-gate-title" className="overlay-panel__title">先补全大模型配置</div>
            <div className="overlay-panel__subtitle">
              每位玩家都使用自己的大模型账户。填写后仅保存在当前浏览器，保存后自动进入游戏。
            </div>
          </div>
        </div>

        <div className="overlay-panel__body config-gate__body">
          <div className="config-gate__notice">
            <div className="config-gate__notice-title">配置保存位置</div>
            <div className="config-gate__notice-text">{storageLabel}</div>
          </div>

          {checking ? (
            <div className="config-gate__status">正在检查当前浏览器里的玩家模型配置……</div>
          ) : null}

          {error ? (
            <div className="config-gate__error-block">
              <div className="config-gate__error-title">当前无法读取玩家模型配置</div>
              <div className="config-gate__error-text">{error}</div>
              <div className="config-gate__error-text">请检查浏览器本地存储权限后，再点一次重新检查。</div>
            </div>
          ) : null}

          {!checking && !error ? (
            <form className="config-gate__form" onSubmit={handleSubmit}>
              <label className="config-gate__field">
                <span className="config-gate__label">API Key</span>
                <input
                  className="config-gate__input"
                  type="password"
                  name="LLM_API_KEY"
                  value={formState.LLM_API_KEY}
                  onChange={handleChange}
                  placeholder="粘贴你的大模型 API Key"
                  autoComplete="off"
                  spellCheck="false"
                />
                <span className="config-gate__helper">必填。只会保存在你自己的浏览器中，并由你的模型账户承担推理费用。</span>
              </label>

              <label className="config-gate__field">
                <span className="config-gate__label">API Base</span>
                <input
                  className="config-gate__input"
                  type="text"
                  name="LLM_API_BASE"
                  value={formState.LLM_API_BASE}
                  onChange={handleChange}
                  placeholder={DEFAULT_API_BASE}
                  autoComplete="off"
                  spellCheck="false"
                />
                <span className="config-gate__helper">不确定就保留默认值。</span>
              </label>

              <div className="config-gate__grid">
                <label className="config-gate__field">
                  <span className="config-gate__label">剧情模型</span>
                  <input
                    className="config-gate__input"
                    type="text"
                    name="LLM_MODEL"
                    value={formState.LLM_MODEL}
                    onChange={handleChange}
                    placeholder={DEFAULT_MODEL}
                    autoComplete="off"
                    spellCheck="false"
                  />
                </label>

                <label className="config-gate__field">
                  <span className="config-gate__label">对话模型</span>
                  <input
                    className="config-gate__input"
                    type="text"
                    name="LLM_CHAT_MODEL"
                    value={formState.LLM_CHAT_MODEL}
                    onChange={handleChange}
                    placeholder={DEFAULT_MODEL}
                    autoComplete="off"
                    spellCheck="false"
                  />
                </label>
              </div>

              {tips.length ? (
                <div className="config-gate__tips">
                  {tips.map((tip) => (
                    <div key={tip} className="config-gate__tip">{tip}</div>
                  ))}
                </div>
              ) : null}

              {submitError ? <div className="config-gate__submit-error">{submitError}</div> : null}

              <div className="config-gate__footer">
                <button className="ui-btn" type="button" onClick={onRetry} disabled={submitting}>
                  <div className="ui-btn__title">重新检查</div>
                  <div className="ui-btn__desc">重新读取当前浏览器里的玩家配置</div>
                </button>
                <button className="ui-btn ui-btn--primary" type="submit" disabled={submitting}>
                  <div className="ui-btn__title">{submitting ? "正在保存…" : "保存并进入游戏"}</div>
                  <div className="ui-btn__desc">仅写入当前浏览器本地存储，保存成功后自动放行。</div>
                </button>
              </div>
            </form>
          ) : null}

          {!checking && error ? (
            <div className="config-gate__footer">
              <button className="ui-btn ui-btn--primary" type="button" onClick={onRetry}>
                <div className="ui-btn__title">重新检查</div>
                <div className="ui-btn__desc">本地存储可用后，再次获取玩家配置状态。</div>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
