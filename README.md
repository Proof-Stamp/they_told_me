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

File contents, filenames, labels, previews, manifest generation, hashing, ZIP creation, downloads, and package verification run in the browser. Only an RFC 3161 timestamp request containing the manifest digest and protocol fields leaves the browser. The app first tries FreeTSA directly and falls back to a bounded, stateless Cloudflare Pages Function if the browser cannot reach the timestamp authority directly.

The relay accepts only `POST application/timestamp-query`, has a small request limit, and forwards only to the fixed FreeTSA endpoint. It never receives original files. Normal network metadata can still be visible to Cloudflare and FreeTSA.

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

```bash
npm install
npm test
npm run test:freetsa
npm run build
```

`npm run test:freetsa` is a live integration check. It sends a synthetic digest to FreeTSA and verifies the returned timestamp both in JavaScript and with the installed `openssl` CLI.

For local Cloudflare Pages + Functions development after building:

```bash
npm run build
npm run pages:dev
```

See [timestamp trust and independent verification](docs/VERIFICATION.md) and [Cloudflare Pages configuration](docs/DEPLOYMENT.md).

## Reference state used for v1

The implementation was started from an empty target repository. Patterns were reviewed from:

- `Proof-Stamp/emailapp` at `1cbaa6c76cb9386413676cdb800d21871b6b3a1d` for local file handling and receipt/verification ideas. Its Rust hashing path was deliberately not copied.
- `Proof-Stamp/solana` at `b975e04062ec8addbcc71c019a4e0c6b4f1bece0` for current ProofStamp UI, accessibility, Cloudflare, testing, and engineering conventions.

This project uses JavaScript/TypeScript only. It has no Rust dependency or Rust/WASM build step.
