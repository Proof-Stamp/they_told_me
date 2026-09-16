import "./keep-handy.css";
import { isStableProductionHostname } from "./lib/production-host";

function isMobileLike(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function shortcutLabel(): string {
  return isMobileLike() ? "Add to home screen" : "Bookmark this app";
}

function guidanceCopy(): string {
  const ua = navigator.userAgent;
  const isAppleMobile = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMac = /Macintosh|Mac OS X/i.test(ua);

  if (isAppleMobile) {
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
    return isSafari
      ? "In Safari, tap Share, then Add to Home Screen."
      : "Open this page in Safari, tap Share, then Add to Home Screen.";
  }

  if (isAndroid) {
    return "Open your browser menu, then choose Add to home screen.";
  }

  return isMac ? "Press Command+D to bookmark this page." : "Press Ctrl+D to bookmark this page.";
}

function addFooterShortcut(): void {
  if (!isStableProductionHostname(window.location.hostname)) return;

  const footer = document.querySelector<HTMLElement>("footer");
  if (!footer || footer.querySelector(".footer-shortcut")) return;

  let meta = footer.querySelector<HTMLElement>(".footer-meta");
  if (!meta) {
    meta = document.createElement("span");
    meta.className = "footer-meta";
    footer.append(meta);
  }

  const details = document.createElement("details");
  details.className = "footer-shortcut";

  const summary = document.createElement("summary");
  summary.textContent = shortcutLabel();

  const instructions = document.createElement("p");
  instructions.textContent = guidanceCopy();

  details.append(summary, instructions);
  meta.prepend(details);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", addFooterShortcut, { once: true });
} else {
  addFooterShortcut();
}
