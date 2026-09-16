import { BlobReader, TextWriter, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";
import { buildStoredZip } from "../src/lib/store-zip";

describe("stored ZIP writer", () => {
  it("creates a standards-compatible uncompressed archive without zip.js writing", async () => {
    const original = new Blob(["original bytes"], { type: "text/plain" });
    const proof = new TextEncoder().encode('{"version":1}\n');
    const archive = await buildStoredZip([
      { name: "original/0001--note.txt", data: original },
      { name: "proof/proof.json", data: proof },
    ]);

    const reader = new ZipReader(new BlobReader(archive), {
      strictness: "strict",
      checkCrc32: true,
      checkOverlappingEntry: true,
    });
    try {
      const entries = await reader.getEntries({ strictness: "strict" });
      expect(entries.map((entry) => entry.filename)).toEqual([
        "original/0001--note.txt",
        "proof/proof.json",
      ]);
      expect(entries.every((entry) => entry.compressionMethod === 0)).toBe(true);
      if (entries[0].directory || entries[1].directory) throw new Error("Expected file entries.");

      const originalBytes = await entries[0].getData(new Uint8ArrayWriter(), { checkCrc32: true });
      expect(new TextDecoder().decode(originalBytes)).toBe("original bytes");
      const proofText = await entries[1].getData(new TextWriter(), { checkCrc32: true });
      expect(proofText).toBe('{"version":1}\n');
    } finally {
      await reader.close();
    }
  });

  it("honors cancellation before packaging", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(buildStoredZip([{ name: "a.txt", data: new Blob(["a"]) }], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
