export const STABLE_PRODUCTION_HOSTNAME = "they-told-me.proofstamp.org";

export function isStableProductionHostname(hostname: string): boolean {
  return hostname === STABLE_PRODUCTION_HOSTNAME;
}
