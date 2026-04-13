import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { startApplication } from "./bootstrap/startApplication.js";
import { fetchConfigStatus, saveRuntimeConfig } from "./bootstrap/configurationGate.js";
import { router } from "@legacy/router.js";
import { useLegacyRouterView } from "./ui/hooks/useLegacyRouterView.js";
import { ConfigSetupGate } from "./ui/components/ConfigSetupGate.jsx";
import { TopBar } from "./ui/shell/TopBar.jsx";
import { BottomNav } from "./ui/shell/BottomNav.jsx";

const DESKTOP_MIN_WIDTH = 1200;

function lazyNamedView(loadModule, exportName) {
  return lazy(() => loadModule().then((module) => ({ default: module[exportName] })));
}

const CourtView = lazyNamedView(() => import("./ui/views/court/CourtView.jsx"), "CourtView");
const EdictView = lazyNamedView(() => import("./ui/views/edict/EdictView.jsx"), "EdictView");
const NationView = lazyNamedView(() => import("./ui/views/nation/NationView.jsx"), "NationView");
const SettingsView = lazyNamedView(() => import("./ui/views/settings/SettingsView.jsx"), "SettingsView");
const StartView = lazyNamedView(() => import("./ui/views/start/StartView.jsx"), "StartView");
const TalentView = lazyNamedView(() => import("./ui/views/talent/TalentView.jsx"), "TalentView");
const PolicyView = lazyNamedView(() => import("./ui/views/policy/PolicyView.jsx"), "PolicyView");

function useIsDesktopShell() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth >= DESKTOP_MIN_WIDTH;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
    const syncViewport = (event) => {
      setIsDesktop(event.matches);
    };

    setIsDesktop(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  return isDesktop;
}

function ViewLoadingFallback({ message = "正在载入页面…" }) {
  return <div className="app-shell__loading-card">{message}</div>;
}

export function App() {
  const [bootError, setBootError] = useState(null);
  const [isBootstrapped, setIsBootstrapped] = useState(false);
  const [gateState, setGateState] = useState({
    checking: true,
    status: null,
    error: "",
    submitError: "",
    submitting: false,
  });
  const currentView = useLegacyRouterView();
  const isDesktopShell = useIsDesktopShell();
  const bootstrapStartedRef = useRef(false);

  const bootMessage = gateState.checking
    ? "正在检查大模型配置…"
    : gateState.status?.ready
      ? "正在载入游戏…"
      : "请先填写你的大模型配置";

  const bootstrapLegacyApplication = async () => {
    if (bootstrapStartedRef.current) {
      return;
    }

    bootstrapStartedRef.current = true;
    try {
      await startApplication();
      setIsBootstrapped(true);
    } catch (error) {
      bootstrapStartedRef.current = false;
      console.error("[client] failed to start application");
      console.error(error);
      setBootError(error);
    }
  };

  const inspectRuntimeConfig = async () => {
    setGateState((current) => ({
      ...current,
      checking: true,
      error: "",
      submitError: "",
    }));

    try {
      const status = await fetchConfigStatus();
      setGateState({
        checking: false,
        status,
        error: "",
        submitError: "",
        submitting: false,
      });
      if (status?.ready) {
        await bootstrapLegacyApplication();
      }
    } catch (error) {
      setGateState({
        checking: false,
        status: null,
        error: error?.message || "无法连接配置服务。",
        submitError: "",
        submitting: false,
      });
    }
  };

  const handleConfigSubmit = async (values) => {
    setGateState((current) => ({
      ...current,
      submitting: true,
      submitError: "",
    }));

    try {
      const status = await saveRuntimeConfig(values);
      setGateState({
        checking: false,
        status,
        error: "",
        submitError: "",
        submitting: false,
      });
      if (status?.ready) {
        await bootstrapLegacyApplication();
      }
    } catch (error) {
      setGateState((current) => ({
        ...current,
        submitting: false,
        submitError: error?.message || "保存失败，请稍后再试。",
      }));
    }
  };

  useEffect(() => {
    inspectRuntimeConfig();
  }, []);

  const reactViews = {
    [router.VIEW_IDS.EDICT]: <EdictView useLegacyLayout />,
    [router.VIEW_IDS.COURT]: <CourtView useLegacyLayout />,
    [router.VIEW_IDS.NATION]: <NationView />,
    [router.VIEW_IDS.SETTINGS]: <SettingsView />,
    [router.VIEW_IDS.START]: <StartView />,
    [router.VIEW_IDS.TALENT]: <TalentView />,
    [router.VIEW_IDS.POLICY]: <PolicyView />,
  };

  const activeReactView = isBootstrapped ? reactViews[currentView] || null : null;
  const shouldUseDesktopComposite = isBootstrapped
    && isDesktopShell
    && currentView !== router.VIEW_IDS.START
    && currentView !== router.VIEW_IDS.SETTINGS;

  return (
    <div className={`app-shell${shouldUseDesktopComposite ? " app-shell--desktop" : " app-shell--mobile"}`}>
      {bootError ? (
        <div role="alert" style={{ padding: "16px", color: "#7f1d1d" }}>
          应用启动失败，请检查控制台日志。
        </div>
      ) : null}
      <div id="app">
        {isBootstrapped ? (
          <>
            <TopBar />
            <main
              id="main-view"
              className={shouldUseDesktopComposite ? "main-view--desktop" : ""}
              aria-live="polite"
            >
              {shouldUseDesktopComposite ? (
                <div className="desktop-gameplay-grid">
                  <section className={`desktop-gameplay-panel${currentView === router.VIEW_IDS.COURT ? " desktop-gameplay-panel--active" : ""}`}>
                    <div className="desktop-gameplay-panel__header">朝堂</div>
                    <div className="desktop-gameplay-panel__body">
                      <Suspense fallback={<ViewLoadingFallback message="正在载入朝堂…" />}>
                        <CourtView useLegacyLayout />
                      </Suspense>
                    </div>
                  </section>
                  <section className={`desktop-gameplay-panel${currentView === router.VIEW_IDS.EDICT ? " desktop-gameplay-panel--active" : ""}`}>
                    <div className="desktop-gameplay-panel__header">诏书</div>
                    <div className="desktop-gameplay-panel__body">
                      <Suspense fallback={<ViewLoadingFallback message="正在载入诏书…" />}>
                        <EdictView useLegacyLayout />
                      </Suspense>
                    </div>
                  </section>
                  <section className={`desktop-gameplay-panel${currentView === router.VIEW_IDS.NATION ? " desktop-gameplay-panel--active" : ""}`}>
                    <div className="desktop-gameplay-panel__header">国家</div>
                    <div className="desktop-gameplay-panel__body">
                      <Suspense fallback={<ViewLoadingFallback message="正在载入国家…" />}>
                        <NationView useLegacyLayout />
                      </Suspense>
                    </div>
                  </section>
                </div>
              ) : (
                <Suspense fallback={<ViewLoadingFallback />}>
                  {activeReactView}
                </Suspense>
              )}
            </main>
            {!shouldUseDesktopComposite ? <BottomNav currentView={currentView} /> : null}
          </>
        ) : (
          <main id="main-view" className="app-shell__loading" aria-live="polite">
            <div className="app-shell__loading-card">{bootMessage}</div>
          </main>
        )}
      </div>

      {!isBootstrapped ? (
        <ConfigSetupGate
          checking={gateState.checking}
          status={gateState.status}
          error={gateState.error}
          submitError={gateState.submitError}
          submitting={gateState.submitting}
          onRetry={inspectRuntimeConfig}
          onSubmit={handleConfigSubmit}
        />
      ) : null}
    </div>
  );
}
