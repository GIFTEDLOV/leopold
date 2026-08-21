import refreeze from "../../../evidence/closure/LEOPOLD_P01_REFREEZE.json";

export const productionRelease = {
  manifestSha256: refreeze.digests.manifestSha256,
  freezeSha256: refreeze.digests.contractFreezeSha256,
  freezeStatus: "ACTIVE" as const,
  p01Status: refreeze.security.p01Status,
  unresolvedCritical: refreeze.security.unresolvedCritical,
  unresolvedHigh: refreeze.security.unresolvedHigh,
  unresolvedMedium: refreeze.security.unresolvedMedium,
  runtimeBytes: refreeze.runtime.leopoldVaultBytes,
  eip170Headroom: refreeze.runtime.eip170Headroom,
  runtimeSha256: refreeze.runtime.normalizedRuntimeSha256,
  registry: refreeze.currentSuite.registry,
  lcUsdc: refreeze.external.reusedLeopoldConfidentialUsdc,
  vaults: refreeze.currentSuite.vaults,
} as const;
