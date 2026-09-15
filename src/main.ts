import "./styles.css";
import { MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES } from "./lib/constants";
import { createProofPackage, verifyProofPackage } from "./lib/package";
import type { CreatedProof, SelectedFile } from "./lib/model";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root is missing.");

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

app.innerHTML = `
  <header class="site-header">
    <a class="brand" href="#top" aria-label="They Told Me home">
      <span class="proof-mark" aria-hidden="true">P<span>•</span></span>
      <span><strong>They Told Me</strong><small>by ProofStamp</small></span>
    </a>
    <nav aria-label="Primary">
      <a href="#how-it-works">How it works</a>
      <a href="#privacy">Privacy</a>
    </nav>
  </header>

  <main id="top">
    <section class="hero" aria-labelledby="hero-title">
      <p class="eyebrow">Your copy. Your proof.</p>
      <h1 id="hero-title">Keep your own verifiable copy of what you were told.</h1>
      <p class="hero-copy">Save a call recording, chat screenshot, or both. The app proves the exact files existed by an independently signed time.</p>
    </section>

    <section class="privacy-banner" aria-label="Privacy">
      <span class="privacy-icon" aria-hidden="true">✓</span>
      <div>
        <strong>Your recordings and screenshots stay on your device.</strong>
        <span>This app does not upload their contents.</span>
      </div>
    </section>

    <section class="tool-card" aria-label="ProofStamp tool">
      <div class="tabs" role="tablist" aria-label="Choose a task">
        <button id="create-tab" class="tab active" type="button" role="tab" aria-selected="true" aria-controls="create-panel">Create Proof</button>
        <button id="verify-tab" class="tab" type="button" role="tab" aria-selected="false" aria-controls="verify-panel">Verify Proof</button>
      </div>

      <div id="create-panel" role="tabpanel" aria-labelledby="create-tab">
        <div class="steps" aria-label="Creation steps"><span class="active">1 Choose files</span><span>2 Review</span><span>3 Create proof</span><span>4 Download</span></div>
        <div class="limit-note">Up to ${MAX_FILES} files. ${mb(MAX_FILE_BYTES)} MB per file. ${mb(MAX_TOTAL_BYTES)} MB total.</div>

        <label class="file-picker" for="create-files">
          <span class="file-picker-title">Choose recordings or screenshots</span>
          <span>You can add more files before creating the proof.</span>
          <input id="create-files" type="file" multiple />
        </label>

        <div id="selection-wrap" class="selection-wrap hidden">
          <div class="selection-head"><strong id="selection-count"></strong><button id="clear-files" class="text-button" type="button">Clear all</button></div>
          <div id="file-list" class="file-list"></div>
          <label class="field-label" for="proof-label">Optional label</label>
          <input id="proof-label" class="text-input" maxlength="120" placeholder="Example: Internet cancellation call" />
          <p class="field-help">This label stays inside the ProofStamp ZIP. It is not sent to the timestamp service.</p>
          <div class="create-actions">
            <button id="create-proof" class="primary-button" type="button">Create proof</button>
            <button id="cancel-create" class="secondary-button hidden" type="button">Cancel</button>
          </div>
        </div>

        <div id="create-status" class="status-box hidden" role="status" aria-live="polite"></div>
        <div id="created-result" class="result-card hidden"></div>
      </div>

      <div id="verify-panel" class="hidden" role="tabpanel" aria-labelledby="verify-tab">
        <p class="panel-intro">Choose a <code>.proofstamp.zip</code>. Verification runs in your browser.</p>
        <label class="file-picker" for="verify-file">
          <span class="file-picker-title">Choose ProofStamp ZIP</span>
          <span>The package is not uploaded to ProofStamp.</span>
          <input id="verify-file" type="file" accept=".zip,.proofstamp.zip,application/zip" />
        </label>
        <div id="verify-status" class="status-box hidden" role="status" aria-live="polite"></div>
        <div id="verify-result" class="result-card hidden"></div>
      </div>
    </section>

    <section id="how-it-works" class="info-section">
      <p class="eyebrow">How it works</p>
      <h2>Four steps. Your files remain yours.</h2>
      <ol class="how-grid">
        <li><span>1</span><strong>Choose existing files</strong><p>Add a recording, screenshots, or a mixed set.</p></li>
        <li><span>2</span><strong>Process locally</strong><p>Your browser calculates SHA-256 hashes and builds a manifest.</p></li>
        <li><span>3</span><strong>Get an independent time</strong><p>Only the manifest digest and RFC 3161 protocol fields are sent for timestamping.</p></li>
        <li><span>4</span><strong>Keep one package</strong><p>Download a ZIP containing your originals and everything needed to check the proof.</p></li>
      </ol>
      <div class="limits-card">
        <strong>What the proof means</strong>
        <p>It shows that these exact file bytes existed no later than the signed timestamp.</p>
        <strong>What it does not mean</strong>
        <p>It does not prove the conversation's actual date, participants, truth, completeness, or acceptance of an agreement. A timestamp obtained today does not prove an earlier date shown inside a screenshot. ProofStamp also cannot recover a package you lose.</p>
      </div>
    </section>

    <section id="privacy" class="info-section privacy-section">
      <p class="eyebrow">Privacy</p>
      <h2>Your evidence is processed in your browser.</h2>
      <p>Original files, filenames, labels, previews, the manifest, and the completed ZIP stay on your device during creation and verification. Only a small RFC 3161 timestamp request containing a SHA-256 digest and protocol fields leaves the browser.</p>
      <p>The app sends that small timestamp request to a stateless Cloudflare Pages Function, which forwards only the RFC 3161 request to FreeTSA. The relay is not a file upload service and does not accept a destination URL.</p>
      <p>Normal network metadata can still be visible to Cloudflare and FreeTSA. The app has no accounts, database, analytics, or remote proof history.</p>
      <p>If you share the downloaded ZIP, the recipient can read the recordings and screenshots inside it.</p>
    </section>
  </main>

  <footer><span>They Told Me by ProofStamp</span><span>Proof of existence and integrity. Not proof of truth.</span></footer>
`;

const createTab = document.querySelector<HTMLButtonElement>("#create-tab")!;
const verifyTab = document.querySelector<HTMLButtonElement>("#verify-tab")!;
const createPanel = document.querySelector<HTMLDivElement>("#create-panel")!;
const verifyPanel = document.querySelector<HTMLDivElement>("#verify-panel")!;
const createInput = document.querySelector<HTMLInputElement>("#create-files")!;
const selectionWrap = document.querySelector<HTMLDivElement>("#selection-wrap")!;
const selectionCount = document.querySelector<HTMLElement>("#selection-count")!;
const fileList = document.querySelector<HTMLDivElement>("#file-list")!;
const clearFilesButton = document.querySelector<HTMLButtonElement>("#clear-files")!;
const labelInput = document.querySelector<HTMLInputElement>("#proof-label")!;
const createButton = document.querySelector<HTMLButtonElement>("#create-proof")!;
const cancelButton = document.querySelector<HTMLButtonElement>("#cancel-create")!;
const createStatus = document.querySelector<HTMLDivElement>("#create-status")!;
const createdResult = document.querySelector<HTMLDivElement>("#created-result")!;
const verifyInput = document.querySelector<HTMLInputElement>("#verify-file")!;
const verifyStatus = document.querySelector<HTMLDivElement>("#verify-status")!;
const verifyResult = document.querySelector<HTMLDivElement>("#verify-result")!;

let selected: SelectedFile[] = [];
let previewUrls: string[] = [];
let currentProof: (CreatedProof & { transport: "direct" | "relay" }) | null = null;
let proofDownloadUrl: string | null = null;
let createController: AbortController | null = null;

function setTab(mode: "create" | "verify"): void {
  const creating = mode === "create";
  createTab.classList.toggle("active", creating);
  verifyTab.classList.toggle("active", !creating);
  createTab.setAttribute("aria-selected", String(creating));
  verifyTab.setAttribute("aria-selected", String(!creating));
  createPanel.classList.toggle("hidden", !creating);
  verifyPanel.classList.toggle("hidden", creating);
}

createTab.addEventListener("click", () => setTab("create"));
verifyTab.addEventListener("click", () => setTab("verify"));

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

function invalidateProof(): void {
  currentProof = null;
  createdResult.classList.add("hidden");
  createdResult.replaceChildren();
  createStatus.classList.add("hidden");
  if (proofDownloadUrl) URL.revokeObjectURL(proofDownloadUrl);
  proofDownloadUrl = null;
}

function clearPreviews(): void {
  previewUrls.forEach((url) => URL.revokeObjectURL(url));
  previewUrls = [];
}

function addPreview(container: HTMLElement, file: File): void {
  const url = URL.createObjectURL(file);
  if (file.type.startsWith("image/")) {
    const image = document.createElement("img");
    image.className = "preview-image";
    image.alt = "Local preview";
    image.src = url;
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      image.replaceWith(document.createTextNode("Preview unavailable"));
    }, { once: true });
    previewUrls.push(url);
    container.append(image);
    return;
  }
  if (file.type.startsWith("audio/")) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = url;
    audio.className = "preview-audio";
    audio.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      audio.replaceWith(document.createTextNode("Audio preview unavailable"));
    }, { once: true });
    previewUrls.push(url);
    container.append(audio);
    return;
  }
  URL.revokeObjectURL(url);
  const noPreview = document.createElement("span");
  noPreview.className = "file-type";
  noPreview.textContent = file.type || "FILE";
  container.append(noPreview);
}

function renderSelection(): void {
  clearPreviews();
  fileList.replaceChildren();
  selectionWrap.classList.toggle("hidden", selected.length === 0);
  selectionCount.textContent = selected.length === 1 ? "1 file selected" : `${selected.length} files selected`;

  for (const item of selected) {
    const row = document.createElement("div");
    row.className = "file-row";
    const preview = document.createElement("div");
    preview.className = "file-preview";
    addPreview(preview, item.file);
    const meta = document.createElement("div");
    meta.className = "file-meta";
    const name = document.createElement("strong");
    name.textContent = item.file.name;
    const size = document.createElement("span");
    size.textContent = formatBytes(item.file.size);
    meta.append(name, size);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.setAttribute("aria-label", `Remove ${item.file.name}`);
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      selected = selected.filter((candidate) => candidate.id !== item.id);
      invalidateProof();
      renderSelection();
    });
    row.append(preview, meta, remove);
    fileList.append(row);
  }
}

createInput.addEventListener("change", () => {
  const added = Array.from(createInput.files ?? []).map((file) => ({ id: crypto.randomUUID(), file }));
  selected = [...selected, ...added];
  createInput.value = "";
  invalidateProof();
  renderSelection();
});

clearFilesButton.addEventListener("click", () => {
  selected = [];
  invalidateProof();
  renderSelection();
});

labelInput.addEventListener("input", invalidateProof);

function showCreateStatus(message: string, kind: "working" | "error" = "working"): void {
  createStatus.textContent = message;
  createStatus.className = `status-box ${kind}`;
}

function localDateTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "long" }).format(date);
}

function renderCreated(proof: CreatedProof & { transport: "direct" | "relay" }): void {
  if (proofDownloadUrl) URL.revokeObjectURL(proofDownloadUrl);
  proofDownloadUrl = URL.createObjectURL(proof.packageBlob);
  createdResult.replaceChildren();
  createdResult.className = "result-card success";

  const title = document.createElement("h3");
  title.textContent = "Proof created";
  const statement = document.createElement("p");
  statement.className = "result-time";
  statement.textContent = proof.manifest.files.length === 1 ? "This file existed by:" : `These ${proof.manifest.files.length} files existed by:`;
  const time = document.createElement("strong");
  time.className = "big-time";
  time.textContent = localDateTime(proof.timestamp.signedTime);
  const explanation = document.createElement("p");
  explanation.textContent = "Keep this ZIP. It contains your original files and the information needed to check their proof.";
  const download = document.createElement("a");
  download.className = "primary-button download-button";
  download.href = proofDownloadUrl;
  download.download = `they-told-me-${proof.timestamp.signedTime.toISOString().replace(/[:.]/g, "-")}.proofstamp.zip`;
  download.textContent = "Download ProofStamp";
  const downloadNote = document.createElement("p");
  downloadNote.className = "download-note";
  downloadNote.textContent = "Your browser will start the download. Keep the ZIP somewhere you can find it later.";
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Technical details";
  const detailText = document.createElement("p");
  detailText.textContent = `UTC: ${proof.timestamp.signedTime.toISOString()} · FreeTSA RFC 3161 · SHA-256 · transport: ${proof.transport === "direct" ? "direct to FreeTSA" : "stateless ProofStamp relay"}. Certificate revocation was not checked by the browser verifier.`;
  details.append(summary, detailText);
  createdResult.append(title, statement, time, explanation, download, downloadNote, details);
}

createButton.addEventListener("click", async () => {
  if (createController) return;
  invalidateProof();
  createController = new AbortController();
  createButton.disabled = true;
  cancelButton.classList.remove("hidden");
  showCreateStatus("Checking files and creating the timestamp. Keep this tab open.");
  try {
    const proof = await createProofPackage(selected, labelInput.value, createController.signal);
    currentProof = proof;
    showCreateStatus("The timestamp response passed the ProofStamp verification policy.");
    renderCreated(proof);
  } catch (error) {
    if (createController.signal.aborted) showCreateStatus("Proof creation was cancelled. No proof was created.", "error");
    else showCreateStatus(error instanceof Error ? error.message : "Proof could not be created.", "error");
  } finally {
    createController = null;
    createButton.disabled = false;
    cancelButton.classList.add("hidden");
  }
});

cancelButton.addEventListener("click", () => createController?.abort());

function renderVerifyResult(result: Awaited<ReturnType<typeof verifyProofPackage>>): void {
  verifyResult.replaceChildren();
  verifyResult.className = `result-card ${result.status === "verified" ? "success" : "failure"}`;
  const title = document.createElement("h3");
  const titleByStatus = {
    verified: "Verified",
    "file-mismatch": "File does not match",
    "package-damaged": "Package incomplete or damaged",
    "timestamp-unverified": "Timestamp could not be verified",
  } as const;
  title.textContent = titleByStatus[result.status];
  const message = document.createElement("p");
  message.textContent = result.message;
  verifyResult.append(title, message);
  if (result.signedTime) {
    const time = document.createElement("strong");
    time.className = "big-time";
    time.textContent = localDateTime(result.signedTime);
    verifyResult.append(time);
  }
  if (result.details?.length) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Details";
    const list = document.createElement("ul");
    result.details.forEach((detail) => {
      const item = document.createElement("li");
      item.textContent = detail;
      list.append(item);
    });
    details.append(summary, list);
    verifyResult.append(details);
  }
}

verifyInput.addEventListener("change", async () => {
  const file = verifyInput.files?.[0];
  verifyResult.classList.add("hidden");
  verifyStatus.className = "status-box working";
  verifyStatus.textContent = file ? "Checking the package locally…" : "Choose a ProofStamp ZIP.";
  if (!file) return;
  try {
    const result = await verifyProofPackage(file);
    verifyStatus.classList.add("hidden");
    renderVerifyResult(result);
  } catch (error) {
    verifyStatus.className = "status-box error";
    verifyStatus.textContent = error instanceof Error ? error.message : "The package could not be checked.";
  } finally {
    verifyInput.value = "";
  }
});

window.addEventListener("beforeunload", () => {
  clearPreviews();
  if (proofDownloadUrl) URL.revokeObjectURL(proofDownloadUrl);
});
