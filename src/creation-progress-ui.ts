import { subscribeCreationProgress, type CreationStage } from "./lib/creation-progress";

const copy: Record<CreationStage, string> = {
  "hashing-files": "Hashing your files on this device…",
  "getting-signed-time": "Getting an independently signed time…",
  "checking-signed-time": "Checking the signed time…",
  "building-package": "Building your ProofStamp ZIP…",
};

subscribeCreationProgress((stage) => {
  const panel = document.querySelector<HTMLElement>("#create-panel");
  const status = document.querySelector<HTMLElement>("#create-status");
  if (!panel?.hasAttribute("aria-busy") || !status) return;
  status.textContent = copy[stage];
  status.className = "status-box working";
});
