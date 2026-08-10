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
  const [failureClass, setFailureClass] = useState("UNKNOWN");
  const [wrongNetwork, setWrongNetwork] = useState(false);

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
      } catch (error) {
        if (active && error instanceof Error && error.message === "SG5_WRONG_NETWORK_REFUSED") setWrongNetwork(true);
        else if (active) {
          const name = error instanceof Error && /^[A-Za-z][A-Za-z0-9_]*Error$/u.test(error.name) ? error.name : "UNKNOWN";
          setFailureClass(name);
          console.info(`SG5_FAILURE_CLASS:${name}`);
          setFailure(true);
        }
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
      <p data-testid="sg5-banner">Internal SG-5 capability route. The automated test wallet is isolated from the frontend.</p>
      <p data-testid="sg5-mode">{mode}</p>
      {wrongNetwork ? <p data-testid="sg5-wrong-network-refused">WRONG_NETWORK_REFUSED</p> : null}
      {wrongNetwork ? <p data-testid="sg5-no-transaction">NO_TRANSACTION_ATTEMPTED</p> : null}
      {failure ? <p data-testid="sg5-failure">SANITIZED_PROBE_FAILURE</p> : null}
      {failure ? <p data-testid="sg5-failure-class">{failureClass}</p> : null}
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
