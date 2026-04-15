import { createElement } from "react";
import { createRoot } from "react-dom/client";
import "@styles/reset.css";
import "@styles/theme.css";
import "@styles/layout.css";
import "@styles/components/common.css";
import "@styles/modules/edict.css";
import "@styles/modules/court.css";
import "@styles/modules/nation.css";
import "@styles/modules/military.css";
import "@styles/modules/talent.css";
import "@styles/modules/policy.css";
import { App } from "./App.jsx";

const rootElement = document.getElementById("react-root");

if (!rootElement) {
  throw new Error("Missing react-root mount node.");
}

createRoot(rootElement).render(createElement(App));