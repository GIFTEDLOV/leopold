"use client";

import Link from "next/link";
import { ConfigurationStatus, FixtureStatus } from "@/components/configuration-status";
import { privateAmountLabel, useFinancial } from "@/components/financial-provider";
import { VaultCards } from "@/components/vault-cards";

export default function DashboardPage() {
  const financial = useFinancial();
  const revealedTotal = Array.from(financial.revealedVaults).reduce(
    (total, vault) => total + (financial.vaultPositions[vault] ?? 0n),
    0n,
  );
  return (
    <div className="content">
      <FixtureStatus />
      <ConfigurationStatus />
      <div className="page-heading">
        <div>
          <h1>Good to see you.</h1>
          <p>Your private savings, prize rounds, and rewards in one place.</p>
        </div>
      </div>
      <div className="grid three">
        <article className="card hero-stat">
          <div className="card-label">Total private savings</div>
          <div className="stat">{privateAmountLabel(financial.revealedVaults.size > 0, revealedTotal)}</div>
          <span className="subtle">Reveal each vault to calculate locally</span>
        </article>
        <article className="card hero-stat">
          <div className="card-label">Private USDC available</div>
          <div className="stat">{privateAmountLabel(financial.privateBalanceRevealed, financial.privateBalance)}</div>
          <button
            className="button ghost small"
            onClick={() => {
              if (financial.privateBalanceRevealed) financial.hidePrivateBalance();
              else void financial.revealPrivateBalance().catch(() => undefined);
            }}
          >
            {financial.privateBalanceRevealed ? "Hide" : "Reveal"}
          </button>
        </article>
        <article className="card hero-stat">
          <div className="card-label">Next prize opportunity</div>
          <div className="stat">Weekly</div>
          <span className="subtle">Enter while the round is open</span>
        </article>
      </div>
      <section className="section">
        <div className="section-title">
          <h2>Choose a vault</h2>
          <Link className="subtle" href="/app/vaults">
            View all vaults →
          </Link>
        </div>
        <VaultCards />
      </section>
      <section className="section grid two">
        <article className="card">
          <div className="section-title">
            <h2>Prize round entries</h2>
            <Link className="subtle" href="/app/prizes">
              View prizes →
            </Link>
          </div>
          {financial.enteredVaults.size ? (
            Array.from(financial.enteredVaults).map((vault) => (
              <div className="list-row" key={vault}>
                <div className="list-main">
                  <strong>{vault[0].toUpperCase() + vault.slice(1)} round</strong>
                  <span>Your chances grow from registration time</span>
                </div>
                <span className="badge">Entered</span>
              </div>
            ))
          ) : (
            <div className="empty">No current prize-round entries</div>
          )}
        </article>
        <article className="card">
          <div className="section-title">
            <h2>Recent activity</h2>
            <Link className="subtle" href="/app/activity">
              All activity →
            </Link>
          </div>
          {financial.activity.length ? (
            financial.activity.slice(0, 3).map((item) => (
              <div className="list-row" key={item.id}>
                <div className="list-main">
                  <strong>{item.label}</strong>
                  <span>Current wallet · Sepolia</span>
                </div>
                <span className="badge neutral">{item.status}</span>
              </div>
            ))
          ) : (
            <div className="empty">Your wallet activity will appear here</div>
          )}
        </article>
      </section>
    </div>
  );
}
