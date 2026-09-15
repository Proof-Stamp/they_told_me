import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import { equalBytes, sha256, toHex } from "./bytes";

const SHA256_OID = "2.16.840.1.101.3.4.2.1";
const SIGNED_DATA_OID = "1.2.840.113549.1.7.2";
const TSTINFO_OID = "1.2.840.113549.1.9.16.1.4";
const TIMESTAMP_EKU_OID = "1.3.6.1.5.5.7.3.8";

export const FREETSA_SIGNER_SHA256 = "8bfb0305bb64e2571ca507552ef3245cb1c2fee8728e0ff8689225081ea13467";
export const FREETSA_CA_SHA256 = "2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438";
export const FREETSA_URL = "https://freetsa.org/tsr";

export type TimestampValidation = {
  genTime: Date;
  signerCertificateDer: Uint8Array;
  signerFingerprint: string;
  policyOid: string;
};

function seqChildren(node: asn1js.BaseBlock): asn1js.BaseBlock[] {
  const value = (node as asn1js.Sequence).valueBlock?.value;
  if (!Array.isArray(value)) throw new Error("Invalid ASN.1 sequence.");
  return value as asn1js.BaseBlock[];
}

function integerBytes(node: asn1js.BaseBlock): Uint8Array {
  if (!(node instanceof asn1js.Integer)) throw new Error("Expected ASN.1 integer.");
  return new Uint8Array(node.valueBlock.valueHexView);
}

function octets(node: asn1js.BaseBlock): Uint8Array {
  if (!(node instanceof asn1js.OctetString)) throw new Error("Expected ASN.1 octet string.");
  return new Uint8Array(node.valueBlock.valueHexView);
}

function oid(node: asn1js.BaseBlock): string {
  if (!(node instanceof asn1js.ObjectIdentifier)) throw new Error("Expected ASN.1 object identifier.");
  return node.valueBlock.toString();
}

export function createTimestampRequest(digest: Uint8Array, nonceBytes?: Uint8Array): { bytes: Uint8Array; nonce: Uint8Array } {
  if (digest.length !== 32) throw new Error("SHA-256 digest must be 32 bytes.");
  const nonce = nonceBytes ?? crypto.getRandomValues(new Uint8Array(8));
  nonce[0] &= 0x7f;
  if (nonce.every((b) => b === 0)) nonce[nonce.length - 1] = 1;
  const request = new asn1js.Sequence({
    value: [
      new asn1js.Integer({ value: 1 }),
      new asn1js.Sequence({
        value: [
          new asn1js.Sequence({
            value: [new asn1js.ObjectIdentifier({ value: SHA256_OID }), new asn1js.Null()]
          }),
          new asn1js.OctetString({ valueHex: digest.slice().buffer })
        ]
      }),
      new asn1js.Integer({ valueHex: nonce.slice().buffer }),
      new asn1js.Boolean({ value: true })
    ]
  });
  return { bytes: new Uint8Array(request.toBER(false)), nonce };
}

export function parseTimestampRequest(bytes: Uint8Array): { digest: Uint8Array; nonce: Uint8Array } {
  const parsed = asn1js.fromBER(bytes.slice().buffer);
  if (parsed.offset === -1) throw new Error("The timestamp request is invalid.");
  const c = seqChildren(parsed.result);
  if (!(c[0] instanceof asn1js.Integer) || c[0].valueBlock.valueDec !== 1) throw new Error("Unsupported timestamp request version.");
  const imprint = seqChildren(c[1]);
  const alg = seqChildren(imprint[0]);
  if (oid(alg[0]) !== SHA256_OID) throw new Error("The timestamp request does not use SHA-256.");
  const digest = octets(imprint[1]);
  if (digest.length !== 32) throw new Error("The timestamp request digest length is invalid.");
  const nonceNode = c.find((node, index) => index >= 2 && node instanceof asn1js.Integer) as asn1js.Integer | undefined;
  if (!nonceNode) throw new Error("The timestamp request nonce is missing.");
  return { digest, nonce: integerBytes(nonceNode) };
}

function findSignerCertificate(signedData: pkijs.SignedData): pkijs.Certificate {
  const signer = signedData.signerInfos[0];
  if (!signer) throw new Error("The timestamp token has no signer.");
  if (!(signer.sid instanceof pkijs.IssuerAndSerialNumber)) throw new Error("Unsupported timestamp signer identifier.");
  const certs = (signedData.certificates ?? []).filter((c): c is pkijs.Certificate => c instanceof pkijs.Certificate);
  const match = certs.find((cert) => cert.issuer.isEqual(signer.sid.issuer) && equalBytes(cert.serialNumber.valueBlock.valueHexView, signer.sid.serialNumber.valueBlock.valueHexView));
  if (!match) throw new Error("The timestamp signer certificate is missing.");
  return match;
}

function parseTstInfo(bytes: Uint8Array): { digest: Uint8Array; nonce: Uint8Array; genTime: Date; policyOid: string } {
  const parsed = asn1js.fromBER(bytes.slice().buffer);
  if (parsed.offset === -1) throw new Error("The timestamp token content is invalid.");
  const c = seqChildren(parsed.result);
  if (!(c[0] instanceof asn1js.Integer) || c[0].valueBlock.valueDec !== 1) throw new Error("Unsupported timestamp token version.");
  const policyOid = oid(c[1]);
  const imprint = seqChildren(c[2]);
  const alg = seqChildren(imprint[0]);
  if (oid(alg[0]) !== SHA256_OID) throw new Error("The timestamp token does not use SHA-256.");
  const digest = octets(imprint[1]);
  const genTimeNode = c[4];
  if (!(genTimeNode instanceof asn1js.GeneralizedTime)) throw new Error("The timestamp token has no valid time.");
  const genTime = genTimeNode.toDate();
  const nonceNode = c.find((node, index) => index >= 5 && node instanceof asn1js.Integer) as asn1js.Integer | undefined;
  if (!nonceNode) throw new Error("The timestamp token nonce is missing.");
  return { digest, nonce: integerBytes(nonceNode), genTime, policyOid };
}

function assertTimestampEku(cert: pkijs.Certificate): void {
  const ext = cert.extensions?.find((e) => e.extnID === "2.5.29.37");
  const purposes = (ext?.parsedValue as { keyPurposes?: string[] } | undefined)?.keyPurposes;
  if (!purposes || purposes.length !== 1 || purposes[0] !== TIMESTAMP_EKU_OID) {
    throw new Error("The signer certificate is not restricted to timestamp signing.");
  }
}

export async function validateTimestampResponse(responseBytes: Uint8Array, requestBytes: Uint8Array): Promise<TimestampValidation> {
  const request = parseTimestampRequest(requestBytes);
  const parsed = asn1js.fromBER(responseBytes.slice().buffer);
  if (parsed.offset === -1) throw new Error("The timestamp response is invalid.");
  const response = seqChildren(parsed.result);
  if (response.length < 2) throw new Error("The timestamp response does not contain a signed token.");
  const statusInfo = seqChildren(response[0]);
  const status = statusInfo[0];
  if (!(status instanceof asn1js.Integer) || ![0, 1].includes(status.valueBlock.valueDec)) throw new Error("The timestamp authority did not grant the request.");

  const contentInfo = new pkijs.ContentInfo({ schema: response[1] });
  if (contentInfo.contentType !== SIGNED_DATA_OID) throw new Error("The timestamp response is not CMS SignedData.");
  const signedData = new pkijs.SignedData({ schema: contentInfo.content });
  if (signedData.signerInfos.length !== 1) throw new Error("The timestamp response must contain exactly one signer.");
  if (signedData.encapContentInfo.eContentType !== TSTINFO_OID) throw new Error("The signed content is not RFC 3161 TSTInfo.");
  const eContent = signedData.encapContentInfo.eContent;
  if (!(eContent instanceof asn1js.OctetString)) throw new Error("The timestamp token content is missing.");
  const tstInfoBytes = new Uint8Array(eContent.valueBlock.valueHexView);
  const tst = parseTstInfo(tstInfoBytes);
  if (!equalBytes(tst.digest, request.digest)) throw new Error("The timestamp response digest does not match the request.");
  if (!equalBytes(tst.nonce, request.nonce)) throw new Error("The timestamp response nonce does not match the request.");

  const signerCert = findSignerCertificate(signedData);
  const signerDer = new Uint8Array(signerCert.toSchema(true).toBER(false));
  const signerFingerprint = toHex(await sha256(signerDer));
  if (signerFingerprint !== FREETSA_SIGNER_SHA256) throw new Error("The timestamp signer is not the pinned FreeTSA signer certificate.");
  if (tst.genTime < signerCert.notBefore.value || tst.genTime > signerCert.notAfter.value) throw new Error("The timestamp signer certificate was not valid at the signed time.");
  assertTimestampEku(signerCert);

  const signatureOk = await signedData.verify({ signer: 0, checkChain: false });
  if (!signatureOk) throw new Error("The timestamp signature is invalid.");

  return { genTime: tst.genTime, signerCertificateDer: signerDer, signerFingerprint, policyOid: tst.policyOid };
}

export async function requestTimestamp(tsq: Uint8Array, signal?: AbortSignal): Promise<{ tsr: Uint8Array; transport: "direct" | "relay" }> {
  const send = async (url: string): Promise<Uint8Array> => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/timestamp-query",
        Accept: "application/timestamp-reply"
      },
      body: tsq,
      signal
    });
    if (!response.ok) throw new Error(`Timestamp service returned HTTP ${response.status}.`);
    const type = response.headers.get("content-type") ?? "";
    if (!type.toLowerCase().includes("application/timestamp-reply")) throw new Error("Timestamp service returned an unexpected content type.");
    return new Uint8Array(await response.arrayBuffer());
  };

  try {
    return { tsr: await send(FREETSA_URL), transport: "direct" };
  } catch (directError) {
    if (signal?.aborted) throw directError;
    return { tsr: await send("/api/timestamp"), transport: "relay" };
  }
}
