import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Content Security Policy", () => {
  it("allows same-origin blob workers used by zip.js", async () => {
    const headers = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
    expect(headers).toContain("worker-src 'self' blob:");
  });
});
