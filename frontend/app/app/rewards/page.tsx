"use client";

import { formatEther } from "viem";
import { leopoldConfig } from "@/lib/leopold/config";
import { SETTLED_ROUND_STATE } from "@/lib/leopold/reads";
import { ConfigurationStatus, FixtureStatus } from "@/components/configuration-status";
import { useFinancial } from "@/components/financial-provider";
import { transactionIsBusy } from "@/lib/leopold/transactions";
import styles from "@/components/full-site/leopold-app-ui.module.css";

export default function RewardsPage() {
  const financial = useFinancial();
  const busy = transactionIsBusy(financial.txStage);
  const liveRefundVault = leopoldConfig.vaults.find((vault) => {
    const state = financial.publicVaultState[vault.slug];
    return state?.entered && state.state === SETTLED_ROUND_STATE && !state.refundClaimed;
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
    <div className={styles.content}>
      <FixtureStatus />
      <ConfigurationStatus />
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Public reward accounting</p>
          <h1>Rewards, kept <em>distinct.</em></h1>
          <p>Refundable settlement bonds and finalization rewards are separate from prizes, yield and principal.</p>
        </div>
      </div>
      <div className={styles.metrics}>
        <article className={styles.metricHero}>
          <div><span>Bond refunds</span><span className={styles.status}>{refundAmount === undefined ? "Unavailable" : "Available"}</span></div>
          <strong>{refundAmount === undefined ? "—" : formatEther(refundAmount)} <small>ETH</small></strong>
          <p>
            Available after public bond accounting finalizes for an entered round.
          </p>
          <button
            className={styles.outlineButton}
            data-testid="claim-refund"
            disabled={busy || !financial.financialActionsEnabled || !refundVault || refundAmount === undefined}
            onClick={() => {
              if (refundVault) void financial.claimRefund(refundVault.slug).catch(() => undefined);
            }}
          >
            Claim refund
          </button>
        </article>
        <article>
          <div><span>Settlement rewards</span><span className={styles.status}>{rewardTotal > 0n ? "Available" : "Unavailable"}</span></div>
          <strong>{financial.fixture ? "0" : leopoldConfig.ready ? formatEther(rewardTotal) : "—"} <small>ETH</small></strong>
          <p>
            Credited only when this address performs permissionless draw-finalization work.
          </p>
        </article>
        <article>
          <div><span>Claimed rewards</span><span className={styles.status}>{financial.activity.some((item) => /claim/i.test(item.label)) ? "History" : "No history"}</span></div>
          <strong>—</strong>
          <p>Completed public reward claims will appear here.</p>
        </article>
      </div>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>By vault</p><h2>Reward availability.</h2>
        {leopoldConfig.vaults.map((vault) => {
          const reward = financial.publicVaultState[vault.slug]?.settlementReward;
          return (
            <div className={styles.listRow} key={vault.slug}>
              <div>
                <strong>{vault.name}</strong>
                <span>Settlement reward credit</span>
              </div>
              <div>
                <span>{reward === undefined ? "Unavailable" : `${formatEther(reward)} ETH`}</span>
                {reward && reward > 0n ? (
                  <button
                    className={styles.outlineButton}
                    disabled={busy || !financial.financialActionsEnabled}
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
