"use client";

import { useState } from "react";
import { formatEther } from "viem";
import { getVaultConfig, type VaultId } from "@/lib/leopold/config";
import { formatUsdcAmount, parseUsdcAmount } from "@/lib/leopold/amounts";
import { canPrepareVaultWithdrawal, getEffectiveVaultRoundStatus } from "@/lib/leopold/reads";
import { privateAmountLabel, useFinancial } from "./financial-provider";
import { transactionIsBusy } from "@/lib/leopold/transactions";
import styles from "@/components/full-site/leopold-app-ui.module.css";

export function VaultDetail({ slug }: { slug: VaultId }) {
  const vault = getVaultConfig(slug)!;
  const financial = useFinancial();
  const [saveAmount, setSaveAmount] = useState("10");
  const [withdrawAmount, setWithdrawAmount] = useState("1");
  const state = financial.publicVaultState[slug];
  const entered = financial.enteredVaults.has(slug);
  const revealed = financial.revealedVaults.has(slug);
  const eligibility = financial.privateEligibility[slug];
  const bond = state?.bondAmount ?? (financial.fixture ? 5_000_000_000_000_000n : undefined);
  const busy = transactionIsBusy(financial.txStage);
  const showTxStatus = financial.txStage !== "ready" && financial.txStage !== "complete";
  const roundStatus = getEffectiveVaultRoundStatus(state, financial.latestBlockTimestamp);
  const roundOpen = roundStatus.depositOpen;
  const canPrepareWithdrawal = financial.fixture || canPrepareVaultWithdrawal(state, financial.latestBlockTimestamp);
  const knownZeroPosition = financial.revealedVaults.has(slug) && (financial.vaultPositions[slug] ?? 0n) === 0n;
  const saveExceedsRevealedBalance = (() => {
    if (!financial.privateBalanceRevealed || financial.privateBalance === null) return false;
    try {
      return parseUsdcAmount(saveAmount) > financial.privateBalance;
    } catch {
      return false;
    }
  })();

  return (
    <div className={styles.content}>
      <div className={styles.pageHeading} style={{ marginBottom: 12 }}>
        <div>
          <span className={styles.eyebrow}>{slug === "weekly" ? "Recommended vault" : "Private savings vault"}</span>
          <h1>{vault.name} Vault</h1>
          <p>
            {vault.roundDurationSeconds / 86_400} day round · {financial.fixture && !state ? "Open" : roundStatus.label}
          </p>
        </div>
        {entered ? <span className={styles.status}>Entered current round</span> : null}
      </div>

      <div className={styles.detailGrid} style={{ marginTop: 24 }}>
        <div className={styles.profileGrid}>
          <article className={styles.panel}>
            <div className={styles.eyebrow}>Your private savings</div>
            <div className="stat" data-testid="private-position">
              {privateAmountLabel(revealed, financial.vaultPositions[slug] ?? null)}
            </div>
            <button
              className={styles.outlineButton}
              data-testid="reveal-position"
              disabled={busy || !financial.financialActionsEnabled}
              onClick={() => {
                if (revealed) financial.hideVault(slug);
                else void financial.revealVault(slug).catch(() => undefined);
              }}
            >
              {revealed ? "Hide" : "Reveal"}
            </button>
          </article>

          <article className={styles.panel} id="save">
            <h2>Save privately</h2>
            <p className={styles.fine}>
              Move available Private USDC into this vault. Your saving succeeds when the vault transaction confirms;
              vault-level strategy activity happens separately.
            </p>
            <div className={styles.buttonRow}>
              <input
                className="input"
                aria-label="Amount to save"
                inputMode="decimal"
                value={saveAmount}
                onChange={(event) => setSaveAmount(event.target.value)}
              />
              <button
                className={styles.primaryButton}
                data-testid="save-private"
                disabled={
                  busy ||
                  !financial.financialActionsEnabled ||
                  saveExceedsRevealedBalance ||
                  (!financial.fixture && !roundOpen)
                }
                onClick={() => {
                  void financial.save(slug, saveAmount).catch(() => undefined);
                }}
              >
                Save Privately
              </button>
            </div>
            {financial.privateBalanceRevealed && financial.privateBalance !== null ? (
              <p className={styles.fine}>Enter an amount up to {formatUsdcAmount(financial.privateBalance)} USDC.</p>
            ) : null}
            {!financial.fixture && state !== undefined && !roundOpen ? (
              <p className={styles.fine}>This vault round is not open for deposits.</p>
            ) : null}
          </article>

          <article className={styles.panel}>
            <h2>Withdraw savings</h2>
            <p className={styles.fine}>
              Withdraw from this vault to your Private USDC balance. There is no withdrawal queue.
            </p>
            <div className={styles.buttonRow}>
              <input
                className="input"
                aria-label="Amount to withdraw"
                inputMode="decimal"
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
              />
              <button
                className={styles.outlineButton}
                data-testid="withdraw"
                disabled={busy || !financial.financialActionsEnabled || !canPrepareWithdrawal || knownZeroPosition}
                onClick={() => {
                  void financial.withdraw(slug, withdrawAmount).catch(() => undefined);
                }}
              >
                Withdraw
              </button>
            </div>
            {!financial.fixture && roundStatus.code === "ENDED" && !knownZeroPosition ? (
              <p className={styles.fine}>This prize period has ended. Withdrawal requires two wallet confirmations.</p>
            ) : null}
          </article>
        </div>

        <aside className={styles.profileGrid}>
          <article className={styles.panel}>
            <div className={styles.eyebrow}>Current prize round</div>
            <div className="stat">{entered ? "Entered" : "Not entered"}</div>
            <p className={styles.fine}>
              Your prize chances start when you enter this round and grow while your savings remain in the vault.
            </p>
            <div
              className={styles.notice}
              style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 18, lineHeight: 1.35 }}
            >
              <strong style={{ display: "block", marginBottom: 18, fontFamily: 'Georgia, "Times New Roman", serif' }}>
                Refundable settlement bond
                <br />
                {bond === undefined ? "Unavailable" : `${formatEther(bond)} ETH`}
              </strong>
              This public ETH bond is separate from your private savings. Unused collateral is refundable; a fixed
              portion compensates permissionless private draw finalization.
            </div>
            <button
              className={styles.primaryButton}
              data-testid="enter-round"
              style={{ width: "100%", marginTop: 24 }}
              disabled={
                busy ||
                !financial.financialActionsEnabled ||
                entered ||
                bond === undefined ||
                (!financial.fixture && !roundOpen)
              }
              onClick={() => {
                void financial.enterRound(slug).catch(() => undefined);
              }}
            >
              {entered ? "Entered" : "Enter Prize Round"}
            </button>
          </article>

          <article className={styles.panel}>
            <div className={styles.eyebrow}>Prize eligibility</div>
            <div className="stat">
              {eligibility === undefined
                ? entered
                  ? "Active · private"
                  : "Not active"
                : eligibility === 0n
                  ? "No eligible savings yet"
                  : `Weight ${eligibility.toLocaleString()}`}
            </div>
            <p className={styles.fine}>
              {eligibility === undefined
                ? "Exact eligibility remains private. Earlier savings history before registration does not count for this round."
                : "Eligibility weight revealed for this browser session. It will be cleared on wallet or network change."}
            </p>
            <button
              className={styles.outlineButton}
              disabled={busy || !financial.financialActionsEnabled || !entered}
              onClick={() => {
                void financial.revealEligibility(slug).catch(() => undefined);
              }}
            >
              {eligibility === undefined ? "Reveal private eligibility" : "Reveal eligibility again"}
            </button>
          </article>
        </aside>
      </div>

      {showTxStatus ? (
        <div className={styles.notice} role="status">
          {financial.txLabel}
        </div>
      ) : null}
      {financial.error ? (
        <>
          <div className={styles.notice} role="alert">
            {financial.error.message}
          </div>
          {financial.error.technicalDetail ? (
            <details className={styles.fine}>
              <summary>Technical detail</summary>
              <code>{financial.error.technicalDetail}</code>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
