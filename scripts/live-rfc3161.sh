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
curl --silent --show-error -D "$work/options-headers.txt" -o /dev/null -X OPTIONS \
  -H 'Origin: https://example.pages.dev' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  https://freetsa.org/tsr || true
if grep -qi '^access-control-allow-origin:' "$work/headers.txt" "$work/options-headers.txt"; then
  echo 'FreeTSA exposed an Access-Control-Allow-Origin header; re-check whether the relay is still necessary.'
  grep -i '^access-control-allow-origin:' "$work/headers.txt" "$work/options-headers.txt" || true
else
  echo 'FreeTSA POST and preflight responses did not expose Access-Control-Allow-Origin; cross-origin browser use requires the same-origin relay.'
fi
