import { LegacyViewMount } from "@client/ui/components/LegacyViewMount.jsx";
import { removeEdictPanelsWrap, renderEdictView } from "@ui/edictView.js";

function cleanupEdictView(container) {
  container.classList.remove("main-view--edict");
  removeEdictPanelsWrap();
}

export function EdictView({ useLegacyLayout = false }) {
  return <LegacyViewMount renderView={(container) => {
    container.dataset.legacyLayout = useLegacyLayout ? "true" : "false";
    return renderEdictView(container, { useLegacyLayout });
  }} cleanupView={cleanupEdictView} />;
}
