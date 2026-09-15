#!/usr/bin/env bash
set -euo pipefail
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
openssl ts -query -data test-fixtures/synthetic.txt -sha256 -cert -out "$work/synthetic.tsq"
curl --fail --silent --show-error -D "$work/headers.txt" \
  -H 'Content-Type: application/timestamp-query' \
  --data-binary @"$work/synthetic.tsq" \
  https://freetsa.org/tsr > "$work/synthetic.tsr"
curl --fail --silent --show-error https://freetsa.org/files/tsa.crt > "$work/tsa.crt"
curl --fail --silent --show-error https://freetsa.org/files/cacert.pem > "$work/cacert.pem"
openssl ts -verify -in "$work/synthetic.tsr" -queryfile "$work/synthetic.tsq" -CAfile "$work/cacert.pem" -untrusted "$work/tsa.crt"
openssl ts -reply -in "$work/synthetic.tsr" -text | sed -n '1,28p'
if grep -qi '^access-control-allow-origin:' "$work/headers.txt"; then
  echo 'FreeTSA response includes Access-Control-Allow-Origin:'
  grep -i '^access-control-allow-origin:' "$work/headers.txt"
else
  echo 'FreeTSA response did not include Access-Control-Allow-Origin; a normal cross-origin browser fetch is expected to be blocked by CORS.'
fi
