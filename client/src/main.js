import { createElement } from "react";
import { createRoot } from "react-dom/client";
import "@styles/main.css";
import { App } from "./App.jsx";

const rootElement = document.getElementById("react-root");

if (!rootElement) {
  throw new Error("Missing react-root mount node.");
}

createRoot(rootElement).render(createElement(App));