import { router } from "@legacy/router.js";

export function registerCourtView() {
	router.registerView(router.VIEW_IDS.COURT, null, { renderMode: "react" });
}

registerCourtView();