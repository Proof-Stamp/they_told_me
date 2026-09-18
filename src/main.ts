import "./styles.css";
import { MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES } from "./lib/constants";
import { createLatestAsyncRunner, CreationOperation } from "./lib/operation-control";
import { createProofPackage, verifyProofPackage } from "./lib/package";
import type { CreatedProof, SelectedFile } from "./lib/model";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root is missing.");

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

app.innerHTML = `
  <header class="site-header">
    <a class="brand" href="#top" aria-label="They Told Me home">
      <span class="product-name">They Told Me</span>
      <span class="brand-byline">by <img src="/proofstamp-wordmark-blue.svg" alt="ProofStamp" /></span>
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
      <p class="hero-copy">Save a call recording, chat screenshot, or both. Add an independent time you can check later.</p>
    </section>

    <section class="privacy-banner" aria-label="Privacy">
      <img class="privacy-marker" src="/proof-point-card-marker.svg" alt="" aria-hidden="true" />
      <div>
        <strong>Your recordings and screenshots stay on this device.</strong>
        <span>Only a small timestamp request leaves your browser.</span>
      </div>
    </section>

    <div class="mode-switch" aria-label="Choose a task">
      <button id="create-mode" class="active" type="button" aria-pressed="true" aria-controls="create-panel">Create ProofStamp</button>
      <button id="verify-mode" type="button" aria-pressed="false" aria-controls="verify-panel">Check ProofStamp</button>
    </div>

    <section class="tool-card" aria-label="ProofStamp tool">
      <div id="create-panel" aria-labelledby="create-title">
        <div class="card-heading">
          <img class="proof-point" src="/proof-point-card-marker.svg" alt="" aria-hidden="true" />
          <div>
            <h2 id="create-title">Choose what you want to keep</h2>
            <p>Add a recording, screenshots, or a mixed set.</p>
          </div>
        </div>

        <p id="create-limits" class="limit-note">Up to ${MAX_FILES} files · ${mb(MAX_FILE_BYTES)} MB each · ${mb(MAX_TOTAL_BYTES)} MB total</p>

        <label class="file-picker" for="create-files">
          <span id="file-picker-title" class="file-picker-title">Choose recordings or screenshots</span>
          <span id="file-picker-hint">You can add more than one file.</span>
          <input id="create-files" type="file" multiple aria-describedby="create-limits" />
        </label>

        <div id="selection-wrap" class="selection-wrap hidden">
          <div class="selection-head">
            <strong id="selection-count"></strong>
            <button id="clear-files" class="text-button" type="button">Clear all</button>
          </div>
          <div id="file-list" class="file-list"></div>
          <label class="field-label" for="proof-label">Label <span>(optional)</span></label>
          <input id="proof-label" class="text-input" maxlength="120" placeholder="Internet cancellation call" aria-describedby="proof-label-help" />
          <p id="proof-label-help" class="field-help">Saved inside the ProofStamp. Not sent for timestamping.</p>
          <div class="create-actions">
            <button id="create-proof" class="primary-button" type="button">Create ProofStamp</button>
            <button id="cancel-create" class="secondary-button hidden" type="button">Cancel</button>
          </div>
        </div>

        <div id="create-status" class="status-box hidden" role="status" aria-live="polite"></div>
        <div id="created-result" class="result-card hidden" role="status" aria-live="polite"></div>
      </div>

      <div id="verify-panel" class="hidden" aria-labelledby="verify-title">
        <div class="card-heading">
          <img class="proof-point" src="/proof-point-card-marker.svg" alt="" aria-hidden="true" />
          <div>
            <h2 id="verify-title">Check a ProofStamp</h2>
            <p>Choose a <code>.proofstamp.zip</code>. Everything is checked on this device.</p>
          </div>
        </div>

        <label class="file-picker" for="verify-file">
          <span class="file-picker-title">Choose ProofStamp ZIP</span>
          <span>The package is not uploaded.</span>
          <input id="verify-file" type="file" accept=".zip,.proofstamp.zip,application/zip" />
        </label>
        <div id="verify-status" class="status-box hidden" role="status" aria-live="polite"></div>
        <div id="verify-result" class="result-card hidden" role="status" aria-live="polite"></div>
      </div>
    </section>

    <section id="how-it-works" class="info-section">
      <p class="eyebrow">How it works</p>
      <h2>Keep the record. Add independent time.</h2>
      <ol class="how-grid">
        <li><span>1</span><strong>Choose the files</strong><p>Add the recording, screenshots, or other files you want to preserve together.</p></li>
        <li><span>2</span><strong>Process on this device</strong><p>Your browser hashes the files and sends only a small timestamp request.</p></li>
        <li><span>3</span><strong>Keep one ProofStamp</strong><p>Save the ZIP with your originals and the information needed to check them later.</p></li>
      </ol>
      <div class="scope-card">
        <div>
          <strong>What it proves</strong>
          <p>These exact file bytes existed no later than the signed timestamp.</p>
        </div>
        <div>
          <strong>What it does not prove</strong>
          <p>It does not prove the conversation's actual date, participants, truth, completeness, or acceptance of an agreement.</p>
        </div>
      </div>
    </section>

    <section id="privacy" class="info-section privacy-section">
      <p class="eyebrow">Privacy</p>
      <h2>Your evidence stays local.</h2>
      <p>Original files, filenames, labels, previews, the manifest, and the completed ZIP stay on your device during creation and verification. Only a small RFC 3161 timestamp request containing a SHA-256 digest and protocol fields leaves the browser.</p>
      <p>The request goes to a stateless ProofStamp relay on Cloudflare Pages, which forwards it only to FreeTSA. The relay does not accept original files or a destination URL.</p>
      <p>Cloudflare and FreeTSA can still see normal network metadata. There are no accounts, database, analytics, or remote proof history. Anyone you share the ZIP with can read the originals inside it.</p>
    </section>
  </main>

  <footer><span>They Told Me by <a href="https://proofstamp.org/">ProofStamp</a></span><span>Proof of existence and integrity. Not proof of truth.</span></footer>
`;

const createMode = document.querySelector<HTMLButtonElement>("#create-mode")!;
const verifyMode = document.querySelector<HTMLButtonElement>("#verify-mode")!;
const createPanel = document.querySelector<HTMLDivElement>("#create-panel")!;
const verifyPanel = document.querySelector<HTMLDivElement>("#verify-panel")!;
const createInput = document.querySelector<HTMLInputElement>("#create-files")!;
const filePickerTitle = document.querySelector<HTMLElement>("#file-picker-title")!;
const filePickerHint = document.querySelector<HTMLElement>("#file-picker-hint")!;
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
const verifyPicker = verifyInput.closest<HTMLElement>(".file-picker")!;
const verifyStatus = document.querySelector<HTMLDivElement>("#verify-status")!;
const verifyResult = document.querySelector<HTMLDivElement>("#verify-result")!;

let selected: SelectedFile[] = [];
let previewUrls: string[] = [];
let currentProof: (CreatedProof & { transport: "direct" | "relay" }) | null = null;
let proofDownloadUrl: string | null = null;
const creationOperation = new CreationOperation<SelectedFile>();
const runLatestVerification = createLatestAsyncRunner();

function setMode(mode: "create" | "verify"): void {
  if (creationOperation.locked) return;
  const creating = mode === "create";
  createMode.classList.toggle("active", creating);
  verifyMode.classList.toggle("active", !creating);
  createMode.setAttribute("aria-pressed", String(creating));
  verifyMode.setAttribute("aria-pressed", String(!creating));
  createPanel.classList.toggle("hidden", !creating);
  verifyPanel.classList.toggle("hidden", creating);
}

createMode.addEventListener("click", () => setMode("create"));
verifyMode.addEventListener("click", () => setMode("verify"));

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

function setCreationLocked(locked: boolean): void {
  createInput.disabled = locked;
  clearFilesButton.disabled = locked;
  labelInput.disabled = locked;
  createMode.disabled = locked;
  verifyMode.disabled = locked;
  const picker = createInput.closest<HTMLElement>(".file-picker");
  picker?.classList.toggle("interaction-locked", locked);
  picker?.setAttribute("aria-disabled", String(locked));
  fileList.querySelectorAll<HTMLButtonElement>(".remove-button").forEach((button) => {
    button.disabled = locked;
  });
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
  const hasFiles = selected.length > 0;
  selectionWrap.classList.toggle("hidden", !hasFiles);
  selectionCount.textContent = selected.length === 1 ? "1 file selected" : `${selected.length} files selected`;
  filePickerTitle.textContent = hasFiles ? "Add more recordings or screenshots" : "Choose recordings or screenshots";
  filePickerHint.textContent = hasFiles ? "Choose more files if needed." : "You can add more than one file.";

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
    size.textContent = `${formatBytes(item.file.size)}${item.file.type ? ` · ${item.file.type}` : ""}`;
    meta.append(name, size);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-button";
    remove.setAttribute("aria-label", `Remove ${item.file.name}`);
    remove.textContent = "Remove";
    remove.disabled = creationOperation.locked;
    remove.addEventListener("click", () => {
      if (creationOperation.locked) return;
      selected = selected.filter((candidate) => candidate.id !== item.id);
      invalidateProof();
      renderSelection();
    });
    row.append(preview, meta, remove);
    fileList.append(row);
  }
}

createInput.addEventListener("change", () => {
  if (creationOperation.locked) {
    createInput.value = "";
    return;
  }
  const added = Array.from(createInput.files ?? []).map((file) => ({ id: crypto.randomUUID(), file }));
  createInput.value = "";
  if (!added.length) return;

  const next = [...selected, ...added];
  if (next.length > MAX_FILES) {
    showCreateStatus(`Choose no more than ${MAX_FILES} files.`, "error");
    return;
  }
  const oversized = added.find(({ file }) => file.size > MAX_FILE_BYTES);
  if (oversized) {
    showCreateStatus(`${oversized.file.name} is over the ${mb(MAX_FILE_BYTES)} MB per-file limit.`, "error");
    return;
  }
  const totalBytes = next.reduce((sum, item) => sum + item.file.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    showCreateStatus(`These files exceed the ${mb(MAX_TOTAL_BYTES)} MB total limit. Remove a file and try again.`, "error");
    return;
  }

  selected = next;
  invalidateProof();
  renderSelection();
});

clearFilesButton.addEventListener("click", () => {
  if (creationOperation.locked) return;
  selected = [];
  invalidateProof();
  renderSelection();
});

labelInput.addEventListener("input", () => {
  if (creationOperation.locked) return;
  invalidateProof();
});

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
  title.textContent = "Your ProofStamp is ready";
  const statement = document.createElement("p");
  statement.className = "result-time";
  statement.textContent = proof.manifest.files.length === 1 ? "This file existed by:" : `These ${proof.manifest.files.length} files existed by:`;
  const time = document.createElement("strong");
  time.className = "big-time";
  time.textContent = localDateTime(proof.timestamp.signedTime);
  const explanation = document.createElement("p");
  explanation.textContent = "Download and keep this ZIP. It contains your originals and everything needed to check the proof later.";
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
  detailText.className = "technical-copy";
  detailText.textContent = `UTC ${proof.timestamp.signedTime.toISOString()} · FreeTSA RFC 3161 · SHA-256 · timestamp request sent through the ProofStamp relay · certificate revocation not checked by the browser verifier.`;
  details.append(summary, detailText);
  createdResult.append(title, statement, time, explanation, download, downloadNote, details);
}

createButton.addEventListener("click", async () => {
  if (creationOperation.locked) return;
  invalidateProof();
  const run = creationOperation.start(selected, labelInput.value);
  setCreationLocked(true);
  createPanel.setAttribute("aria-busy", "true");
  createButton.disabled = true;
  createButton.textContent = "Creating ProofStamp…";
  cancelButton.classList.remove("hidden");
  showCreateStatus("Creating your ProofStamp. Keep this tab open.");
  try {
    const proof = await createProofPackage(run.selected, run.label, run.signal);
    if (run.signal.aborted || !creationOperation.isCurrent(run)) return;
    currentProof = proof;
    createStatus.classList.add("hidden");
    renderCreated(proof);
  } catch (error) {
    if (!creationOperation.isCurrent(run)) return;
    if (run.signal.aborted) showCreateStatus("ProofStamp creation was cancelled. No proof was created.", "error");
    else showCreateStatus(error instanceof Error ? error.message : "ProofStamp could not be created.", "error");
  } finally {
    if (creationOperation.isCurrent(run)) {
      creationOperation.finish(run);
      createPanel.removeAttribute("aria-busy");
      setCreationLocked(false);
      createButton.disabled = false;
      createButton.textContent = "Create ProofStamp";
      cancelButton.classList.add("hidden");
    }
  }
});

cancelButton.addEventListener("click", () => creationOperation.cancel());

function renderVerifyResult(result: Awaited<ReturnType<typeof verifyProofPackage>>, packageName: string): void {
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

  const checkedFile = document.createElement("p");
  checkedFile.className = "verify-file-name";
  checkedFile.append("Checked: ");
  const checkedFileName = document.createElement("code");
  checkedFileName.textContent = packageName;
  checkedFile.append(checkedFileName);

  const message = document.createElement("p");
  message.textContent = result.status === "verified" ? result.message.replace(/^Verified\.\s*/, "") : result.message;
  verifyResult.append(title, checkedFile, message);

  if (result.signedTime) {
    const statement = document.createElement("p");
    statement.className = "result-time";
    statement.textContent = result.fileCount === 1 ? "This exact file existed by:" : "These exact files existed by:";
    const time = document.createElement("strong");
    time.className = "big-time";
    time.textContent = localDateTime(result.signedTime);
    verifyResult.append(statement, time);
  }

  if (result.details?.length) {
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = result.status === "verified" ? "Technical details" : "Details";
    const list = document.createElement("ul");
    result.details.forEach((detail) => {
      const item = document.createElement("li");
      item.textContent = detail;
      list.append(item);
    });
    details.append(summary, list);
    verifyResult.append(details);
  }

  const checkAnother = document.createElement("button");
  checkAnother.type = "button";
  checkAnother.className = "secondary-button verify-another-button";
  checkAnother.textContent = "Check another ProofStamp";
  checkAnother.addEventListener("click", () => verifyInput.click());
  verifyResult.append(checkAnother);
  verifyPicker.classList.add("hidden");
}

verifyInput.addEventListener("change", async () => {
  const file = verifyInput.files?.[0];
  if (!file) {
    verifyStatus.className = "status-box working";
    verifyStatus.textContent = "Choose a ProofStamp ZIP.";
    return;
  }

  await runLatestVerification(
    () => verifyProofPackage(file),
    {
      onStart: () => {
        verifyResult.classList.add("hidden");
        verifyResult.replaceChildren();
        verifyPicker.classList.add("hidden");
        verifyStatus.className = "status-box working";
        verifyStatus.textContent = "Checking this ProofStamp on your device…";
        verifyPanel.setAttribute("aria-busy", "true");
      },
      onSuccess: (result) => {
        verifyStatus.classList.add("hidden");
        renderVerifyResult(result, file.name);
      },
      onError: (error) => {
        verifyPicker.classList.remove("hidden");
        verifyStatus.className = "status-box error";
        verifyStatus.textContent = error instanceof Error ? error.message : "This ProofStamp could not be checked.";
      },
      onFinish: () => {
        verifyPanel.removeAttribute("aria-busy");
        verifyInput.value = "";
      },
    },
  );
});

window.addEventListener("beforeunload", () => {
  clearPreviews();
  if (proofDownloadUrl) URL.revokeObjectURL(proofDownloadUrl);
});