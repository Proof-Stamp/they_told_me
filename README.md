# They Told Me by ProofStamp

A browser-first web app for keeping independently verifiable copies of customer-service call recordings and chat screenshots.

## What it does

- Reads selected originals in the browser.
- Hashes each original with SHA-256.
- Builds a versioned collection manifest and timestamps the exact saved manifest bytes with RFC 3161 through FreeTSA.
- Downloads one `.proofstamp.zip` containing the originals, manifest, timestamp request/response, signer certificate, readable receipt, and independent verification instructions.
- Verifies the package later without an account or database.

The proof establishes existence and exact-byte integrity by the signed time. It does not prove the conversation's actual date, participants, truth, completeness, or acceptance.

## Privacy and hosting

The app is designed for Cloudflare Pages. There is no database, account system, or remote file store. Original files, filenames, labels, previews, manifests, ZIP creation, and package verification stay in the browser.

The browser first attempts a direct RFC 3161 request to `https://freetsa.org/tsr`. If browser CORS policy blocks that request, it falls back to the same-origin stateless Pages Function at `/api/timestamp`. That function accepts only a small `application/timestamp-query` POST, forwards it to the fixed FreeTSA endpoint, returns the timestamp response, and intentionally does not receive original files or manifests.

Normal network metadata can still be visible to Cloudflare and FreeTSA.

## Timestamp trust policy

Browser verification does **not** trust a certificate simply because it is inside a ProofStamp ZIP.

For v1 the app pins the SHA-256 fingerprint of FreeTSA's published TSA signer certificate:

`8bfb0305bb64e2571ca507552ef3245cb1c2fee8728e0ff8689225081ea13467`

The app validates the timestamp response status, SHA-256 message imprint, request nonce, CMS signature, pinned signer fingerprint, timestamp-only EKU, and the signer's certificate validity at the signed time. Revocation checking is not implemented in v1 and is therefore not reported as performed.

The FreeTSA CA fingerprint published by FreeTSA is recorded for independent verification:

`2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438`

The bundled signer certificate is convenience material only. Independent OpenSSL verification should obtain certificates separately from FreeTSA and confirm their fingerprints.

## Local development

```bash
npm install
npm run dev
```

Checks:

```bash
npm run typecheck
npm test
npm run build
```

## Cloudflare Pages configuration

- Framework preset: Vite / React
- Build command: `npm run build`
- Build output directory: `dist`
- Pages Functions directory: `functions`
- Database: none
- Required application environment variables: none

For local Pages emulation after building:

```bash
npm run build
npm run pages:dev
```

Production deployment is intentionally outside this implementation task.

## Independent OpenSSL verification

Inside an extracted `.proofstamp.zip`, after independently obtaining `cacert.pem` and `tsa.crt` from FreeTSA:

```bash
openssl ts -verify \
  -in proof/timestamp.tsr \
  -queryfile proof/timestamp.tsq \
  -CAfile cacert.pem \
  -untrusted tsa.crt
```

That validates the timestamp request/response pair. It does **not** by itself validate the originals. Complete verification must also hash `proof/proof.json`, compare that digest with the timestamped message imprint, then SHA-256 each file under `original/` and compare it with the manifest.

## Current implementation limits

The current conservative browser limits are 12 files, 50 MiB per file, 150 MiB total originals, and 175 MiB per ProofStamp ZIP. These limits are intentionally conservative until real-browser memory tests, including a physical phone, are completed.
