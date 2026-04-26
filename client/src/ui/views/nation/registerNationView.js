import { router } from "@legacy/router.js";

export function registerNationView() {
	router.registerView(router.VIEW_IDS.NATION, null, { renderMode: "react" });
}

registerNationView();