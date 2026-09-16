import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES } from "../src/lib/constants";
import { buildManifest, internalPath, parseManifest, safeInternalName, validateSelection } from "../src/lib/manifest";
import type { SelectedFile } from "../src/lib/model";

function selected(name: string, content: string, type = "text/plain"): SelectedFile {
  return { id: crypto.randomUUID(), file: new File([content], name, { type }) };
}

describe("manifest", () => {
  it("keeps duplicate filenames distinct and repeated contents explicit", async () => {
    const input = [selected("chat.png", "same", "image/png"), selected("chat.png", "same", "image/png")];
    const { manifest, bytes } = await buildManifest(input, "  Billing promise  ");

    expect(manifest.files).toHaveLength(2);
    expect(manifest.files[0].path).toBe("original/0001--chat.png");
    expect(manifest.files[1].path).toBe("original/0002--chat.png");
    expect(manifest.files[0].sha256).toBe(manifest.files[1].sha256);
    expect(manifest.label).toBe("Billing promise");
    expect(parseManifest(bytes)).toEqual(manifest);
  });

  it("serializes deterministically for the same ordered inputs", async () => {
    const input = [selected("one.txt", "one"), selected("two.txt", "two")];
    const first = await buildManifest(input, "case");
    const second = await buildManifest(input, "case");
    expect(new TextDecoder().decode(first.bytes)).toBe(new TextDecoder().decode(second.bytes));
  });

  it("normalizes unsafe filenames only for internal archive paths", () => {
    expect(safeInternalName("../call\\name?.m4a")).toBe(".._call_name_.m4a");
    expect(internalPath(7, "../call\\name?.m4a")).toBe("original/0007--.._call_name_.m4a");
  });

  it("hashes a synthetic recording near the per-file limit", async () => {
    const bytes = new Uint8Array(MAX_FILE_BYTES - 1024);
    bytes[0] = 1;
    bytes[bytes.length - 1] = 2;
    const recording: SelectedFile = {
      id: "near-limit",
      file: new File([bytes], "near-limit.m4a", { type: "audio/mp4" }),
    };
    const { manifest } = await buildManifest([recording], "near-limit test");
    expect(manifest.files[0].size).toBe(MAX_FILE_BYTES - 1024);
    expect(manifest.files[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("enforces count, individual, and total limits before processing", () => {
    const tiny = selected("tiny.txt", "x");
    expect(() => validateSelection([])).toThrow(/at least one/i);
    expect(() => validateSelection(Array.from({ length: MAX_FILES + 1 }, () => tiny))).toThrow(/no more than/i);

    const oversized = { name: "large.bin", size: MAX_FILE_BYTES + 1 } as File;
    expect(() => validateSelection([{ id: "large", file: oversized }])).toThrow(/per-file limit/i);

    const perFile = Math.floor(MAX_TOTAL_BYTES / 4) + 1;
    const total = Array.from({ length: 4 }, (_, index) => ({
      id: String(index),
      file: { name: `part-${index}.bin`, size: perFile } as File,
    }));
    expect(() => validateSelection(total)).toThrow(/total size limit/i);
  });
});
