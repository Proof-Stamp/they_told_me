export interface ManifestFile {
  order: number;
  path: string;
  originalName: string;
  size: number;
  mediaType: string;
  sha256: string;
}

export interface ProofManifest {
  version: "proofstamp-collection-v1";
  product: "They Told Me by ProofStamp";
  hashAlgorithm: "SHA-256";
  label?: string;
  files: ManifestFile[];
}

export interface SelectedFile {
  id: string;
  file: File;
}

export interface TimestampVerification {
  signedTime: Date;
  tsaCertificatePem: string;
  caCertificatePem: string;
  tsaFingerprint: string;
  caFingerprint: string;
  policyOid: string;
  serialNumberHex: string;
  revocationChecked: false;
}

export interface CreatedProof {
  manifest: ProofManifest;
  manifestBytes: Uint8Array;
  timestampRequest: Uint8Array;
  timestampResponse: Uint8Array;
  timestamp: TimestampVerification;
  packageBlob: Blob;
}

export type VerificationStatus =
  | "verified"
  | "file-mismatch"
  | "package-damaged"
  | "timestamp-unverified";

export interface PackageVerificationResult {
  status: VerificationStatus;
  message: string;
  signedTime?: Date;
  fileCount?: number;
  details?: string[];
}
