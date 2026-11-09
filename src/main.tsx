import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

document.documentElement.classList.add("dark");

// Remove any legacy service worker + caches (stale precache served deleted chunks)
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => void r.unregister());
  });
  if ("caches" in window) {
    void caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)));
  }
}

// Recover from stale chunk references after a new deploy (one-time reload)
const RELOAD_KEY = "chunk-reload-at";
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  if (Date.now() - last > 10_000) {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);

