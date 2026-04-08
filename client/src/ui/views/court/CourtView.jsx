import { LegacyViewMount } from "@client/ui/components/LegacyViewMount.jsx";
import { ensureCourtViewDataLoaded, renderCourtInteractiveView } from "@ui/courtView.js";

async function renderLegacyCourtView(container, useLegacyLayout) {
  container.dataset.legacyLayout = useLegacyLayout ? "true" : "false";
  await ensureCourtViewDataLoaded();
  await renderCourtInteractiveView(container, { useLegacyLayout });
}

export function CourtView({ useLegacyLayout = true }) {
  return <LegacyViewMount id="court-legacy-root" renderView={(container) => renderLegacyCourtView(container, useLegacyLayout)} />;
}
