import { router } from "@legacy/router.js";

export function registerEdictView() {
	router.registerView(router.VIEW_IDS.EDICT, null, { renderMode: "react" });
}

registerEdictView();