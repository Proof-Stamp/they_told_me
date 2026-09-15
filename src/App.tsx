import { useEffect, useMemo, useRef, useState } from 'react';
import { buildManifest, MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES } from './lib/manifest';
import { createProofZip, verifyProofZip } from './lib/package';
import { createTimestampRequest, requestTimestamp, verifyTimestamp } from './lib/timestamp';

type Tab = 'create' | 'verify';
type CreateState = 'idle' | 'working' | 'ready' | 'error';
type VerifyState = 'idle' | 'working' | 'verified' | 'error';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSignedTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(date);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function previewUrl(file: File): string | null {
  if (file.type.startsWith('image/') || file.type.startsWith('audio/')) return URL.createObjectURL(file);
  return null;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('create');
  const [files, setFiles] = useState<File[]>([]);
  const [label, setLabel] = useState('');
  const [createState, setCreateState] = useState<CreateState>('idle');
  const [createMessage, setCreateMessage] = useState('');
  const [proofBlob, setProofBlob] = useState<Blob | null>(null);
  const [signedTime, setSignedTime] = useState<Date | null>(null);
  const [technical, setTechnical] = useState<{ policy: string } | null>(null);
  const createAbort = useRef<AbortController | null>(null);

  const [verifyFile, setVerifyFile] = useState<File | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyState>('idle');
  const [verifyMessage, setVerifyMessage] = useState('');
  const [verifyTime, setVerifyTime] = useState<Date | null>(null);

  const previews = useMemo(() => files.map((file) => ({ file, url: previewUrl(file) })), [files]);
  useEffect(() => () => previews.forEach((item) => item.url && URL.revokeObjectURL(item.url)), [previews]);

  function invalidateProof(): void {
    createAbort.current?.abort();
    createAbort.current = null;
    setCreateState('idle');
    setCreateMessage('');
    setProofBlob(null);
    setSignedTime(null);
    setTechnical(null);
  }

  function addFiles(selection: FileList | null): void {
    if (!selection) return;
    setFiles((current) => [...current, ...Array.from(selection)]);
    invalidateProof();
  }

  function removeFile(index: number): void {
    setFiles((current) => current.filter((_, i) => i !== index));
    invalidateProof();
  }

  async function createProof(): Promise<void> {
    if (createState === 'working') return;
    const controller = new AbortController();
    createAbort.current = controller;
    setCreateState('working');
    setCreateMessage('Checking your files on this device…');
    setProofBlob(null);
    setSignedTime(null);
    try {
      const { manifest, bytes } = await buildManifest(files, label);
      setCreateMessage('Preparing an independent timestamp…');
      const tsq = await createTimestampRequest(bytes);
      setCreateMessage('Getting the timestamp…');
      const tsr = await requestTimestamp(tsq, controller.signal);
      setCreateMessage('Checking the timestamp before creating your package…');
      const verified = await verifyTimestamp(bytes, tsq, tsr);
      const blob = await createProofZip(files, manifest, bytes, tsq, tsr, verified.signedTime, verified.signerPem);
      setProofBlob(blob);
      setSignedTime(verified.signedTime);
      setTechnical({ policy: verified.policy });
      setCreateState('ready');
      setCreateMessage('Proof created.');
    } catch (error) {
      if (controller.signal.aborted) {
        setCreateState('idle');
        setCreateMessage('Creation cancelled.');
      } else {
        setCreateState('error');
        setCreateMessage(error instanceof Error ? error.message : 'Could not create the proof.');
      }
    } finally {
      createAbort.current = null;
    }
  }

  async function verifyProof(): Promise<void> {
    if (!verifyFile || verifyState === 'working') return;
    setVerifyState('working');
    setVerifyMessage('Checking every file and the independent timestamp…');
    setVerifyTime(null);
    try {
      const result = await verifyProofZip(verifyFile);
      setVerifyState('verified');
      setVerifyTime(result.signedTime);
      setVerifyMessage(`${result.fileCount === 1 ? '1 file matches' : `${result.fileCount} files match`} and the timestamp is valid.`);
    } catch (error) {
      setVerifyState('error');
      setVerifyMessage(error instanceof Error ? error.message : 'The package could not be verified.');
    }
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const createDisabled = files.length === 0 || createState === 'working' || createState === 'ready';

  return (
    <div className="shell">
      <header className="brandbar">
        <div>
          <div className="brand">They Told Me</div>
          <div className="byline">by ProofStamp</div>
        </div>
        <a className="small-link" href="#how-it-works">How it works</a>
      </header>

      <main>
        <section className="hero" aria-labelledby="page-title">
          <p className="eyebrow">KEEP YOUR OWN COPY</p>
          <h1 id="page-title">Keep your own verifiable copy of what you were told.</h1>
          <p className="lede">For customer service recordings and chat screenshots you want to keep exactly as they were.</p>
        </section>

        <div className="privacy-note" role="note">
          <strong>Your recordings and screenshots stay on your device.</strong>
          <span>This app does not upload their contents. Only a cryptographic digest is sent for timestamping.</span>
        </div>

        <div className="tabs" role="tablist" aria-label="Proof actions">
          <button role="tab" aria-selected={tab === 'create'} className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>Create Proof</button>
          <button role="tab" aria-selected={tab === 'verify'} className={tab === 'verify' ? 'active' : ''} onClick={() => setTab('verify')}>Verify Proof</button>
        </div>

        {tab === 'create' ? (
          <section className="panel" aria-labelledby="create-heading">
            <h2 id="create-heading">Choose files</h2>
            <p className="muted">Up to {MAX_FILES} files. {formatBytes(MAX_FILE_BYTES)} each, {formatBytes(MAX_TOTAL_BYTES)} total.</p>
            <label className="file-picker">
              <span>Add recordings or screenshots</span>
              <input type="file" multiple accept="audio/*,image/*" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ''; }} />
            </label>

            {files.length > 0 && (
              <div className="selection">
                <div className="selection-head">
                  <strong>{files.length} {files.length === 1 ? 'file' : 'files'} selected</strong>
                  <span>{formatBytes(totalBytes)}</span>
                </div>
                <ul className="file-list">
                  {previews.map(({ file, url }, index) => (
                    <li key={`${file.name}-${file.size}-${index}`}>
                      <div className="preview">
                        {url && file.type.startsWith('image/') ? <img src={url} alt="" /> : null}
                        {url && file.type.startsWith('audio/') ? <audio src={url} controls preload="metadata" /> : null}
                      </div>
                      <div className="file-meta">
                        <span className="filename">{file.name}</span>
                        <span className="muted">{formatBytes(file.size)}</span>
                      </div>
                      <button className="ghost" type="button" onClick={() => removeFile(index)} aria-label={`Remove ${file.name}`}>Remove</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <label className="field">
              <span>Label <small>(optional)</small></span>
              <input value={label} maxLength={120} onChange={(event) => { setLabel(event.target.value); invalidateProof(); }} placeholder="e.g. Mobile plan cancellation" />
            </label>

            <div className="actions">
              <button className="primary" type="button" disabled={createDisabled} onClick={createProof}>Create proof</button>
              {createState === 'working' && <button className="secondary" type="button" onClick={() => createAbort.current?.abort()}>Cancel</button>}
            </div>

            <div className={`status ${createState}`} aria-live="polite">
              {createMessage}
            </div>

            {createState === 'ready' && proofBlob && signedTime && (
              <div className="result success">
                <p className="result-kicker">Proof created</p>
                <h3>{files.length === 1 ? 'This file existed by:' : `These ${files.length} files existed by:`}</h3>
                <p className="signed-time">{formatSignedTime(signedTime)}</p>
                <button className="primary wide" type="button" onClick={() => downloadBlob(proofBlob, 'they-told-me.proofstamp.zip')}>Download ProofStamp</button>
                <p className="muted">Keep this ZIP. It contains your original files and the information needed to check their proof.</p>
                <details>
                  <summary>Technical details</summary>
                  <dl>
                    <div><dt>UTC</dt><dd>{signedTime.toISOString()}</dd></div>
                    <div><dt>Timestamp policy</dt><dd>{technical?.policy}</dd></div>
                    <div><dt>Original files uploaded</dt><dd>No</dd></div>
                  </dl>
                </details>
              </div>
            )}
          </section>
        ) : (
          <section className="panel" aria-labelledby="verify-heading">
            <h2 id="verify-heading">Verify a ProofStamp</h2>
            <p className="muted">Choose the original <code>.proofstamp.zip</code>. Verification happens in your browser.</p>
            <label className="file-picker">
              <span>Choose ProofStamp ZIP</span>
              <input type="file" accept=".zip,.proofstamp.zip,application/zip" onChange={(event) => {
                setVerifyFile(event.target.files?.[0] ?? null);
                setVerifyState('idle');
                setVerifyMessage('');
                setVerifyTime(null);
              }} />
            </label>
            {verifyFile && <p className="chosen"><strong>{verifyFile.name}</strong> · {formatBytes(verifyFile.size)}</p>}
            <button className="primary" type="button" disabled={!verifyFile || verifyState === 'working'} onClick={verifyProof}>Verify proof</button>
            <div className={`status ${verifyState}`} aria-live="polite">{verifyMessage}</div>
            {verifyState === 'verified' && verifyTime && (
              <div className="result success">
                <p className="result-kicker">Verified</p>
                <h3>The files match the timestamped proof.</h3>
                <p className="signed-time">{formatSignedTime(verifyTime)}</p>
              </div>
            )}
          </section>
        )}

        <section id="how-it-works" className="info-section">
          <h2>How it works</h2>
          <ol className="steps">
            <li><strong>Choose existing files.</strong><span>Recordings, screenshots, or a mix.</span></li>
            <li><strong>Process them locally.</strong><span>Your browser hashes the exact bytes and builds a manifest.</span></li>
            <li><strong>Get an independent timestamp.</strong><span>Only the digest used by the timestamp protocol leaves your device.</span></li>
            <li><strong>Keep the package.</strong><span>Your ZIP contains the originals, proof files, and independent verification instructions.</span></li>
          </ol>
          <div className="limits-copy">
            <h3>What this proves</h3>
            <p>The proof establishes that the exact file bytes in the package existed by the signed timestamp. It does not establish the conversation's actual date, participants, truth, completeness, or acceptance of an agreement. A timestamp obtained today does not prove an earlier date shown inside a screenshot.</p>
            <p>If you lose the package, this app cannot recover it.</p>
          </div>
        </section>

        <section id="privacy" className="info-section compact">
          <h2>Privacy</h2>
          <p>Files, filenames, labels, previews, manifests, and completed proof packages remain in your browser. The RFC 3161 timestamp request contains a SHA-256 digest, protocol metadata, and a random nonce. FreeTSA does not currently expose the browser CORS headers required for this cross-origin request, so a stateless Cloudflare Pages Function relays only that bounded timestamp request to FreeTSA.</p>
          <p>The relay does not accept file uploads and does not intentionally store request or response bodies. Normal hosting and network metadata may still be processed by Cloudflare and FreeTSA. Anyone you give the downloaded ZIP to can read the recordings and screenshots inside it.</p>
        </section>
      </main>

      <footer>
        <span>They Told Me by ProofStamp</span>
        <nav aria-label="Footer"><a href="#how-it-works">How it works</a><a href="#privacy">Privacy</a></nav>
      </footer>
    </div>
  );
}
