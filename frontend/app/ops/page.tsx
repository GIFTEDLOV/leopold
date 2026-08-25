import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import styles from "@/components/full-site/public-pages.module.css";
import { getPublicHealth, type HealthCheck, type HealthState } from "@/lib/ops/health";

export const dynamic = "force-dynamic";

const stateLabels: Record<HealthState, string> = {
  HEALTHY: "Operational",
  DEGRADED: "Degraded",
  UNAVAILABLE: "Unavailable",
  UNKNOWN: "Unknown",
};

function Header() {
  return (
    <header className={styles.header}>
      <Link href="/">
        <i className={styles.mark} aria-hidden="true" />
        <span>
          Leop<span>old</span> Ops
        </span>
      </Link>
      <nav>
        <Link href="/transparency">Transparency</Link>
        <ThemeToggle />
        <Link className={styles.open} href="/app">
          Open app
        </Link>
      </nav>
    </header>
  );
}

function checkDetail(check: HealthCheck) {
  return check.message || "No public readiness detail is currently available.";
}

export default async function OpsPage() {
  const health = await getPublicHealth();
  const checks = [
    {
      title: "Ethereum Sepolia network",
      check: health.network,
      detail: `Chain ${health.network.chainId ?? "unavailable"} · latest block ${health.network.latestBlock ?? "unavailable"}`,
    },
    {
      title: "Zama confidential infrastructure",
      check: health.zama,
      detail: "Public encryption-key metadata readiness signal",
    },
    {
      title: "Dynamic authentication",
      check: health.dynamic,
      detail: health.dynamic.signal === "PUBLIC_ENVIRONMENT_SETTINGS" ? "Public environment settings" : "Local configuration",
    },
    {
      title: "Production deployment",
      check: health.deployment,
      detail: `Registry ${health.deployment.registry ?? "not configured"}`,
    },
  ];

  return (
    <main className={styles.page}>
      <Header />
      <section className={`${styles.hero} ${styles.opsHero}`}>
        <p>PUBLIC OPERATIONAL STATUS</p>
        <h1 aria-label="Leopold Protocol Status">
          Leopold protocol
          <br />
          <em>status.</em>
        </h1>
        <span>
          Compact public readiness signals only. No authentication, wallet signature, private processing or blockchain
          write is requested.
        </span>
      </section>

      <section className={styles.ops}>
        <div className={styles.opsTop}>
          <div>
            <span>OVERALL SERVICE</span>
            <strong>{stateLabels[health.state]}</strong>
            <small>Checked {health.checkedAt}</small>
          </div>
          <i>{health.state === "HEALTHY" ? "●" : "—"}</i>
        </div>

        <div className={styles.checks}>
          {checks.map(({ title, check, detail }, index) => (
            <article key={title}>
              <header>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <span>{stateLabels[check.state]}</span>
              </header>
              <h2>{title}</h2>
              <p>{checkDetail(check)}</p>
              <dl>
                <div>
                  <dt>Response</dt>
                  <dd>{check.durationMs} ms</dd>
                </div>
                <div>
                  <dt>Configuration</dt>
                  <dd>{detail}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <section className={styles.addresses}>
          <p>RELEASE INTEGRITY</p>
          <div>
            <strong>Production manifest digest</strong>
            <code>manifest digest: {health.release.manifestSha256}</code>
            <span>{health.release.freezeStatus}</span>
          </div>
          <div>
            <strong>P-01</strong>
            <code>P-01: {health.release.p01Status}</code>
            <span>RELEASE GATE</span>
          </div>
          <div>
            <strong>Open findings</strong>
            <code>
              Critical {health.release.unresolvedCritical} · High {health.release.unresolvedHigh} · Medium{" "}
              {health.release.unresolvedMedium}
            </code>
            <span>SECURITY</span>
          </div>
          <div>
            <strong>LeopoldVault runtime</strong>
            <code>{health.release.runtimeBytes.toLocaleString()} bytes</code>
            <span>EIP-170 headroom {health.release.eip170Headroom.toLocaleString()} bytes</span>
          </div>
        </section>

        <section className={styles.addresses}>
          <p>OFFICIAL VAULTS</p>
          {health.deployment.vaults.map((vault) => (
            <div key={vault.name}>
              <strong>{vault.name}</strong>
              <code>{vault.address ?? "Address not configured"}</code>
              <span>{vault.hasCode ? "CODE VERIFIED" : "CHECK UNAVAILABLE"}</span>
            </div>
          ))}
        </section>

        <p className={styles.ownership}>
          Service availability does not affect ownership of funds held by the protocol.
        </p>
      </section>
    </main>
  );
}
