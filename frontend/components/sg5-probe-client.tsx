"use client";

import { useEffect, useState } from "react";

import { runRealBrowserProbe } from "@/lib/sg5/browser-probe";
import {
  assertSanitizedResult,
  controlledStructuralObservation,
  sanitizeObservation,
  type ProbeExecutionMode,
  type SanitizedProbeResult,
} from "@/lib/sg5/protocol";

type Props = {
  mode: ProbeExecutionMode;
};

export function SG5ProbeClient({ mode }: Props) {
  const [result, setResult] = useState<SanitizedProbeResult | null>(null);
  const [failure, setFailure] = useState(false);

  useEffect(() => {
    let active = true;
    const execute = async () => {
      try {
        const next =
          mode === "LIVE_SEPOLIA"
            ? await runRealBrowserProbe()
            : sanitizeObservation(controlledStructuralObservation(), "OFFLINE_STRUCTURAL", navigator.userAgent);
        assertSanitizedResult(next);
        if (active) setResult(next);
      } catch {
        if (active) setFailure(true);
      }
    };
    void execute();
    return () => {
      active = false;
    };
  }, [mode]);

  return (
    <main style={{ fontFamily: "monospace", margin: "2rem", maxWidth: "72rem" }}>
      <h1>SG-5 local capability probe — non-production</h1>
      <p data-testid="sg5-banner">Test-only route. No wallet, signature, or transaction is requested.</p>
      <p data-testid="sg5-mode">{mode}</p>
      {failure ? <p data-testid="sg5-failure">SANITIZED_PROBE_FAILURE</p> : null}
      {result ? (
        <pre data-testid="sg5-result" data-status={result.status}>
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : (
        <p data-testid="sg5-pending">PROBE_PENDING</p>
      )}
    </main>
  );
}
