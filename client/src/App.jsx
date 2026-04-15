import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { startApplication } from "./bootstrap/startApplication.js";
import { fetchConfigStatus, saveRuntimeConfig } from "./bootstrap/configurationGate.js";
import { router } from "@legacy/router.js";
import { useLegacyRouterView } from "./ui/hooks/useLegacyRouterView.js";
import { ConfigSetupGate } from "./ui/components/ConfigSetupGate.jsx";
import { TopBar } from "./ui/shell/TopBar.jsx";
import { BottomNav } from "./ui/shell/BottomNav.jsx";
import { CourtView } from "./ui/views/court/CourtView.jsx";
import { EdictView } from "./ui/views/edict/EdictView.jsx";
import { NationView } from "./ui/views/nation/NationView.jsx";

const DESKTOP_MIN_WIDTH = 1200;
const MOBILE_GAMEPLAY_VIEW_IDS = [router.VIEW_IDS.EDICT, router.VIEW_IDS.COURT, router.VIEW_IDS.NATION];

function lazyNamedView(loadModule, exportName) {
  return lazy(() => loadModule().then((module) => ({ default: module[exportName] })));
}

const SettingsView = lazyNamedView(() => import("./ui/views/settings/SettingsView.jsx"), "SettingsView");
const StartView = lazyNamedView(() => import("./ui/views/start/StartView.jsx"), "StartView");
const TalentView = lazyNamedView(() => import("./ui/views/talent/TalentView.jsx"), "TalentView");
const PolicyView = lazyNamedView(() => import("./ui/views/policy/PolicyView.jsx"), "PolicyView");

function isMobileGameplayView(viewId) {
  return MOBILE_GAMEPLAY_VIEW_IDS.includes(viewId);
}

function createReactView(viewId) {
  if (viewId === router.VIEW_IDS.EDICT) {
    return <EdictView useLegacyLayout />;
  }
  if (viewId === router.VIEW_IDS.COURT) {
    return <CourtView useLegacyLayout />;
  }
  if (viewId === router.VIEW_IDS.NATION) {
    return <NationView />;
  }
  if (viewId === router.VIEW_IDS.SETTINGS) {
    return <SettingsView />;
  }
  if (viewId === router.VIEW_IDS.START) {
    return <StartView />;
  }
  if (viewId === router.VIEW_IDS.TALENT) {
    return <TalentView />;
  }
  if (viewId === router.VIEW_IDS.POLICY) {
    return <PolicyView />;
  }
  return null;
}

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
  const [mobileMountedViews, setMobileMountedViews] = useState(() => [router.getCurrentView()]);
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

  useEffect(() => {
    if (!isBootstrapped || isDesktopShell || !isMobileGameplayView(currentView)) {
      return;
    }

    setMobileMountedViews((existing) => (
      existing.includes(currentView) ? existing : [...existing, currentView]
    ));
  }, [currentView, isBootstrapped, isDesktopShell]);

  useEffect(() => {
    if (!isBootstrapped || isDesktopShell || typeof window === "undefined") {
      return undefined;
    }

    const missingViews = MOBILE_GAMEPLAY_VIEW_IDS.filter((viewId) => !mobileMountedViews.includes(viewId));
    if (!missingViews.length) {
      return undefined;
    }

    const scheduleWarmup = typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback.bind(window)
      : (callback) => window.setTimeout(callback, 120);
    const cancelWarmup = typeof window.cancelIdleCallback === "function"
      ? window.cancelIdleCallback.bind(window)
      : window.clearTimeout.bind(window);

    const warmupHandle = scheduleWarmup(() => {
      setMobileMountedViews((existing) => {
        const nextViews = existing.slice();
        missingViews.forEach((viewId) => {
          if (!nextViews.includes(viewId)) {
            nextViews.push(viewId);
          }
        });
        return nextViews;
      });
    });

    return () => {
      cancelWarmup(warmupHandle);
    };
  }, [isBootstrapped, isDesktopShell, mobileMountedViews]);

  const shouldUseDesktopComposite = isBootstrapped
    && isDesktopShell
    && currentView !== router.VIEW_IDS.START
    && currentView !== router.VIEW_IDS.SETTINGS;
  const shouldUseMobileGameplayCache = isBootstrapped
    && !isDesktopShell
    && isMobileGameplayView(currentView);
  const activeReactView = isBootstrapped && !shouldUseMobileGameplayCache
    ? createReactView(currentView)
    : null;

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
                      <CourtView useLegacyLayout />
                    </div>
                  </section>
                  <section className={`desktop-gameplay-panel${currentView === router.VIEW_IDS.EDICT ? " desktop-gameplay-panel--active" : ""}`}>
                    <div className="desktop-gameplay-panel__header">诏书</div>
                    <div className="desktop-gameplay-panel__body">
                      <EdictView useLegacyLayout />
                    </div>
                  </section>
                  <section className={`desktop-gameplay-panel${currentView === router.VIEW_IDS.NATION ? " desktop-gameplay-panel--active" : ""}`}>
                    <div className="desktop-gameplay-panel__header">国家</div>
                    <div className="desktop-gameplay-panel__body">
                      <NationView useLegacyLayout />
                    </div>
                  </section>
                </div>
              ) : (
                <>
                  {!isDesktopShell ? (
                    <div className="mobile-gameplay-stack" hidden={!shouldUseMobileGameplayCache} aria-live="polite">
                      {mobileMountedViews
                        .filter((viewId) => isMobileGameplayView(viewId))
                        .map((viewId) => (
                          <section
                            key={viewId}
                            className={`mobile-gameplay-stack__panel${currentView === viewId ? " mobile-gameplay-stack__panel--active" : ""}`}
                            hidden={currentView !== viewId}
                            aria-hidden={currentView !== viewId}
                          >
                            {createReactView(viewId)}
                          </section>
                        ))}
                    </div>
                  ) : null}
                  {shouldUseMobileGameplayCache ? null : (
                    <Suspense fallback={<ViewLoadingFallback />}>
                      {activeReactView}
                    </Suspense>
                  )}
                </>
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
