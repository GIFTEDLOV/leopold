"use client";

import { formatEther } from "viem";
import { leopoldConfig } from "@/lib/leopold/config";
import { ConfigurationStatus, FixtureStatus } from "@/components/configuration-status";
import { useFinancial } from "@/components/financial-provider";
import { transactionIsBusy } from "@/lib/leopold/transactions";

export default function RewardsPage() {
  const financial = useFinancial();
  const busy = transactionIsBusy(financial.txStage);
  const liveRefundVault = leopoldConfig.vaults.find((vault) => {
    const state = financial.publicVaultState[vault.slug];
    return state?.entered && state.state === 14 && !state.refundClaimed;
  });
  const refundVault =
    financial.fixture && financial.enteredVaults.has("weekly")
      ? leopoldConfig.vaults.find((vault) => vault.slug === "weekly")
      : liveRefundVault;
  const refundAmount =
    financial.fixture && refundVault
      ? 2_500_000_000_000_000n
      : refundVault
        ? financial.publicVaultState[refundVault.slug]?.refundAmount
        : undefined;
  const rewardTotal = leopoldConfig.vaults.reduce(
    (total, vault) => total + (financial.publicVaultState[vault.slug]?.settlementReward ?? 0n),
    0n,
  );
  return (
    <div className="content">
      <FixtureStatus />
      <ConfigurationStatus />
      <div className="page-heading">
        <div>
          <h1>Rewards</h1>
          <p>Refundable bonds and settlement rewards are separate from prizes and savings.</p>
        </div>
      </div>
      <div className="grid two">
        <article className="card">
          <div className="card-label">Bond refunds</div>
          <div className="stat">{refundAmount === undefined ? "Unavailable" : `${formatEther(refundAmount)} ETH`}</div>
          <p className="subtle">
            Available after the round’s public bond accounting is finalized. Winner and loser refunds follow identical
            public logic.
          </p>
          <button
            className="button secondary"
            data-testid="claim-refund"
            disabled={busy || !refundVault || refundAmount === undefined}
            onClick={() => {
              if (refundVault) void financial.claimRefund(refundVault.slug).catch(() => undefined);
            }}
          >
            Claim refund
          </button>
        </article>
        <article className="card">
          <div className="card-label">Settlement rewards</div>
          <div className="stat">
            {financial.fixture ? "0 ETH" : leopoldConfig.ready ? `${formatEther(rewardTotal)} ETH` : "Unavailable"}
          </div>
          <p className="subtle">
            Credited only when this address performs permissionless draw-finalization work. This is not prize winnings,
            yield, or a bond refund.
          </p>
        </article>
      </div>
      <section className="section card">
        <h2>By vault</h2>
        {leopoldConfig.vaults.map((vault) => {
          const reward = financial.publicVaultState[vault.slug]?.settlementReward;
          return (
            <div className="list-row" key={vault.slug}>
              <div className="list-main">
                <strong>{vault.name}</strong>
                <span>Settlement reward credit</span>
              </div>
              <div>
                <span>{reward === undefined ? "Unavailable" : `${formatEther(reward)} ETH`}</span>
                {reward && reward > 0n ? (
                  <button
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => {
                      void financial.claimRewards(vault.slug).catch(() => undefined);
                    }}
                  >
                    Claim
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
