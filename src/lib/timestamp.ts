import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { equalBytes, sha256, toHex } from './bytes';

export const FREETSA_URL = 'https://freetsa.org/tsr';
export const SHA256_OID = '2.16.840.1.101.3.4.2.1';
export const TSTINFO_OID = '1.2.840.113549.1.9.16.1.4';
export const TIMESTAMPING_EKU_OID = '1.3.6.1.5.5.7.3.8';
// DER SHA-256 fingerprint of the current FreeTSA TSA signing certificate. It was
// derived from the FreeTSA-published tsa.crt whose published file SHA-256 is
// 8bfb0305bb64e2571ca507552ef3245cb1c2fee8728e0ff8689225081ea13467.
export const FREETSA_TSA_CERT_SHA256 = '32e841a95cc1164101ffde41298ef2fc75c1c4372ef095e88a6bbd47dfb191fc';

export interface TimestampBundle {
  request: Uint8Array;
  response: Uint8Array;
  signedTime: Date;
  policy: string;
  signerPem: string;
}

function ensureEngine(): void {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.subtle) throw new Error('Web Crypto is unavailable.');
  pkijs.setEngine('proofstamp', webCrypto, new pkijs.CryptoEngine({
    name: 'proofstamp',
    crypto: webCrypto,
    subtle: webCrypto.subtle,
  }));
}

function nonceBytes(): ArrayBuffer {
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  nonce[0] &= 0x7f;
  if (nonce[0] === 0) nonce[0] = 1;
  return nonce.buffer;
}

function derToPem(der: Uint8Array): string {
  let binary = '';
  for (const byte of der) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g)?.join('\n') ?? base64;
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----\n`;
}

export async function createTimestampRequest(data: Uint8Array): Promise<Uint8Array> {
  ensureEngine();
  const digest = await sha256(data);
  const request = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: SHA256_OID }),
      hashedMessage: new asn1js.OctetString({ valueHex: digest.buffer }),
    }),
    nonce: new asn1js.Integer({ valueHex: nonceBytes() }),
    certReq: true,
  });
  return new Uint8Array(request.toSchema().toBER(false));
}

function signedData(response: pkijs.TimeStampResp): pkijs.SignedData {
  if (!response.timeStampToken) throw new Error('Timestamp response contains no signed token.');
  return new pkijs.SignedData({ schema: response.timeStampToken.content });
}

function extractTstInfo(response: pkijs.TimeStampResp): pkijs.TSTInfo {
  const signed = signedData(response);
  if (signed.encapContentInfo.eContentType !== TSTINFO_OID || !signed.encapContentInfo.eContent) {
    throw new Error('Timestamp token does not contain RFC 3161 TSTInfo.');
  }
  const raw = signed.encapContentInfo.eContent.valueBlock.valueHexView.slice().buffer;
  return pkijs.TSTInfo.fromBER(raw);
}

function certsFromResponse(response: pkijs.TimeStampResp): pkijs.Certificate[] {
  return (signedData(response).certificates ?? []).filter((item): item is pkijs.Certificate => item instanceof pkijs.Certificate);
}

function hasTimestampingEku(cert: pkijs.Certificate): boolean {
  const extension = cert.extensions?.find((item) => item.extnID === '2.5.29.37');
  if (!extension || !extension.critical) return false;
  const parsed = asn1js.fromBER(extension.extnValue.valueBlock.valueHexView.slice().buffer);
  if (parsed.offset === -1 || !(parsed.result instanceof asn1js.Sequence)) return false;
  return parsed.result.valueBlock.value.some((item) => item instanceof asn1js.ObjectIdentifier && item.valueBlock.toString() === TIMESTAMPING_EKU_OID);
}

async function pinnedSigner(response: pkijs.TimeStampResp, signedTime: Date): Promise<{ cert: pkijs.Certificate; pem: string }> {
  for (const cert of certsFromResponse(response)) {
    const der = new Uint8Array(cert.toSchema(true).toBER(false));
    const pem = derToPem(der);
    if (toHex(await sha256(der)) !== FREETSA_TSA_CERT_SHA256) continue;
    if (signedTime < cert.notBefore.value || signedTime > cert.notAfter.value) {
      throw new Error('The FreeTSA signer certificate was not valid at the signed time.');
    }
    if (!hasTimestampingEku(cert)) throw new Error('The signer certificate is not restricted to timestamp signing.');
    return { cert, pem };
  }
  throw new Error('Timestamp signer is not the pinned FreeTSA signer certificate.');
}

export async function verifyTimestamp(
  data: Uint8Array,
  requestBytes: Uint8Array,
  responseBytes: Uint8Array,
): Promise<TimestampBundle> {
  ensureEngine();
  const request = pkijs.TimeStampReq.fromBER(requestBytes.slice().buffer);
  const response = pkijs.TimeStampResp.fromBER(responseBytes.slice().buffer);

  if (![0, 1].includes(response.status.status)) throw new Error(`Timestamp authority rejected the request (status ${response.status.status}).`);
  if (!response.timeStampToken) throw new Error('Timestamp authority returned no signed token.');

  const tstInfo = extractTstInfo(response);
  if (request.messageImprint.hashAlgorithm.algorithmId !== SHA256_OID || tstInfo.messageImprint.hashAlgorithm.algorithmId !== SHA256_OID) {
    throw new Error('Timestamp uses an unsupported digest algorithm.');
  }
  if (!equalBytes(request.messageImprint.hashedMessage.valueBlock.valueHexView, tstInfo.messageImprint.hashedMessage.valueBlock.valueHexView)) {
    throw new Error('Timestamp digest does not match the request.');
  }
  const expectedDigest = await sha256(data);
  if (!equalBytes(expectedDigest, tstInfo.messageImprint.hashedMessage.valueBlock.valueHexView)) {
    throw new Error('Timestamp digest does not match the proof manifest.');
  }
  if (!request.nonce || !tstInfo.nonce || !equalBytes(request.nonce.valueBlock.valueHexView, tstInfo.nonce.valueBlock.valueHexView)) {
    throw new Error('Timestamp nonce does not match the request.');
  }

  const signer = await pinnedSigner(response, tstInfo.genTime);
  const verified = await response.verify({
    signer: 0,
    trustedCerts: [signer.cert],
    data: data.slice().buffer,
    checkDate: tstInfo.genTime,
    // The signer certificate itself is the pinned trust anchor for v1.
    // PKI.js still verifies the CMS signature; certificate validity and EKU
    // are checked above at the signed time.
    checkChain: false,
  });
  if (!verified) throw new Error('Timestamp signature could not be verified.');

  return {
    request: requestBytes,
    response: responseBytes,
    signedTime: tstInfo.genTime,
    policy: tstInfo.policy,
    signerPem: signer.pem,
  };
}

export async function requestTimestamp(request: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
  const headers = { 'Content-Type': 'application/timestamp-query', Accept: 'application/timestamp-reply' };
  try {
    const direct = await fetch(FREETSA_URL, { method: 'POST', headers, body: request, signal });
    if (direct.ok) return new Uint8Array(await direct.arrayBuffer());
  } catch {
    // CORS/network failure: use the tightly scoped same-origin relay.
  }
  const relayed = await fetch('/api/timestamp', { method: 'POST', headers, body: request, signal });
  if (!relayed.ok) throw new Error('The timestamp service is unavailable. Try again.');
  return new Uint8Array(await relayed.arrayBuffer());
}
