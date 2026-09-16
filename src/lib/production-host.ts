export const STABLE_PRODUCTION_HOSTNAME = "they-told-me.pages.dev";

export function isStableProductionHostname(hostname: string): boolean {
  return hostname === STABLE_PRODUCTION_HOSTNAME;
}
