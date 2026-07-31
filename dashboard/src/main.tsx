import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/App";
import { initTheme } from "./lib/useTheme";
import "./index.css";

// Apply the persisted theme before first paint to avoid a flash of the wrong
// theme. Defaults to dark.
initTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
