import { useEffect, useMemo, useRef, useState } from "react";
import { createProof, packageName, verifyProofPackage } from "./lib/proof";
import { exactArrayBuffer, formatBytes } from "./lib/bytes";
import { LIMITS } from "./lib/manifest";

type Mode = "create" | "verify";
type Preview = { url: string; kind: "image" | "audio" | "none" };

function makePreview(file: File): Preview {
  if (file.type.startsWith("image/")) return { url: URL.createObjectURL(file), kind: "image" };
  if (file.type.startsWith("audio/")) return { url: URL.createObjectURL(file), kind: "audio" };
  return { url: "", kind: "none" };
}

function existenceCopy(count: number, date: Date): string {
  return count === 1
    ? `Proof created. This file existed by ${date.toLocaleString()}.`
    : `Proof created. These ${count} files existed by ${date.toLocaleString()}.`;
}

export function App() {
  const [mode, setMode] = useState<Mode>("create");
  const [files, setFiles] = useState<File[]>([]);
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Awaited<ReturnType<typeof createProof>> | null>(null);
  const [verified, setVerified] = useState<Awaited<ReturnType<typeof verifyProofPackage>> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const previews = useMemo(() => files.map(makePreview), [files]);

  useEffect(() => () => previews.forEach((preview) => preview.url && URL.revokeObjectURL(preview.url)), [previews]);

  const resetResult = () => {
    setCreated(null);
    setStatus("");
    setError("");
  };

  const onFiles = (selected: FileList | null) => {
    setFiles(selected ? Array.from(selected) : []);
    resetResult();
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
    resetResult();
  };

  const create = async () => {
    setBusy(true);
    setError("");
    setStatus("Hashing your files on this device…");
    setCreated(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setStatus("Creating an independent timestamp…");
      const proof = await createProof(files, label, controller.signal);
      setCreated(proof);
      setStatus(existenceCopy(proof.manifest.files.length, proof.validation.genTime));
    } catch (e) {
      if (controller.signal.aborted) setError("Proof creation was cancelled.");
      else setError(e instanceof Error ? e.message : "Could not create the proof.");
      setStatus("");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const download = () => {
    if (!created) return;
    const blob = new Blob([exactArrayBuffer(created.zip)], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = packageName(label);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const verify = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setStatus("Checking the ProofStamp package…");
    setVerified(null);
    try {
      const result = await verifyProofPackage(new Uint8Array(await file.arrayBuffer()));
      setVerified(result);
      setStatus(
        `Verified. ${result.manifest.files.length} file${result.manifest.files.length === 1 ? "" : "s"} match, and the timestamp is valid for ${result.validation.genTime.toLocaleString()}.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Timestamp could not be verified.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const createdCount = created?.manifest.files.length ?? 0;

  return <div className="shell">
    <header className="brand">
      <div><strong>They Told Me</strong><span>by ProofStamp</span></div>
      <p>Keep your own verifiable copy of what you were told.</p>
    </header>

    <main>
      <div className="privacy-callout" role="note">
        <strong>Your recordings and screenshots stay on your device.</strong>
        <span>This app does not upload their contents. Only the timestamp request containing a digest and required protocol fields leaves the browser.</span>
      </div>

      <div className="tabs" role="tablist" aria-label="Proof actions">
        <button role="tab" aria-selected={mode === "create"} aria-controls="create-panel" onClick={() => setMode("create")}>Create Proof</button>
        <button role="tab" aria-selected={mode === "verify"} aria-controls="verify-panel" onClick={() => setMode("verify")}>Verify Proof</button>
      </div>

      {mode === "create" ? <section id="create-panel" role="tabpanel" className="card" aria-labelledby="create-heading">
        <h1 id="create-heading">Create your ProofStamp</h1>
        <p>Choose an existing call recording, chat screenshot, or several files that belong together.</p>
        <p className="limits">Up to {LIMITS.maxFiles} files, {formatBytes(LIMITS.maxFileBytes)} each, {formatBytes(LIMITS.maxTotalBytes)} total.</p>

        <label className="file-picker"><span>Choose files</span><input type="file" multiple onChange={(e) => onFiles(e.target.files)} disabled={busy} /></label>

        {files.length > 0 && <div className="selection">
          <div className="selection-head"><strong>{files.length} selected</strong><span>{formatBytes(files.reduce((n, f) => n + f.size, 0))}</span></div>
          <ul>{files.map((file, i) => <li key={`${file.name}-${i}`}>
            <div className="preview">
              {previews[i]?.kind === "image" ? <img src={previews[i].url} alt="" /> : previews[i]?.kind === "audio" ? <audio src={previews[i].url} controls preload="metadata" /> : <span aria-hidden="true">FILE</span>}
            </div>
            <div className="file-meta"><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div>
            <button className="link-button" onClick={() => removeFile(i)} disabled={busy} aria-label={`Remove ${file.name}`}>Remove</button>
          </li>)}</ul>
        </div>}

        <label className="field">Optional label
          <input value={label} maxLength={120} onChange={(e) => { setLabel(e.target.value); resetResult(); }} placeholder="e.g. Refund call with Acme" disabled={busy} />
        </label>

        <div className="actions">
          <button className="primary" onClick={create} disabled={busy || files.length === 0}>{busy ? "Working…" : "Create proof"}</button>
          {busy && <button className="secondary" onClick={() => abortRef.current?.abort()}>Cancel</button>}
        </div>

        {created && <div className="result success">
          <h2>Proof created</h2>
          <p>{createdCount === 1 ? "This file existed by:" : `These ${createdCount} files existed by:`}</p>
          <strong>{created.validation.genTime.toLocaleString()}</strong>
          <button className="primary" onClick={download}>Download ProofStamp</button>
          <p>Keep this ZIP. It contains your original files and the information needed to check their proof.</p>
          <details><summary>Technical details</summary><dl>
            <dt>UTC</dt><dd>{created.validation.genTime.toISOString()}</dd>
            <dt>Timestamp path</dt><dd>{created.transport === "direct" ? "Direct to FreeTSA" : "Via stateless Cloudflare relay"}</dd>
            <dt>Signer fingerprint</dt><dd className="mono">{created.validation.signerFingerprint}</dd>
          </dl></details>
        </div>}
      </section> : <section id="verify-panel" role="tabpanel" className="card" aria-labelledby="verify-heading">
        <h1 id="verify-heading">Verify a ProofStamp</h1>
        <p>Select the <code>.proofstamp.zip</code> you want to check. Verification happens in this browser.</p>
        <label className="file-picker"><span>Choose ProofStamp ZIP</span><input type="file" accept=".zip,application/zip" onChange={(e) => verify(e.target.files?.[0])} disabled={busy} /></label>
        {verified && <div className="result success">
          <h2>Verified</h2>
          <p>Every expected original matches the manifest, the exact manifest matches the timestamped digest, and the timestamp signature matches a pinned FreeTSA signer certificate.</p>
          <strong>{verified.validation.genTime.toLocaleString()}</strong>
          <ul>{verified.manifest.files.map((f) => <li key={f.path}>{f.filename}</li>)}</ul>
        </div>}
      </section>}

      <div aria-live="polite" className="status">{status}</div>
      {error && <div role="alert" className="result error">
        <strong>{error.startsWith("File does not match") ? "File does not match" : error.startsWith("Package incomplete") ? "Package incomplete or damaged" : "Timestamp could not be verified"}</strong>
        <p>{error}</p>
      </div>}

      <section id="how-it-works" className="info">
        <h2>How it works</h2>
        <ol>
          <li><strong>Choose existing files.</strong> Recordings and screenshots are read locally.</li>
          <li><strong>Process them on your device.</strong> The browser creates SHA-256 hashes and a collection manifest.</li>
          <li><strong>Get an independent timestamp.</strong> Only the manifest digest and RFC 3161 protocol fields leave your device.</li>
          <li><strong>Keep the package.</strong> Your ZIP contains the originals and proof material for later checking.</li>
        </ol>
        <p>The proof establishes that these exact file bytes existed by the signed time. It does not establish the conversation's actual date, participants, truth, completeness, or acceptance of an agreement. A timestamp created today does not prove an earlier date shown inside a screenshot. If you lose the package, this app cannot recover it.</p>
      </section>

      <section id="privacy" className="info">
        <h2>Privacy</h2>
        <p>There are no accounts, database, or remote file store. File contents, filenames, labels, previews, the manifest, and the completed ProofStamp ZIP stay in your browser. A timestamp request containing the manifest digest is sent to FreeTSA. If direct browser access is blocked, the same bounded timestamp request is relayed through a stateless Cloudflare Pages Function. Normal network metadata may be visible to Cloudflare and FreeTSA.</p>
        <p>Anyone you give the ZIP to can read the recordings and screenshots inside it.</p>
      </section>
    </main>

    <footer><a href="#how-it-works">How it works</a><a href="#privacy">Privacy</a><span>ProofStamp</span></footer>
  </div>;
}
