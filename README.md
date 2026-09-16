# They Told Me by ProofStamp

Keep your own verifiable copy of what you were told.

They Told Me is a small browser app for preserving customer-service call recordings, chat screenshots, or a mixed set of existing files. It keeps the originals on the user's device, creates a local SHA-256 manifest, obtains an independent RFC 3161 timestamp for that manifest digest, and downloads one `.proofstamp.zip` for later verification.

## What it proves

A successful verification establishes that:

1. every expected original in the package matches the SHA-256 recorded in `proof/proof.json`;
2. the exact bytes of `proof/proof.json` match the digest in the RFC 3161 timestamp request and response; and
3. the timestamp signature and FreeTSA certificate checks satisfy the application's pinned trust policy.

It does **not** prove the conversation's actual date, participants, truth, completeness, or acceptance of an agreement. A timestamp obtained today does not prove an earlier date displayed inside a screenshot.

## Privacy and storage

There are no accounts, database, cloud proof history, analytics, or remote storage of user files or proof packages.

File contents, filenames, labels, previews, manifest generation, hashing, ZIP creation, downloads, and package verification run in the browser. Only an RFC 3161 timestamp request containing the manifest digest and protocol fields leaves the browser. The app sends that request to a bounded, stateless Cloudflare Pages Function, which forwards only the timestamp query to the fixed FreeTSA endpoint.

The relay accepts only `POST application/timestamp-query`, has a small request limit, and never receives original files. The browser Content Security Policy restricts network connections to the app's own origin. Normal network metadata can still be visible to Cloudflare and FreeTSA.

Anyone who receives the downloaded ZIP can read the originals inside it.

## Portable package

Both single-file and multi-file proofs use the same package:

```text
original/                         original files, byte-for-byte
proof/proof.json                  versioned collection manifest
proof/timestamp.tsq               RFC 3161 request
proof/timestamp.tsr               signed RFC 3161 response
certificates/freetsa-tsa.pem      public TSA certificate
certificates/freetsa-root.pem     public root certificate
ProofStamp.txt                    readable receipt
VERIFY.txt                        independent verification instructions
```

Original ZIP entries are stored without compression. Duplicate filenames remain distinct because the internal path includes selection order.

## Development

Requirements:

- Node.js `>=24.15.0`
- npm `>=12.0.2`

Use the committed dependency lockfile for reproducible installs:

```bash
npm ci
npm test
npm run test:freetsa
npm run build
```

`npm run test:freetsa` is a live integration check. It sends a synthetic digest to FreeTSA and verifies the returned timestamp both in JavaScript and with the installed `openssl` CLI.

For local Cloudflare Pages + Functions development after installing dependencies:

```bash
npm run build
npm run pages:dev
```

For the same build-only Cloudflare Functions check used in CI:

```bash
mkdir -p .tmp && npx wrangler pages functions build functions --outfile .tmp/pages-worker.js
```

See [timestamp trust and independent verification](docs/VERIFICATION.md) and [Cloudflare Pages configuration](docs/DEPLOYMENT.md).

## Public release checklist

The repository can remain private while the preview is being reviewed. Before presenting the project as open source or relying on a public source link:

- choose and commit an intentional `LICENSE` file;
- make the repository public;
- verify the GitHub source URL works for a signed-out visitor; and
- only then use "open source" wording or a public source link in the product UI.

Repository visibility is not changed by the v1 implementation work.

## Reference state used for v1

The implementation was started from an empty target repository. Patterns were reviewed from:

- `Proof-Stamp/emailapp` at `1cbaa6c76cb9386413676cdb800d21871b6b3a1d` for local file handling and receipt/verification ideas. Its Rust hashing path was deliberately not copied.
- `Proof-Stamp/solana` at `b975e04062ec8addbcc71c019a4e0c6b4f1bece0` for current ProofStamp UI, accessibility, Cloudflare, testing, and engineering conventions.

This project uses JavaScript/TypeScript only. It has no Rust dependency or Rust/WASM build step.
