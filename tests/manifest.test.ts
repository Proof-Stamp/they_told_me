import { describe, expect, it } from "vitest";
import { buildManifest, parseManifest } from "../src/lib/manifest";

function file(name: string, body: string) { return new File([body], name, { type: "text/plain" }); }

describe("manifest", () => {
  it("keeps duplicate filenames distinct and preserves selection order", async () => {
    const { manifest, bytes } = await buildManifest([file("chat.png", "one"), file("chat.png", "two")], "Support call");
    expect(manifest.files[0].path).not.toBe(manifest.files[1].path);
    expect(manifest.files.map((f) => f.order)).toEqual([1, 2]);
    expect(parseManifest(bytes).label).toBe("Support call");
  });

  it("allows repeated contents as separate originals", async () => {
    const { manifest } = await buildManifest([file("a.txt", "same"), file("b.txt", "same")], "");
    expect(manifest.files[0].sha256).toBe(manifest.files[1].sha256);
    expect(manifest.files[0].path).not.toBe(manifest.files[1].path);
  });
});
