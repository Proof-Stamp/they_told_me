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
- the embedded TSA and root certificates match the exact DER-certificate SHA-256 fingerprints pinned in the app source;
- the TSA and root certificates were valid at the signed time;
- the TSA certificate contains the time-stamping extended-key-usage OID;
- the root self-signature is valid and the TSA certificate is signed by that root;
- the CMS timestamp signature and certificate chain verify at the signed time; and
- the actual CMS signer certificate is the pinned FreeTSA TSA certificate.

FreeTSA publishes the current TSA and CA certificate files and the SHA-256 hashes of those files. The live integration test downloads those files from FreeTSA, checks their published file hashes, parses the certificates, and then checks the DER-certificate fingerprints used by the browser trust policy.

Current values:

```text
FreeTSA-published TSA file SHA-256
8bfb0305bb64e2571ca507552ef3245cb1c2fee8728e0ff8689225081ea13467

FreeTSA-published CA file SHA-256
2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438

Pinned TSA certificate DER SHA-256
32e841a95cc1164101ffde41298ef2fc75c1c4372ef095e88a6bbd47dfb191fc

Pinned root certificate DER SHA-256
a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc
```

A FreeTSA certificate rotation therefore fails closed until the replacement certificate files are independently reviewed and the pins are deliberately updated.

## Revocation

The v1 browser verifier does **not** perform OCSP or CRL revocation checks. This is disclosed in successful results and in `VERIFY.txt`. FreeTSA publishes online OCSP/CRL information, so an independent verifier can add a current revocation check when connectivity is available.

Revocation is not silently treated as checked. In v1, its absence does not change a result to failure; the result means the listed cryptographic, pinning, chain, and historical-validity checks passed **without a revocation check**.

## What can be checked offline

After a package has been downloaded, the app can verify the original-file hashes, exact manifest digest, timestamp signature, pinned certificate identities, certificate signatures, certificate validity at the signed time, and request/response nonce without contacting ProofStamp or FreeTSA.

An online service is needed only for a fresh revocation-status check or to obtain a new timestamp.

## Independent OpenSSL verification

Do not establish certificate trust merely because certificates are included in the ZIP. Obtain the current FreeTSA certificate files independently from FreeTSA and compare their file SHA-256 values with the values FreeTSA publishes on its site.

Then extract the ZIP and verify the saved query/response pair using the independently obtained certificate files:

```bash
openssl ts -verify \
  -in proof/timestamp.tsr \
  -queryfile proof/timestamp.tsq \
  -CAfile cacert.pem \
  -untrusted tsa.crt
```

Then verify the signed timestamp against the exact manifest bytes:

```bash
openssl ts -verify \
  -in proof/timestamp.tsr \
  -data proof/proof.json \
  -CAfile cacert.pem \
  -untrusted tsa.crt
```

Both should report `Verification: OK` for an intact package.

These commands do not by themselves prove that every file under `original/` matches the manifest. Hash each original and compare its digest with the exact path and SHA-256 value in `proof/proof.json`.
