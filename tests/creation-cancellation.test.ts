import { describe, expect, it, vi } from "vitest";
import type { SelectedFile, TimestampVerification } from "../src/lib/model";
import { createProofPackage, type CreateProofDependencies } from "../src/lib/package";

function selection(): SelectedFile[] {
  return [{ id: crypto.randomUUID(), file: new File(["recording"], "call.m4a", { type: "audio/mp4" }) }];
}

function verification(): TimestampVerification {
  return {
    signedTime: new Date("2026-09-15T12:00:00Z"),
    tsaCertificatePem: "tsa",
    caCertificatePem: "ca",
    tsaFingerprint: "a".repeat(64),
    caFingerprint: "b".repeat(64),
    policyOid: "1.2.3.4",
    serialNumberHex: "01",
    revocationChecked: false,
  };
}

function timestampEvidence() {
  return {
    request: new Uint8Array([1]),
    response: new Uint8Array([2]),
    verification: verification(),
    transport: "relay" as const,
  };
}

describe("ProofStamp creation cancellation", () => {
  it("discards an operation cancelled immediately after the timestamp stage", async () => {
    const controller = new AbortController();
    const buildPackageBlob = vi.fn(async () => new Blob(["should not run"]));
    const dependencies: CreateProofDependencies = {
      createTimestampEvidence: async () => {
        controller.abort();
        return timestampEvidence();
      },
      buildPackageBlob,
    };

    await expect(createProofPackage(selection(), "label", controller.signal, dependencies)).rejects.toMatchObject({ name: "AbortError" });
    expect(buildPackageBlob).not.toHaveBeenCalled();
  });

  it("discards an operation cancelled immediately before completion", async () => {
    const controller = new AbortController();
    const dependencies: CreateProofDependencies = {
      createTimestampEvidence: async () => timestampEvidence(),
      buildPackageBlob: async () => {
        controller.abort();
        return new Blob(["completed bytes"]);
      },
    };

    await expect(createProofPackage(selection(), "label", controller.signal, dependencies)).rejects.toMatchObject({ name: "AbortError" });
  });
});
