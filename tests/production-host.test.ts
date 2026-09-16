import { describe, expect, it } from "vitest";
import { isStableProductionHostname, STABLE_PRODUCTION_HOSTNAME } from "../src/lib/production-host";

describe("stable production hostname", () => {
  it("allows only the stable Cloudflare Pages project hostname", () => {
    expect(isStableProductionHostname(STABLE_PRODUCTION_HOSTNAME)).toBe(true);
  });

  it("rejects temporary and branch preview hostnames", () => {
    expect(isStableProductionHostname("df56dc35.they-told-me.pages.dev")).toBe(false);
    expect(isStableProductionHostname("feat-rfc3161-proofstamp-v1.they-told-me.pages.dev")).toBe(false);
    expect(isStableProductionHostname("localhost")).toBe(false);
  });
});
