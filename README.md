# They Told Me by ProofStamp

A small, privacy-first web app for keeping independently verifiable copies of customer-service recordings, chat screenshots, and related files.

## What it does

The browser hashes every selected original with SHA-256, writes a deterministic versioned manifest, requests a standard RFC 3161 timestamp for the exact manifest bytes, validates the returned timestamp, and packages the originals plus proof material into one `.proofstamp.zip`.

The proof establishes that the exact bytes in the package existed by the signed timestamp. It does **not** establish the conversation's actual date, participants, truth, completeness, or acceptance of an agreement.

## Privacy and hosting

- Target hosting: **Cloudflare Pages**.
- No accounts, database, remote proof history, or storage of original files.
- File reading, previews, SHA-256 hashing, manifest generation, ZIP creation, download, and package verification happen in the browser.
- Creation first attempts a direct RFC 3161 request to `https://freetsa.org/tsr`.
- If browser CORS/network rules block that request, `/api/timestamp` is a stateless Cloudflare Pages Function that accepts only a bounded `application/timestamp-query` request and forwards only that request to FreeTSA.
- The relay does not accept original files, filenames, labels, manifests, previews, or ZIP packages and does not intentionally retain request/response bodies.
- Cloudflare and FreeTSA may still process ordinary network metadata.

## Trust policy (v1)

Creation and in-app verification require all of the following:

1. RFC 3161 response status is granted or granted-with-mods.
2. SHA-256 is used for the message imprint.
3. The response imprint equals the request imprint and the SHA-256 of the exact `proof/proof.json` bytes.
4. The response nonce equals the request nonce.
5. The signing certificate is the current FreeTSA timestamp signer, pinned by its DER SHA-256 certificate fingerprint: `32e841a95cc1164101ffde41298ef2fc75c1c4372ef095e88a6bbd47dfb191fc`. That fingerprint was derived from FreeTSA's current `tsa.crt`; the source PEM is independently tied to FreeTSA's published file SHA-256 `8bfb0305bb64e2571ca507552ef3245cb1c2fee8728e0ff8689225081ea13467`.
6. The signing certificate is valid at the RFC 3161 signed time and has a critical timestamping EKU.
7. PKI.js verifies the CMS/RFC 3161 signature. The independently pinned signer certificate is the v1 trust anchor; no certificate from the uploaded ZIP is trusted merely because it is bundled there.

The app deliberately does **not** trust a certificate merely because it appears inside a proof ZIP.

### Historical certificates and revocation

V1 verifies proofs made with the current FreeTSA signer introduced in 2026. Older FreeTSA signer certificates are not silently accepted. Supporting an older signer requires adding that signer to the explicit trust policy with an independently established pin.

Online OCSP/CRL revocation checking is **not implemented in v1** and is not claimed. The app checks the pinned signer, signature, signed-time certificate validity, timestamping EKU, digest, and nonce. If any required check is unavailable or fails, verification is not reported as successful.

A downloaded package remains independently inspectable without a ProofStamp account or database. `VERIFY.txt` explains OpenSSL verification and makes clear that users should obtain trust certificates independently from FreeTSA rather than trusting bundled copies.

## Package format

A package contains:

```text
original/...
proof/proof.json
proof/timestamp.tsq
proof/timestamp.tsr
certificates/freetsa-tsa.crt
ProofStamp.txt
VERIFY.txt
```

Original entries use ZIP `STORE` mode so the application does not transcode or alter their bytes.

Current limits are 12 files, 75 MiB per file, and 250 MiB total. These are conservative v1 limits and should be revisited after physical-device memory testing.

## Cloudflare Pages configuration

This repository is configured for:

- Node: `22` (`.nvmrc`)
- Install: `npm install`
- Build command: `npm run build`
- Build output directory: `dist`
- Pages Functions: `functions/`
- Wrangler config: `wrangler.toml`
- No environment variables or storage bindings required

Useful checks:

```bash
npm install
npm run check
npx wrangler pages functions build --outdir .wrangler/functions-build
```

Local full-stack Pages testing after the build:

```bash
npx wrangler pages dev dist
```

Do not deploy production as part of implementation review.

## Independent RFC 3161 check

`scripts/live-rfc3161.sh` creates a real timestamp for a small synthetic fixture, downloads FreeTSA's current public certificates directly, and verifies the `.tsq` / `.tsr` pair with OpenSSL. CI runs it so the external path is tested separately from browser package verification.

FreeTSA itself documents the same OpenSSL verification model. The `.tsq` / `.tsr` pair proves the timestamped manifest. Complete ProofStamp verification must additionally hash and check every original listed by `proof/proof.json`.

## Development status

This is a first implementation. Before production use, complete physical-phone testing near the configured size limits, capture a real browser network trace on a Cloudflare Pages preview, and review revocation/historical-signer policy.
