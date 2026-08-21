import Link from "next/link";

import { getPublicHealth, type HealthCheck, type HealthState } from "@/lib/ops/health";

export const dynamic = "force-dynamic";

const stateLabels: Record<HealthState, string> = {
  HEALTHY: "Operational",
  DEGRADED: "Degraded",
  UNAVAILABLE: "Unavailable",
  UNKNOWN: "Unknown",
};

function Status({ check }: { check: HealthCheck }) {
  return (
    <>
      <span className="badge neutral">{stateLabels[check.state]}</span>
      <span className="subtle">{check.durationMs} ms</span>
    </>
  );
}

function publicAddress(address: string | null) {
  return address ?? "Not configured";
}

export default async function OpsPage() {
  const health = await getPublicHealth();
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">L</span>Leopold Ops
        </Link>
        <Link href="/app">Back to app</Link>
      </nav>
      <section className="how" style={{ borderTop: 0 }}>
        <div className="how-inner">
          <span className="eyebrow">Public operational status</span>
          <h2>Leopold Protocol Status</h2>
          <p className="subtle">
            Overall service: {stateLabels[health.state]} · checked {health.checkedAt}
          </p>
          <p>
            <strong>Service availability does not affect ownership of funds held by the protocol.</strong>
          </p>

          <div className="grid two section">
            <article className="card">
              <div className="list-row">
                <h3>Network</h3>
                <Status check={health.network} />
              </div>
              <div className="config-list">
                Ethereum Sepolia
                <br />
                chain ID: {health.network.chainId}
                <br />
                RPC: {health.network.message}
                <br />
                latest block: {health.network.latestBlock ?? "Unavailable"}
                <br />
                block freshness:{" "}
                {health.network.blockAgeSeconds === null ? "Unavailable" : `${health.network.blockAgeSeconds}s old`}
              </div>
            </article>
            <article className="card">
              <div className="list-row">
                <h3>Confidential Infrastructure</h3>
                <Status check={health.zama} />
              </div>
              <div className="config-list">
                Zama: {health.zama.message}
                <br />
                readiness signal: public encryption-key metadata
                <br />
                No decryption, wallet signature, or transaction is used by this check.
              </div>
            </article>
            <article className="card">
              <div className="list-row">
                <h3>Authentication</h3>
                <Status check={health.dynamic} />
              </div>
              <div className="config-list">
                Dynamic: {health.dynamic.message}
                <br />
                readiness signal:{" "}
                {health.dynamic.signal === "PUBLIC_ENVIRONMENT_SETTINGS"
                  ? "public environment settings"
                  : "local configuration"}
              </div>
            </article>
            <article className="card">
              <div className="list-row">
                <h3>Production Deployment</h3>
                <Status check={health.deployment} />
              </div>
              <div className="config-list">
                registry: {publicAddress(health.deployment.registry)}
                <br />
                lcUSDC: {publicAddress(health.deployment.lcUsdc)}
                <br />
                manifest digest: {health.release.manifestSha256}
                <br />
                freeze: {health.release.freezeStatus}
              </div>
            </article>
          </div>

          <article className="card section">
            <h3>Official vaults</h3>
            {health.deployment.vaults.map((vault) => (
              <div className="list-row" key={vault.name}>
                <div className="list-main">
                  <strong>{vault.name}</strong>
                  <span>{publicAddress(vault.address)}</span>
                </div>
                <span className="badge neutral">{vault.hasCode ? "Code verified" : "Check unavailable"}</span>
              </div>
            ))}
          </article>

          <article className="card section">
            <h3>Security</h3>
            <div className="config-list">
              P-01: {health.release.p01Status}
              <br />
              unresolved Critical: {health.release.unresolvedCritical}
              <br />
              unresolved High: {health.release.unresolvedHigh}
              <br />
              unresolved Medium: {health.release.unresolvedMedium}
              <br />
              LeopoldVault runtime: {health.release.runtimeBytes.toLocaleString()} bytes
              <br />
              EIP-170 headroom: {health.release.eip170Headroom.toLocaleString()} bytes
              <br />
              contract freeze: {health.release.freezeStatus}
            </div>
          </article>

          <p className="subtle">
            This page uses public configuration and availability signals only. It does not request authentication,
            signatures, private processing, or blockchain writes.
          </p>
        </div>
      </section>
    </main>
  );
}
