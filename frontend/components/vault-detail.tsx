"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { formatEther } from "viem";
import { getVaultConfig, type VaultId } from "@/lib/leopold/config";
import { formatUsdcAmount, parseUsdcAmount } from "@/lib/leopold/amounts";
import { canPrepareVaultWithdrawal, getEffectiveVaultRoundStatus } from "@/lib/leopold/reads";
import { privateAmountLabel, useFinancial } from "./financial-provider";
import { transactionIsBusy } from "@/lib/leopold/transactions";
import styles from "@/components/full-site/leopold-app-ui.module.css";

const vaultImages: Record<VaultId, string> = {
  daily: "/marketing/leopold/leopold-daily.webp",
  weekly: "/marketing/leopold/leopold-weekly.webp",
  monthly: "/marketing/leopold/leopold-monthly.webp",
  boost: "/marketing/leopold/leopold-boost.webp",
};

const vaultNotes: Record<VaultId, string> = {
  daily: "FAST CYCLE",
  weekly: "RECOMMENDED",
  monthly: "LONGER CYCLE",
  boost: "SPONSOR-ENHANCED PRIZES",
};

export function VaultDetail({ slug }: { slug: VaultId }) {
  const vault = getVaultConfig(slug)!;
  const financial = useFinancial();
  const [saveAmount, setSaveAmount] = useState("10");
  const [withdrawAmount, setWithdrawAmount] = useState("1");
  const [drawer, setDrawer] = useState<"save" | "withdraw" | null>(null);
  const state = financial.publicVaultState[slug];
  const entered = financial.enteredVaults.has(slug);
  const revealed = financial.revealedVaults.has(slug);
  const bond = state?.bondAmount ?? (financial.fixture ? 5_000_000_000_000_000n : undefined);
  const busy = transactionIsBusy(financial.txStage);
  const roundStatus = getEffectiveVaultRoundStatus(state, financial.latestBlockTimestamp);
  const roundOpen = roundStatus.depositOpen;
  const canPrepareWithdrawal = financial.fixture || canPrepareVaultWithdrawal(state, financial.latestBlockTimestamp);
  const knownZeroPosition = financial.revealedVaults.has(slug) && (financial.vaultPositions[slug] ?? 0n) === 0n;
  const privatePosition = privateAmountLabel(revealed, financial.vaultPositions[slug] ?? null);
  const prizeLabel = state ? `${formatUsdcAmount(state.publicPrize)} USDC` : "Unavailable";

  const saveExceedsRevealedBalance = (() => {
    if (!financial.privateBalanceRevealed || financial.privateBalance === null) return false;
    try {
      return parseUsdcAmount(saveAmount) > financial.privateBalance;
    } catch {
      return false;
    }
  })();

  const saveDisabled = busy || !financial.financialActionsEnabled || saveExceedsRevealedBalance || (!financial.fixture && !roundOpen);
  const withdrawDisabled = busy || !financial.financialActionsEnabled || !canPrepareWithdrawal || knownZeroPosition;

  return (
    <div className={styles.content}>
      <Link className={styles.back} href="/app/classic/vaults">← Back to vaults</Link>

      <section className={styles.vaultHero}>
        <div>
          <p className={styles.eyebrow}>{vaultNotes[slug]}</p>
          <h1>{vault.name} Vault</h1>
          <p>
            Save privately on a {vault.roundDurationSeconds / 86_400}-day Classic cadence and choose when to enter the current prize round.
          </p>
          <div className={styles.heroActions}>
            <button className={styles.primaryButton} type="button" onClick={() => setDrawer("save")}>Save into vault</button>
            <button className={styles.outlineButton} type="button" onClick={() => setDrawer("withdraw")}>Withdraw</button>
          </div>
        </div>
        <figure>
          <Image src={vaultImages[slug]} alt={`${vault.name} Classic Vault`} fill sizes="(max-width: 800px) 100vw, 48vw" />
          <span>{slug === "daily" ? "01" : slug === "weekly" ? "02" : slug === "monthly" ? "03" : "04"}</span>
        </figure>
      </section>

      <section className={styles.detailMetrics} aria-label={`${vault.name} vault details`}>
        <div><span>Round duration</span><strong>{vault.roundDurationSeconds / 86_400} day{vault.roundDurationSeconds / 86_400 === 1 ? "" : "s"}</strong><small>Classic cadence</small></div>
        <div><span>Prize</span><strong>{prizeLabel}</strong><small>Public round reserve</small></div>
        <div><span>Round status</span><strong>{financial.fixture && !state ? "Open" : roundStatus.label}</strong><small>Current round</small></div>
        <div><span>Your entry</span><strong>{entered ? "Entered" : "Not entered"}</strong><small>Manual Classic entry</small></div>
      </section>

      <section className={styles.detailGrid}>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>ROUND TIMELINE</p>
          <h2>Current prize round.</h2>
          <ol className={styles.timeline}>
            <li><b>01</b><div><strong>Save</strong><span>{roundOpen || financial.fixture ? "Saving is available for this round." : "This round is not open for new savings."}</span></div></li>
            <li><b>02</b><div><strong>Enter</strong><span>{entered ? "You entered the current prize round." : "Prize entry remains a separate Classic action."}</span></div></li>
            <li><b>03</b><div><strong>Finalize</strong><span>The private draw finalizes after the round closes without exposing the accepted ticket.</span></div></li>
            <li><b>04</b><div><strong>Reveal</strong><span>Your private result becomes available only after finalization and only when you request it.</span></div></li>
          </ol>
        </article>

        <article className={styles.panel}>
          <p className={styles.eyebrow}>YOUR PRIVATE POSITION</p>
          <h2>Your savings.</h2>
          <div className={styles.privateValue}>{privatePosition}</div>
          <button
            className={styles.outlineButton}
            data-testid="reveal-position"
            disabled={busy || !financial.financialActionsEnabled}
            onClick={() => {
              if (revealed) financial.hideVault(slug);
              else void financial.revealVault(slug).catch(() => undefined);
            }}
          >
            {revealed ? "Hide balance" : "Reveal balance"}
          </button>
          <div className={styles.notice}>
            <strong>Prize entry · {entered ? "Entered" : "Not entered"}</strong>
            <span>Refundable settlement bond: {bond === undefined ? "Unavailable" : `${formatEther(bond)} ETH`}</span>
          </div>
          <button
            className={styles.primaryButton}
            data-testid="enter-round"
            style={{ width: "100%", marginTop: 14 }}
            disabled={busy || !financial.financialActionsEnabled || entered || bond === undefined || (!financial.fixture && !roundOpen)}
            onClick={() => void financial.enterRound(slug).catch(() => undefined)}
          >
            {entered ? "Entered" : "Enter Prize Round"}
          </button>
          <button
            className={styles.outlineButton}
            style={{ width: "100%", marginTop: 9 }}
            disabled={busy || !financial.financialActionsEnabled || !entered}
            onClick={() => void financial.revealEligibility(slug).catch(() => undefined)}
          >
            Reveal private eligibility
          </button>
        </article>
      </section>

      {financial.txStage !== "ready" ? <div className={styles.notice} role="status">{financial.txLabel}</div> : null}
      {financial.error ? (
        <>
          <div className={styles.notice} role="alert">{financial.error.message}</div>
          {financial.error.technicalDetail ? <details className={styles.fine}><summary>Technical detail</summary><code>{financial.error.technicalDetail}</code></details> : null}
        </>
      ) : null}

      {drawer ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setDrawer(null); }}>
          <section className={`${styles.modal} ${styles.drawer}`} role="dialog" aria-modal="true" aria-labelledby="vault-action-title">
            <button className={styles.close} type="button" aria-label="Close" onClick={() => setDrawer(null)}>×</button>
            <p className={styles.eyebrow}>{drawer === "save" ? "SAVE INTO VAULT" : "WITHDRAW SAVINGS"}</p>
            <h2 id="vault-action-title">{drawer === "save" ? `Save into ${vault.name}.` : `Withdraw from ${vault.name}.`}</h2>
            <p>{drawer === "save" ? "Choose how much Private USDC to move into this Classic Vault." : "Choose how much to return from this vault to your Private USDC balance."}</p>
            <div className={styles.flowSteps} aria-hidden="true">
              <div className={styles.flowActive}><b>01</b><span>Amount</span><small>Choose value</small></div>
              <div><b>02</b><span>Review</span><small>Check action</small></div>
              <div><b>03</b><span>Wallet</span><small>Confirm once</small></div>
            </div>
            <div className={styles.amountInput}>
              <input
                aria-label={drawer === "save" ? "Amount to save" : "Amount to withdraw"}
                inputMode="decimal"
                value={drawer === "save" ? saveAmount : withdrawAmount}
                onChange={(event) => drawer === "save" ? setSaveAmount(event.target.value) : setWithdrawAmount(event.target.value)}
              />
              <b>USDC</b>
              <button
                type="button"
                onClick={() => {
                  if (drawer === "save" && financial.privateBalanceRevealed && financial.privateBalance !== null) setSaveAmount(formatUsdcAmount(financial.privateBalance));
                  if (drawer === "withdraw" && revealed && financial.vaultPositions[slug] !== undefined) setWithdrawAmount(formatUsdcAmount(financial.vaultPositions[slug] ?? 0n));
                }}
              >MAX</button>
            </div>
            <div className={styles.notice}>
              <strong>{financial.financialActionsEnabled ? "Verified wallet ready" : "Connect your verified wallet to continue"}</strong>
              <span>{drawer === "save" ? `Round status: ${financial.fixture && !state ? "Open" : roundStatus.label}` : "Withdrawals return to your Private USDC balance."}</span>
            </div>
            <button
              className={styles.primaryButton}
              style={{ width: "100%" }}
              data-testid={drawer === "save" ? "save-private" : "withdraw"}
              disabled={drawer === "save" ? saveDisabled : withdrawDisabled}
              onClick={() => drawer === "save"
                ? void financial.save(slug, saveAmount).catch(() => undefined)
                : void financial.withdraw(slug, withdrawAmount).catch(() => undefined)}
            >
              {drawer === "save" ? "Save Privately" : "Withdraw"}
            </button>
            {drawer === "save" && financial.privateBalanceRevealed && financial.privateBalance !== null ? <p className={styles.fine}>Available Private USDC: {formatUsdcAmount(financial.privateBalance)}.</p> : null}
            {drawer === "withdraw" && !financial.fixture && roundStatus.code === "ENDED" && !knownZeroPosition ? <p className={styles.fine}>This prize period has ended. Withdrawal may require the existing two-confirmation recovery path.</p> : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
