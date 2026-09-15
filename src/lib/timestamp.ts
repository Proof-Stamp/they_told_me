import * as asn1js from "asn1js";
import {
  Certificate,
  ContentInfo,
  ExtKeyUsage,
  MessageImprint,
  SignedData,
  TimeStampReq,
  TimeStampResp,
  TSTInfo,
} from "pkijs";
import {
  FREETSA_CA_SHA256,
  FREETSA_TSA_SHA256,
  HASH_OID_SHA256,
  TIMESTAMPING_EKU,
  TSTINFO_CONTENT_TYPE,
} from "./constants";
import { bytesToHex, equalBytes, sha256Bytes, sha256Hex } from "./hash";
import type { TimestampVerification } from "./model";

export interface TimestampEvidence {
  request: Uint8Array;
  response: Uint8Array;
  verification: TimestampVerification;
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function integerBytes(value: asn1js.Integer): Uint8Array {
  return new Uint8Array(value.valueBlock.valueHexView);
}

function certDer(cert: Certificate): Uint8Array {
  return new Uint8Array(cert.toSchema(true).toBER(false));
}

export function derToPem(der: Uint8Array, label = "CERTIFICATE"): string {
  let binary = "";
  for (const byte of der) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`;
}

export async function createTimestampRequest(data: Uint8Array): Promise<Uint8Array> {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  nonceBytes[0] &= 0x7f;
  if (nonceBytes.every((byte) => byte === 0)) nonceBytes[nonceBytes.length - 1] = 1;

  const request = new TimeStampReq({
    version: 1,
    messageImprint: await MessageImprint.create("SHA-256", asArrayBuffer(data)),
    certReq: true,
    nonce: new asn1js.Integer({ valueHex: nonceBytes.buffer }),
  });
  return new Uint8Array(request.toSchema().toBER(false));
}

async function postTimestamp(url: string, request: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/timestamp-query",
      Accept: "application/timestamp-reply, application/octet-stream",
    },
    body: asArrayBuffer(request),
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!response.ok) throw new Error(`Timestamp service returned HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("Timestamp service returned an empty response.");
  return bytes;
}

export async function requestFreeTsaTimestamp(request: Uint8Array, signal?: AbortSignal): Promise<{ bytes: Uint8Array; transport: "direct" | "relay" }> {
  try {
    return { bytes: await postTimestamp("/api/timestamp", request, signal), transport: "relay" };
  } catch (relayError) {
    if (signal?.aborted) throw relayError;
    throw new Error("Could not reach the timestamp authority through the ProofStamp relay.", { cause: relayError });
  }
}

function parseSignedData(response: TimeStampResp): SignedData {
  if (!response.timeStampToken) throw new Error("Timestamp response did not include a signed token.");
  if (response.timeStampToken.contentType !== ContentInfo.SIGNED_DATA) throw new Error("Timestamp token is not CMS SignedData.");
  return new SignedData({ schema: response.timeStampToken.content });
}

function parseTstInfo(signedData: SignedData): TSTInfo {
  if (signedData.encapContentInfo.eContentType !== TSTINFO_CONTENT_TYPE) throw new Error("Timestamp token has the wrong content type.");
  const content = signedData.encapContentInfo.eContent;
  if (!(content instanceof asn1js.OctetString)) throw new Error("Timestamp token is missing TSTInfo content.");
  return TSTInfo.fromBER(content.getValue());
}

async function fingerprint(cert: Certificate): Promise<string> {
  return sha256Hex(certDer(cert));
}

function certificateValidAt(cert: Certificate, when: Date): boolean {
  return cert.notBefore.value.getTime() <= when.getTime() && when.getTime() <= cert.notAfter.value.getTime();
}

function requireTimestampingEku(cert: Certificate): void {
  const ekuExtension = cert.extensions?.find((extension) => extension.extnID === "2.5.29.37");
  if (!ekuExtension || !(ekuExtension.parsedValue instanceof ExtKeyUsage)) {
    throw new Error("Timestamp signer certificate has no readable extended-key-usage extension.");
  }
  if (!ekuExtension.parsedValue.keyPurposes.includes(TIMESTAMPING_EKU)) {
    throw new Error("Timestamp signer certificate is not authorized for timestamping.");
  }
}

async function locatePinnedCertificates(signedData: SignedData): Promise<{ tsa: Certificate; ca: Certificate }> {
  const certificates = (signedData.certificates ?? []).filter((item): item is Certificate => item instanceof Certificate);
  const observed: string[] = [];
  let tsa: Certificate | undefined;
  let ca: Certificate | undefined;

  for (const cert of certificates) {
    const sha = await fingerprint(cert);
    observed.push(sha);
    if (sha === FREETSA_TSA_SHA256) tsa = cert;
    if (sha === FREETSA_CA_SHA256) ca = cert;
  }
  const observedText = observed.length ? observed.join(", ") : "none";
  if (!tsa) throw new Error(`Timestamp signer certificate does not match the expected FreeTSA certificate. Observed SHA-256: ${observedText}.`);
  if (!ca) throw new Error(`Timestamp root certificate does not match the expected FreeTSA root. Observed SHA-256: ${observedText}.`);
  return { tsa, ca };
}

export async function verifyTimestamp(data: Uint8Array, requestBytes: Uint8Array, responseBytes: Uint8Array): Promise<TimestampVerification> {
  const request = TimeStampReq.fromBER(asArrayBuffer(requestBytes));
  const response = TimeStampResp.fromBER(asArrayBuffer(responseBytes));

  if (request.version !== 1) throw new Error("Unsupported timestamp request version.");
  if (request.messageImprint.hashAlgorithm.algorithmId !== HASH_OID_SHA256) throw new Error("Timestamp request did not use SHA-256.");
  if (response.status.status !== 0 && response.status.status !== 1) {
    throw new Error(`Timestamp authority rejected the request with status ${response.status.status}.`);
  }

  const signedData = parseSignedData(response);
  const tstInfo = parseTstInfo(signedData);
  const signedTime = tstInfo.genTime;
  if (!(signedTime instanceof Date) || Number.isNaN(signedTime.getTime())) throw new Error("Timestamp contains an invalid signed time.");
  if (tstInfo.version !== 1) throw new Error("Unsupported TSTInfo version.");
  if (tstInfo.messageImprint.hashAlgorithm.algorithmId !== HASH_OID_SHA256) throw new Error("Timestamp response did not use SHA-256.");

  const dataDigest = await sha256Bytes(data);
  const requestDigest = new Uint8Array(request.messageImprint.hashedMessage.getValue());
  const responseDigest = new Uint8Array(tstInfo.messageImprint.hashedMessage.getValue());
  if (!equalBytes(dataDigest, requestDigest)) throw new Error("Timestamp request does not match the exact manifest bytes.");
  if (!equalBytes(requestDigest, responseDigest)) throw new Error("Timestamp response digest does not match the request.");

  if (request.nonce) {
    if (!tstInfo.nonce) throw new Error("Timestamp response omitted the request nonce.");
    if (!equalBytes(integerBytes(request.nonce), integerBytes(tstInfo.nonce))) throw new Error("Timestamp response nonce does not match the request.");
  }
  if (request.reqPolicy && request.reqPolicy !== tstInfo.policy) throw new Error("Timestamp response policy does not match the request.");

  const { tsa, ca } = await locatePinnedCertificates(signedData);
  if (!certificateValidAt(tsa, signedTime) || !certificateValidAt(ca, signedTime)) {
    throw new Error("FreeTSA certificate was not valid at the signed timestamp time.");
  }
  requireTimestampingEku(tsa);
  if (!(await ca.verify(ca))) throw new Error("Pinned FreeTSA root certificate self-signature is invalid.");
  if (!(await tsa.verify(ca))) throw new Error("FreeTSA timestamp certificate is not signed by the pinned root.");

  const cmsResult = await signedData.verify({
    signer: 0,
    data: asArrayBuffer(data),
    checkChain: true,
    checkDate: signedTime,
    trustedCerts: [ca],
    extendedMode: true,
  });
  if (!cmsResult.signatureVerified || !cmsResult.signerCertificateVerified || !cmsResult.signerCertificate) {
    throw new Error("Timestamp CMS signature or certificate chain could not be verified.");
  }
  if ((await fingerprint(cmsResult.signerCertificate)) !== FREETSA_TSA_SHA256) {
    throw new Error("The timestamp was signed by an unexpected certificate.");
  }

  return {
    signedTime,
    tsaCertificatePem: derToPem(certDer(tsa)),
    caCertificatePem: derToPem(certDer(ca)),
    tsaFingerprint: FREETSA_TSA_SHA256,
    caFingerprint: FREETSA_CA_SHA256,
    policyOid: tstInfo.policy,
    serialNumberHex: bytesToHex(integerBytes(tstInfo.serialNumber)),
    revocationChecked: false,
  };
}

export async function createTimestampEvidence(data: Uint8Array, signal?: AbortSignal): Promise<TimestampEvidence & { transport: "direct" | "relay" }> {
  const request = await createTimestampRequest(data);
  const result = await requestFreeTsaTimestamp(request, signal);
  const verification = await verifyTimestamp(data, request, result.bytes);
  return { request, response: result.bytes, verification, transport: result.transport };
}
