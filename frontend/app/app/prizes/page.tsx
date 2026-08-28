"use client";

import { useState } from "react";
import { formatUsdcAmount } from "@/lib/leopold/amounts";
import { ConfigurationStatus, FixtureStatus } from "@/components/configuration-status";
import { useLeopoldUiController, type UiHistoricalRoundSummary, type UiVaultSummary } from "@/components/leopold-ui-controller";
import styles from "@/components/full-site/leopold-app-ui.module.css";

type PrizeTab = "current" | "upcoming" | "completed";

function currentRoundCard(vault: UiVaultSummary, canUseFinancialActions: boolean) {
  const result = vault.privateResult;
  return (
    <article className={styles.panel} key={vault.id}>
      <div className={styles.panelTitle}>
        <div>
          <span className={styles.eyebrow}>
            {vault.name} Vault · Round {vault.round.id?.toString() ?? "—"}
          </span>
          <h2>{vault.round.id === null ? (vault.round.entered ? "Result ready" : "Round active") : vault.round.label}</h2>
        </div>
        <span className={styles.status}>{vault.round.entered ? "Entered" : "Not entered"}</span>
      </div>
      <div className={styles.listRow}>
        <div>
          <strong>Prize</strong>
          <span>Public round reserve</span>
        </div>
        <strong>
          {vault.round.publicPrizeReserve === null ? "Unavailable" : `${formatUsdcAmount(vault.round.publicPrizeReserve)} USDC`}
        </strong>
      </div>
      <div className={styles.listRow}>
        <div>
          <strong>Private result</strong>
          <span>
            {!vault.round.entered
              ? "Enter an open round first"
              : result.state === "revealed"
                ? "Revealed only in this browser session"
                : result.available
                  ? "Your private result is ready"
                  : "Available after private draw finalization"}
          </span>
        </div>
        <strong>
          {result.state === "revealed"
            ? result.value === 0n
              ? "No prize this round"
              : `Won · ${formatUsdcAmount(result.value ?? 0n)} USDC`
            : "Hidden"}
        </strong>
      </div>
      <button
        className={styles.outlineButton}
        style={{ marginTop: "18px" }}
        data-testid={`reveal-result-${vault.id}`}
        disabled={!canUseFinancialActions || !result.available}
        onClick={() => {
          void vault.actions.revealResult().catch(() => undefined);
        }}
      >
        Reveal Private Result
      </button>
    </article>
  );
}

function completedRoundCard(round: UiHistoricalRoundSummary, canUseFinancialActions: boolean) {
  const result = round.privateResult;
  return (
    <article className={styles.panel} key={`${round.vaultId}:${round.round.id.toString()}`}>
      <div className={styles.panelTitle}>
        <div>
          <span className={styles.eyebrow}>
            {round.vaultName} Vault · Round {round.round.id.toString()}
          </span>
          <h2>{round.round.label}</h2>
        </div>
        <span className={styles.status}>Entered</span>
      </div>
      <div className={styles.listRow}>
        <div>
          <strong>Prize</strong>
          <span>Final public round reserve</span>
        </div>
        <strong>{formatUsdcAmount(round.round.publicPrizeReserve)} USDC</strong>
      </div>
      <div className={styles.listRow}>
        <div>
          <strong>Private eligibility</strong>
          <span>{round.eligibility.state === "revealed" ? "Revealed only in this browser session" : "Hidden"}</span>
        </div>
        <strong>{round.eligibility.available ? "Ready" : "Unavailable"}</strong>
      </div>
      <div className={styles.listRow}>
        <div>
          <strong>Private result</strong>
          <span>{result.state === "revealed" ? "Revealed only in this browser session" : "Hidden"}</span>
        </div>
        <strong>
          {result.state === "revealed"
            ? result.value === 0n
              ? "No prize this round"
              : `Won · ${formatUsdcAmount(result.value ?? 0n)} USDC`
            : "Hidden"}
        </strong>
      </div>
      <div className={styles.buttonRow}>
        <button
          className={styles.outlineButton}
          data-testid={`reveal-eligibility-${round.vaultId}-${round.round.id.toString()}`}
          disabled={!canUseFinancialActions || !round.eligibility.available}
          onClick={() => {
            void round.actions.revealEligibility().catch(() => undefined);
          }}
        >
          Reveal Private Eligibility
        </button>
        <button
          className={styles.outlineButton}
          data-testid={`reveal-result-${round.vaultId}-${round.round.id.toString()}`}
          disabled={!canUseFinancialActions || !result.available}
          onClick={() => {
            void round.actions.revealResult().catch(() => undefined);
          }}
        >
          Reveal Private Result
        </button>
      </div>
      {!round.rewards.bondRefundClaimed && round.rewards.bondRefund > 0n ? (
        <button
          className={styles.outlineButton}
          disabled={!canUseFinancialActions}
          onClick={() => {
            void round.actions.claimBondRefund().catch(() => undefined);
          }}
        >
          Claim Bond Refund
        </button>
      ) : null}
    </article>
  );
}

export default function PrizesPage() {
  const controller = useLeopoldUiController();
  const [tab, setTab] = useState<PrizeTab>("current");

  return (
    <div className={styles.content}>
      <FixtureStatus />
      <ConfigurationStatus />
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Private prize center</p>
          <h1>
            Every round, in one <em>place.</em>
          </h1>
          <p>Prize entry is public. Your exact chances, result, and winnings stay private.</p>
        </div>
      </div>
      <section className={styles.tabRow} aria-label="Prize round views">
        {(["current", "upcoming", "completed"] as const).map((value) => (
          <button
            className={tab === value ? styles.selected : undefined}
            key={value}
            onClick={() => setTab(value)}
            type="button"
          >
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </section>
      {tab === "current" ? (
        <div className={styles.prizeGrid}>
          {controller.vaults.map((vault) => currentRoundCard(vault, controller.wallet.canUseFinancialActions))}
        </div>
      ) : tab === "completed" ? (
        <div className={styles.prizeGrid}>
          {controller.completedRounds.length > 0 ? (
            controller.completedRounds.map((round) => completedRoundCard(round, controller.wallet.canUseFinancialActions))
          ) : (
            <article className={styles.panel}>
              <h2>No completed rounds</h2>
              <p>Settled rounds you entered will appear here.</p>
            </article>
          )}
        </div>
      ) : (
        <article className={styles.panel}>
          <h2>No upcoming rounds</h2>
          <p>Upcoming rounds will appear here when the official vault schedule provides them.</p>
        </article>
      )}
      <section className={styles.privacyBand}>
        <p className={styles.eyebrow}>Encrypted draw</p>
        <h2>Why a draw can take time</h2>
        <p>
          When a round closes, Leopold may show “Finalizing private draw.” Permissionless participants complete the
          private draw in bounded steps. Progress never reveals the winner, accepted ticket, or participant balances.
        </p>
      </section>
    </div>
  );
}
