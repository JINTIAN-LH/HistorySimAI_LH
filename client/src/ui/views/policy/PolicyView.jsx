import { LegacyViewMount } from "@client/ui/components/LegacyViewMount.jsx";
import { renderPolicyView } from "@ui/policyView.js";

export function PolicyView() {
  return (
    <LegacyViewMount
      className="policy-view"
      renderView={(container) => renderPolicyView(container)}
    />
  );
}