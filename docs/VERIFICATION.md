# Timestamp trust and independent verification

They Told Me v1 uses FreeTSA and RFC 3161. The timestamp authority receives a SHA-256 digest of the exact saved manifest bytes, not the original recordings, screenshots, filenames, labels, or manifest content.

## Browser verification policy

A timestamp is accepted only when all of these checks pass:

- the RFC 3161 response status is granted or granted-with-modifications;
- the request and response use SHA-256 for the message imprint;
- SHA-256 of the exact `proof/proof.json` bytes equals the request imprint;
- the response imprint equals the request imprint;
- the response returns the request nonce;
- a requested policy OID, if present, is unchanged;
- the signed time parses correctly;
- the embedded TSA and root certificates match FreeTSA's independently published SHA-256 certificate fingerprints pinned in the app source;
- the TSA and root certificates were valid at the signed time;
- the TSA certificate contains the time-stamping extended-key-usage OID;
- the root self-signature is valid and the TSA certificate is signed by that root;
- the CMS timestamp signature and certificate chain verify at the signed time; and
- the actual CMS signer certificate is the pinned FreeTSA TSA certificate.

The pins currently configured for the FreeTSA certificate set published in March 2026 are:

```text
TSA SHA-256  8bfb0305bb64e2571ca507552ef3245cb1c2fee8728e0ff8689225081ea13467
Root SHA-256 2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438
```

A FreeTSA certificate rotation therefore fails closed until the application is reviewed and its pins are deliberately updated.

## Revocation

The v1 browser verifier does **not** perform OCSP or CRL revocation checks. This is disclosed in successful results and in `VERIFY.txt`. FreeTSA publishes online OCSP/CRL information, so an independent verifier can add a current revocation check when connectivity is available.

Revocation is not silently treated as checked. In v1, its absence does not change a result to failure; the result means the listed cryptographic, pinning, chain, and historical-validity checks passed **without a revocation check**.

## What can be checked offline

After a package has been downloaded, the app can verify the original-file hashes, exact manifest digest, timestamp signature, pinned certificate identities, certificate signatures, certificate validity at the signed time, and request/response nonce without contacting ProofStamp or FreeTSA.

An online service is needed only for a fresh revocation-status check or to obtain a new timestamp.

## Independent OpenSSL verification

Extract the ZIP and first verify the saved query/response pair:

```bash
openssl ts -verify \
  -in proof/timestamp.tsr \
  -queryfile proof/timestamp.tsq \
  -CAfile certificates/freetsa-root.pem \
  -untrusted certificates/freetsa-tsa.pem
```

Then verify the signed timestamp against the exact manifest bytes:

```bash
openssl ts -verify \
  -in proof/timestamp.tsr \
  -data proof/proof.json \
  -CAfile certificates/freetsa-root.pem \
  -untrusted certificates/freetsa-tsa.pem
```

Both should report `Verification: OK` for an intact package.

These commands do not by themselves prove that every file under `original/` matches the manifest. Hash each original and compare its digest with the exact path and SHA-256 value in `proof/proof.json`.

Do not establish trust in the certificate merely because it came from the ZIP. Compare the certificate fingerprints with the fingerprints independently published by FreeTSA at <https://www.freetsa.org/index_en.php>.
