import "./keep-handy.css";
import { isStableProductionHostname } from "./lib/production-host";

function guidanceCopy(): string[] {
  const ua = navigator.userAgent;
  const isAppleMobile = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);

  if (isAppleMobile) {
    return [
      "On iPhone or iPad, open this page in Safari, tap Share, then choose Add to Home Screen.",
      "The shortcut only brings you back to They Told Me. Your ProofStamp ZIP must still be downloaded and kept separately.",
    ];
  }

  if (isAndroid) {
    return [
      "On Android, open your browser menu and choose Add to home screen.",
      "The shortcut only brings you back to They Told Me. Your ProofStamp ZIP must still be downloaded and kept separately.",
    ];
  }

  return [
    "Bookmark this page in your browser for quick access later. You can usually use Ctrl+D on Windows or Linux, or Command+D on Mac.",
    "A bookmark does not save your ProofStamp. Download and keep the ProofStamp ZIP separately.",
  ];
}

function addKeepHandySection(): void {
  if (!isStableProductionHostname(window.location.hostname)) return;

  const result = document.querySelector<HTMLElement>("#created-result");
  if (!result || result.classList.contains("hidden")) return;
  if (!result.querySelector(".download-button")) return;
  if (result.querySelector(".keep-handy")) return;

  const section = document.createElement("section");
  section.className = "keep-handy";
  section.setAttribute("aria-label", "Keep They Told Me handy");

  const title = document.createElement("strong");
  title.textContent = "Keep They Told Me handy";

  const copy = document.createElement("p");
  copy.textContent = "Bookmark this page or add it to your home screen for next time.";

  const reminder = document.createElement("p");
  reminder.className = "keep-handy-reminder";
  reminder.textContent = "This shortcut does not save your ProofStamp. Download and keep the ZIP separately.";

  const details = document.createElement("details");
  details.className = "keep-handy-details";
  const summary = document.createElement("summary");
  summary.textContent = "Show me how";
  const instructions = document.createElement("div");
  instructions.className = "keep-handy-instructions";
  guidanceCopy().forEach((text) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    instructions.append(paragraph);
  });
  details.append(summary, instructions);

  section.append(title, copy, reminder, details);
  result.append(section);
}

function watchCreatedResult(): void {
  if (!isStableProductionHostname(window.location.hostname)) return;
  const result = document.querySelector<HTMLElement>("#created-result");
  if (!result) return;

  const observer = new MutationObserver(() => addKeepHandySection());
  observer.observe(result, { childList: true, subtree: false, attributes: true, attributeFilter: ["class"] });
  addKeepHandySection();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", watchCreatedResult, { once: true });
} else {
  watchCreatedResult();
}
