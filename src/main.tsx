import { pretendHeights } from "./app/IslandReliefDialog";
import { gridFrom } from "./terrain/elevation";
import { ISLANDS } from "./terrain/islands";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import "./app/styles.css";
import { itemBox } from "./model/shapes";
import { useStore } from "./model/store";
import { initTheme } from "./app/theme";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// Keep a copy of the app on this computer so it works offline (live site only).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline use just isn't available; everything else works.
    });
  });
}

// The browser smoke test (opened with ?smoke) reaches the store to check what's on the bed.
if (new URLSearchParams(window.location.search).has("smoke")) {
  (window as unknown as { juracutStore: typeof useStore }).juracutStore = useStore;
  (window as unknown as { juracutBox: typeof itemBox }).juracutBox = itemBox;
  (window as unknown as { juracutRelief: unknown }).juracutRelief = { pretendHeights, gridFrom, islands: ISLANDS };
}

// Light or dark, before the first paint.
initTheme();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
