export type AuthHydrationPhase = "AUTH_INITIALIZING" | "READY";

/**
 * Browser-backed Dynamic state is deliberately ignored until the mounted
 * client has initialized. This is also the single gate used by financial UI.
 */
export function getAuthHydrationPhase(clientReady: boolean): AuthHydrationPhase {
  return clientReady ? "READY" : "AUTH_INITIALIZING";
}

export function financialControlsEnabled(clientReady: boolean, authorized: boolean): boolean {
  return clientReady && authorized;
}

export function addMoneyButtonDisabled(clientReady: boolean, authenticated: boolean, fixture: boolean): boolean {
  return !clientReady || (!authenticated && !fixture);
}
