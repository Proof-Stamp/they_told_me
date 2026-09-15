# Cloudflare Pages configuration

This project is designed for Cloudflare Pages with a single Pages Function for RFC 3161 transport. It has no database, KV, Durable Object, R2 bucket, account system, or storage binding.

## Build settings

Use these repository settings for a Pages project:

```text
Root directory:          repository root
Install command:         npm install
Build command:           npm run build
Build output directory:  dist
Functions directory:     functions
Environment variables:   none
```

`npm run build` runs TypeScript checking and then Vite. Vite emits the static site into `dist`.

The Pages Function source is `functions/api/timestamp.ts`, which maps to `/api/timestamp`. It is intentionally stateless and restricted to bounded RFC 3161 timestamp-query POST requests forwarded to the fixed FreeTSA endpoint.

## Local Pages runtime

After dependencies are installed:

```bash
npm run build
npm run pages:dev
```

That runs `wrangler pages dev dist`, serving the static `dist` output together with the repository's `functions/` routes.

For an additional build-only check of the Functions bundle:

```bash
npx wrangler pages functions build functions --outfile .tmp/pages-worker.js
```

The CI workflow runs this command without deploying anything.

## Project name and production domain

A Cloudflare Pages project name and production domain are intentionally not hard-coded here because they have not been established by this repository. Add or download a Wrangler configuration only after the real Pages project exists, rather than inventing production settings.

## Network behavior

Creation posts one small RFC 3161 timestamp query to the same-origin `/api/timestamp` route. The Pages Function forwards only that query to the fixed FreeTSA endpoint. Original file bytes, filenames, labels, previews, the manifest, and the ZIP are not sent by the application.

The browser Content Security Policy restricts `connect-src` to the app's own origin, so the client does not make direct requests to FreeTSA or another external service. Cloudflare and FreeTSA can still observe normal network metadata associated with the relay request and its upstream request. The Function code does not log or persist request/response bodies, but platform-level request metadata and operational logging are governed by the hosting/provider configuration.

## Deployment boundary

This repository prepares and tests build output. Production deployment is intentionally outside the implementation task. Do not run `wrangler pages deploy` as part of routine tests.
