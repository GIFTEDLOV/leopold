"use client";

import type { ZamaSDK } from "@zama-fhe/sdk";
import type { ZamaProviderProps } from "@zama-fhe/react-sdk";

type CompatibilityProbe = {
  sdk: ZamaSDK | null;
  providerProps: ZamaProviderProps | null;
};

const probe: CompatibilityProbe = {
  sdk: null,
  providerProps: null,
};

export function ZamaImportProbe() {
  return <p data-testid="zama-import-probe">Zama SDK type imports compiled: {String(probe.sdk === null)}</p>;
}
