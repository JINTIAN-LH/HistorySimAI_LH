import { LegacyViewMount } from "@client/ui/components/LegacyViewMount.jsx";
import { ensureNationViewDataLoaded, renderNationView } from "@ui/nationView.js";

async function renderLegacyNationView(container, useLegacyLayout) {
  container.dataset.legacyLayout = useLegacyLayout ? "true" : "false";
  await ensureNationViewDataLoaded();
  renderNationView(container, { useLegacyLayout });
}

export function NationView({ useLegacyLayout = false }) {
  return <LegacyViewMount renderView={(container) => renderLegacyNationView(container, useLegacyLayout)} />;
}
