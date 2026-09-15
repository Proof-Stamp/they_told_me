import "./ux-polish.css";

function assignDroppedFiles(input: HTMLInputElement, files: File[]): void {
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
    zone.classList.add("drag-active");
  });

  zone.addEventListener("dragover", (event) => {
    if (!containsFiles(event)) return;
    event.preventDefault();
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
    const dropped = Array.from(event.dataTransfer?.files ?? []);
    if (!dropped.length) return;
    assignDroppedFiles(input, multiple ? dropped : dropped.slice(0, 1));
  });
}

function setupUxPolish(): void {
  const heroCopy = document.querySelector<HTMLElement>(".hero-copy");
  if (heroCopy) {
    heroCopy.textContent = "Save a call recording, chat screenshot, or both. The app proves the exact files existed by an independently signed time.";
  }

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
