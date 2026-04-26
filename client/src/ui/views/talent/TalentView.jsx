import { LegacyViewMount } from "@client/ui/components/LegacyViewMount.jsx";
import { ensureTalentViewDataLoaded, renderTalentView } from "@ui/talentView.js";

async function renderLegacyTalentView(container) {
  await ensureTalentViewDataLoaded();
  renderTalentView(container);
}

export function TalentView() {
  return (
    <LegacyViewMount
      className="talent-view"
      renderView={(container) => renderLegacyTalentView(container)}
    />
  );
}