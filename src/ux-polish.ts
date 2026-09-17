import "./ux-polish.css";

const REPOSITORY_URL = "https://github.com/Proof-Stamp/they_told_me";

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

function openDisclosureForHash(hash = window.location.hash): void {
  if (!hash.startsWith("#") || hash.length < 2) return;
  const id = decodeURIComponent(hash.slice(1));
  const target = document.getElementById(id);
  if (!target) return;
  const details = target.querySelector<HTMLDetailsElement>("details.info-disclosure");
  if (details) details.open = true;
}

function wireSectionLinks(): void {
  document.querySelectorAll<HTMLAnchorElement>('a[href="#how-it-works"], a[href="#privacy"]').forEach((link) => {
    link.addEventListener("click", () => openDisclosureForHash(link.hash));
  });
  window.addEventListener("hashchange", () => openDisclosureForHash());
  openDisclosureForHash();
}

function addPrivacyVerification(): void {
  const banner = document.querySelector<HTMLElement>(".privacy-banner");
  const bannerStrong = banner?.querySelector<HTMLElement>("strong");
  const bannerText = banner?.querySelector<HTMLElement>("span");
  if (bannerStrong) bannerStrong.textContent = "Your files stay on this device.";
  if (bannerText) bannerText.textContent = "Only a small cryptographic timestamp request leaves your browser.";

  const privacy = document.querySelector<HTMLElement>("#privacy");
  if (!privacy || privacy.querySelector(".privacy-check")) return;

  const source = document.createElement("p");
  source.append("The source code for this app is public on ");
  const sourceLink = document.createElement("a");
  sourceLink.href = REPOSITORY_URL;
  sourceLink.textContent = "GitHub";
  sourceLink.title = "View the They Told Me source code on GitHub";
  source.append(sourceLink, ".");

  const check = document.createElement("div");
  check.className = "privacy-check";
  const title = document.createElement("strong");
  title.textContent = "Want to check?";
  const copy = document.createElement("p");
  copy.textContent = "Open your browser’s Network tools while creating a ProofStamp. You should see only the small timestamp request leave this page, not your files, filenames, label, manifest, previews, or completed ZIP.";
  check.append(title, copy);
  privacy.append(source, check);
}

function simplifyCreatedResult(): void {
  const result = document.querySelector<HTMLElement>("#created-result");
  if (!result || result.classList.contains("hidden")) return;

  const download = result.querySelector<HTMLAnchorElement>(".download-button");
  if (!download) return;

  const signedStatement = result.querySelector<HTMLElement>(".result-time");
  const explanation = download.previousElementSibling;
  if (explanation instanceof HTMLParagraphElement) {
    const singleFile = signedStatement?.textContent?.startsWith("This file") ?? false;
    const desiredCopy = singleFile
      ? "Download one ZIP containing your original file and its proof."
      : "Download one ZIP containing your original files and their proof.";
    if (explanation.textContent !== desiredCopy) explanation.textContent = desiredCopy;
  }

  const downloadNote = result.querySelector(".download-note");
  if (downloadNote) downloadNote.remove();
  result.querySelectorAll<HTMLDetailsElement>("details").forEach((details) => {
    if (details.open) details.open = false;
  });
}

function watchCreatedResult(): void {
  const result = document.querySelector<HTMLElement>("#created-result");
  if (!result) return;
  const observer = new MutationObserver(() => simplifyCreatedResult());
  observer.observe(result, { childList: true, attributes: true, attributeFilter: ["class"] });
  simplifyCreatedResult();
}

function simplifyFooter(): void {
  const footerCopy = document.querySelector<HTMLElement>("footer span:nth-child(2)");
  if (footerCopy) footerCopy.textContent = "Proof of existence and integrity.";
}

function strengthenCreatePicker(desktopDragDrop: boolean): void {
  const picker = document.querySelector<HTMLElement>("#create-panel .file-picker");
  const title = document.querySelector<HTMLElement>("#file-picker-title");
  const hint = document.querySelector<HTMLElement>("#file-picker-hint");
  const selectionWrap = document.querySelector<HTMLElement>("#selection-wrap");
  if (!picker || !title || !hint || !selectionWrap) return;

  let cta = picker.querySelector<HTMLElement>(".file-picker-cta");
  if (!cta) {
    cta = document.createElement("span");
    cta.className = "file-picker-cta";
    cta.setAttribute("aria-hidden", "true");
    picker.insertBefore(cta, hint);
  }

  const syncCopy = () => {
    const hasFiles = !selectionWrap.classList.contains("hidden");
    title.textContent = hasFiles ? "Add more recordings or screenshots" : "Add your recordings or screenshots";
    cta!.textContent = hasFiles ? "Choose more files" : "Choose files";
    hint.textContent = desktopDragDrop ? "or drag them here" : "You can add more than one file.";
  };

  const observer = new MutationObserver(syncCopy);
  observer.observe(selectionWrap, { attributes: true, attributeFilter: ["class"] });
  syncCopy();
}

function strengthenVerifyPicker(desktopDragDrop: boolean): void {
  const panel = document.querySelector<HTMLElement>("#verify-panel");
  const picker = panel?.querySelector<HTMLElement>(".file-picker");
  const title = picker?.querySelector<HTMLElement>(".file-picker-title");
  const hint = picker?.querySelector<HTMLElement>("span:not(.file-picker-title)");
  const intro = panel?.querySelector<HTMLElement>(".card-heading p");
  if (!picker || !title || !hint) return;

  const redundantCta = picker.querySelector<HTMLElement>(".file-picker-cta");
  redundantCta?.remove();

  if (intro) intro.textContent = "Everything is checked on this device.";
  title.textContent = "Choose ProofStamp ZIP";
  title.classList.add("file-picker-cta");
  title.removeAttribute("aria-hidden");
  hint.textContent = desktopDragDrop ? "or drag it here" : "Choose one ZIP file.";
}

function setupUxPolish(): void {
  const heroCopy = document.querySelector<HTMLElement>(".hero-copy");
  if (heroCopy) {
    heroCopy.textContent = "Save a call recording, chat screenshot, or both. The app proves the exact files existed by an independently signed time.";
  }

  addPrivacyVerification();
  simplifyFooter();
  watchCreatedResult();

  const howItWorks = document.querySelector<HTMLElement>("#how-it-works");
  const privacy = document.querySelector<HTMLElement>("#privacy");
  if (howItWorks) makeSectionDisclosure(howItWorks, "How it works");
  if (privacy) makeSectionDisclosure(privacy, "Privacy");
  wireSectionLinks();

  const desktopDragDrop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  strengthenCreatePicker(desktopDragDrop);
  strengthenVerifyPicker(desktopDragDrop);

  if (!desktopDragDrop || typeof DataTransfer === "undefined") return;

  const createInput = document.querySelector<HTMLInputElement>("#create-files");
  const createPicker = createInput?.closest<HTMLElement>(".file-picker");
  if (createInput && createPicker) {
    enableDropZone(createPicker, createInput, true);
  }

  const verifyInput = document.querySelector<HTMLInputElement>("#verify-file");
  const verifyPicker = verifyInput?.closest<HTMLElement>(".file-picker");
  if (verifyInput && verifyPicker) {
    enableDropZone(verifyPicker, verifyInput, false);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupUxPolish, { once: true });
} else {
  setupUxPolish();
}
