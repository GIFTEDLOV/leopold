import { notFound } from "next/navigation";

import { SG5ProbeClient } from "@/components/sg5-probe-client";
import {
  SG5_DYNAMIC_ASSET_ORIGINS_RESOLVED,
  liveModeAcknowledged,
  probeRouteEnabled,
  type ProbeExecutionMode,
} from "@/lib/sg5/protocol";

export default function SG5ProbePage() {
  if (!probeRouteEnabled(process.env.NODE_ENV, process.env.SG5_PROBE_PAGE, process.env.SG5_PROBE_PRODUCTION)) {
    notFound();
  }

  const liveRequested = liveModeAcknowledged(process.env.SG5_LIVE_ACK);
  if (liveRequested && !SG5_DYNAMIC_ASSET_ORIGINS_RESOLVED) notFound();
  const mode: ProbeExecutionMode = liveRequested ? "LIVE_SEPOLIA" : "OFFLINE_STRUCTURAL";
  const connectSources =
    mode === "LIVE_SEPOLIA"
      ? "'self' https://relayer.testnet.zama.org https://ethereum-sepolia-rpc.publicnode.com https://zama-mpc-testnet-public-efd88e2b.s3.eu-west-1.amazonaws.com"
      : "'self'";

  return (
    <>
      <meta
        httpEquiv="Content-Security-Policy"
        content={`default-src 'self'; connect-src ${connectSources}; img-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; base-uri 'none'; form-action 'none'`}
      />
      <SG5ProbeClient mode={mode} />
    </>
  );
}
