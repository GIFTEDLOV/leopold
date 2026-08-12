import Link from "next/link";
import { leopoldConfig } from "@/lib/leopold/config";

export default function OpsPage() {
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
          <h2>Deployment status</h2>
          <div className="grid two">
            <article className="card">
              <h3>Network</h3>
              <div className="config-list">
                ethereum-sepolia
                <br />
                chainId: {leopoldConfig.chainId}
                <br />
                configuration: {leopoldConfig.ready ? "ready" : "fail-closed"}
                <br />
                relayer: checked at private-operation time
              </div>
            </article>
            <article className="card">
              <h3>Contract configuration</h3>
              <div className="config-list">
                Private USDC: {leopoldConfig.lcUsdc.status}
                <br />
                Registry: {leopoldConfig.registry.status}
                <br />
                Official vaults:{" "}
                {leopoldConfig.vaults.every((v) => v.vault.status === "configured") ? "configured" : "missing"}
              </div>
            </article>
          </div>
          <article className="card section">
            <h3>Official vaults</h3>
            {leopoldConfig.vaults.map((vault) => (
              <div className="list-row" key={vault.slug}>
                <div className="list-main">
                  <strong>{vault.name}</strong>
                  <span>{vault.roundDurationSeconds} second rounds</span>
                </div>
                <span className="badge neutral">{vault.vault.status}</span>
              </div>
            ))}
          </article>
          <p className="subtle">
            This page exposes only public operational state. It never displays private balances, eligibility, tickets,
            winner, or winnings.
          </p>
        </div>
      </section>
    </main>
  );
}
