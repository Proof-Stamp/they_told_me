import { afterEach, describe, expect, it, vi } from "vitest";
import { reportCreationStage, subscribeCreationProgress, type CreationStage } from "../src/lib/creation-progress";
import { buildManifest } from "../src/lib/manifest";
import { createTimestampEvidence } from "../src/lib/timestamp";

afterEach(() => vi.unstubAllGlobals());

describe("creation progress", () => {
  it("reports file hashing when manifest creation begins", async () => {
    const stages: CreationStage[] = [];
    const unsubscribe = subscribeCreationProgress((stage) => stages.push(stage));
    try {
      await buildManifest(
        [{ id: crypto.randomUUID(), file: new File(["record"], "call.txt", { type: "text/plain" }) }],
        "",
      );
    } finally {
      unsubscribe();
    }
    expect(stages).toEqual(["hashing-files"]);
  });

  it("reports timestamp request and verification before rejecting a malformed response", async () => {
    const stages: CreationStage[] = [];
    const unsubscribe = subscribeCreationProgress((stage) => stages.push(stage));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })));
    try {
      await expect(createTimestampEvidence(new TextEncoder().encode("manifest"))).rejects.toThrow();
    } finally {
      unsubscribe();
    }
    expect(stages).toEqual(["getting-signed-time", "checking-signed-time"]);
  });

  it("can report the package-building stage without carrying file data", () => {
    const stages: CreationStage[] = [];
    const unsubscribe = subscribeCreationProgress((stage) => stages.push(stage));
    try {
      reportCreationStage("building-package");
    } finally {
      unsubscribe();
    }
    expect(stages).toEqual(["building-package"]);
  });
});
