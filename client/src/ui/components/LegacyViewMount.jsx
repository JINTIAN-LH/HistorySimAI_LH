import { useEffect, useRef } from "react";

export function LegacyViewMount({ renderView, cleanupView, className = "", id }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof renderView !== "function") {
      return undefined;
    }

    Promise.resolve(renderView(container)).catch((error) => {
      console.error("[client] failed to render legacy view", error);
    });

    return () => {
      if (typeof cleanupView === "function") {
        cleanupView(container);
      }
      container.replaceChildren();
    };
  }, [cleanupView, renderView]);

  return <div ref={containerRef} id={id} className={className} />;
}