import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/neumorphic.css";
import App from "./App.tsx";

// Register PWA Service Worker
if (typeof window !== "undefined" && "serviceWorker" in navigator && window.location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("[PWA] ServiceWorker registered with scope:", reg.scope);
      })
      .catch((err) => {
        console.warn("[PWA] ServiceWorker registration skipped/failed:", err);
      });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
