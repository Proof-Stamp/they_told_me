import "./ux-polish.css";

function assignDroppedFiles(input: HTMLInputElement, files: File[]): void {
  if (input.disabled) return;
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function enableDropZone(zone: HTMLElement, input: HTMLInputElement, multiple: boolean): void {
  zone.classList.add("drag-enabled");

  const containsFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

  zone.addEventListener("dragenter", (event) => {
    if (!containsFiles(event)) return;
    event.preventDefault();
    if (input.disabled) return;
    zone.classList.add("drag-active");
  });

  zone.addEventListener("dragover", (event) => {
    if (!containsFiles(event)) return;
    event.preventDefault();
    if (input.disabled) return;
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    zone.classList.add("drag-active");
  });

  zone.addEventListener("dragleave", (event) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && zone.contains(nextTarget)) return;
    zone.classList.remove("drag-active");
  });

  zone.addEventListener("drop", (event) => {
    if (!containsFiles(event)) return;
    event.preventDefault();
    zone.classList.remove("drag-active");
    if (input.disabled) return;
    const dropped = Array.from(event.dataTransfer?.files ?? []);
    if (!dropped.length) return;
    assignDroppedFiles(input, multiple ? dropped : dropped.slice(0, 1));
  });
}

function makeSectionDisclosure(section: HTMLElement, label: string): void {
  if (section.dataset.disclosureReady === "true") return;

  const children = Array.from(section.children);
  const eyebrow = children.find((child) => child.classList.contains("eyebrow"));
  const heading = children.find((child) => child.tagName === "H2");
  if (!(heading instanceof HTMLElement)) return;

  const details = document.createElement("details");
  details.className = "info-disclosure";
  const summary = document.createElement("summary");
  summary.setAttribute("aria-label", label);

  if (eyebrow instanceof HTMLElement) summary.append(eyebrow);
  const title = document.createElement("span");
  title.className = "info-disclosure-title";
  title.textContent = heading.textContent ?? label;
  summary.append(title);

  heading.remove();
  const content = document.createElement("div");
  content.className = "info-disclosure-content";
  while (section.firstChild) content.append(section.firstChild);
  details.append(summary, content);
  section.append(details);
  section.dataset.disclosureReady = "true";
}

function addPrivacyVerification(): void {
  const banner = document.querySelector<HTMLElement>(".privacy-banner");
  const bannerStrong = banner?.querySelector<HTMLElement>("strong");
  const bannerText = banner?.querySelector<HTMLElement>("span");
  if (bannerStrong) bannerStrong.textContent = "Your files stay on this device.";
  if (bannerText) bannerText.textContent = "Only a small cryptographic timestamp request leaves your browser.";

  const privacy = document.querySelector<HTMLElement>("#privacy");
  if (!privacy || privacy.querySelector(".privacy-check")) return;

  const check = document.createElement("div");
  check.className = "privacy-check";
  const title = document.createElement("strong");
  title.textContent = "Want to check?";
  const copy = document.createElement("p");
  copy.textContent = "Open your browser’s Network tools while creating a ProofStamp. You should see only the small timestamp request leave this page, not your files, filenames, label, manifest, previews, or completed ZIP.";
  check.append(title, copy);
  privacy.append(check);
}

function setupUxPolish(): void {
  const heroCopy = document.querySelector<HTMLElement>(".hero-copy");
  if (heroCopy) {
    heroCopy.textContent = "Save a call recording, chat screenshot, or both. The app proves the exact files existed by an independently signed time.";
  }

  addPrivacyVerification();

  const howItWorks = document.querySelector<HTMLElement>("#how-it-works");
  const privacy = document.querySelector<HTMLElement>("#privacy");
  if (howItWorks) makeSectionDisclosure(howItWorks, "How it works");
  if (privacy) makeSectionDisclosure(privacy, "Privacy");

  const desktopDragDrop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!desktopDragDrop || typeof DataTransfer === "undefined") return;

  const createInput = document.querySelector<HTMLInputElement>("#create-files");
  const createPicker = createInput?.closest<HTMLElement>(".file-picker");
  const createHint = document.querySelector<HTMLElement>("#file-picker-hint");
  if (createInput && createPicker) {
    if (createHint) createHint.textContent = "Choose files or drag them here.";
    enableDropZone(createPicker, createInput, true);
  }

  const verifyInput = document.querySelector<HTMLInputElement>("#verify-file");
  const verifyPicker = verifyInput?.closest<HTMLElement>(".file-picker");
  const verifyHint = verifyPicker?.querySelector<HTMLElement>("span:not(.file-picker-title)");
  if (verifyInput && verifyPicker) {
    if (verifyHint) verifyHint.textContent = "Choose a ZIP or drag it here.";
    enableDropZone(verifyPicker, verifyInput, false);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupUxPolish, { once: true });
} else {
  setupUxPolish();
}
