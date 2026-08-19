"use client";

import { useState } from "react";
import { formatEther } from "viem";
import { getVaultConfig, type VaultId } from "@/lib/leopold/config";
import { formatUsdcAmount, parseUsdcAmount } from "@/lib/leopold/amounts";
import { canPrepareVaultWithdrawal, getEffectiveVaultRoundStatus } from "@/lib/leopold/reads";
import { privateAmountLabel, useFinancial } from "./financial-provider";
import { useAuth } from "./auth-provider";
import { transactionIsBusy } from "@/lib/leopold/transactions";

export function VaultDetail({ slug }: { slug: VaultId }) {
  const vault = getVaultConfig(slug)!;
  const financial = useFinancial();
  const auth = useAuth();
  const [saveAmount, setSaveAmount] = useState("10");
  const [withdrawAmount, setWithdrawAmount] = useState("1");
  const state = financial.publicVaultState[slug];
  const entered = financial.enteredVaults.has(slug);
  const revealed = financial.revealedVaults.has(slug);
  const bond = state?.bondAmount ?? (financial.fixture ? 5_000_000_000_000_000n : undefined);
  const busy = transactionIsBusy(financial.txStage);
  const roundStatus = getEffectiveVaultRoundStatus(state, financial.latestBlockTimestamp);
  const roundOpen = roundStatus.depositOpen;
  const canPrepareWithdrawal = financial.fixture || canPrepareVaultWithdrawal(state, financial.latestBlockTimestamp);
  const knownZeroPosition = financial.revealedVaults.has(slug) && (financial.vaultPositions[slug] ?? 0n) === 0n;
  const walletMismatch = financial.networkHealth.state === "WALLET_MISMATCH";
  const saveExceedsRevealedBalance = (() => {
    if (!financial.privateBalanceRevealed || financial.privateBalance === null) return false;
    try {
      return parseUsdcAmount(saveAmount) > financial.privateBalance;
    } catch {
      return false;
    }
  })();
  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{slug === "weekly" ? "Recommended vault" : "Private savings vault"}</span>
          <h1>{vault.name} Vault</h1>
          <p>
            {vault.roundDurationSeconds / 86_400} day round · {financial.fixture && !state ? "Open" : roundStatus.label}
          </p>
        </div>
        {entered ? <span className="badge">Entered current round</span> : null}
      </div>
      <div className="detail-layout">
        <div className="grid">
          <article className="card">
            <div className="card-label">Your private savings</div>
            <div className="stat" data-testid="private-position">
              {privateAmountLabel(revealed, financial.vaultPositions[slug] ?? null)}
            </div>
            <button
              className="button secondary small"
              data-testid="reveal-position"
              disabled={busy || (!financial.financialActionsEnabled && !walletMismatch)}
              onClick={() => {
                if (walletMismatch) void auth.reconnectFinancialWallet().catch(() => undefined);
                else if (revealed) financial.hideVault(slug);
                else void financial.revealVault(slug).catch(() => undefined);
              }}
            >
              {walletMismatch ? "Switch to verified wallet" : revealed ? "Hide" : "Reveal"}
            </button>
            {walletMismatch ? <p className="subtle">Switch wallets before revealing private savings.</p> : null}
          </article>
          <article className="card" id="save">
            <h2>Save privately</h2>
            <p className="subtle">
              Move available Private USDC into this vault. Your saving succeeds when the vault transaction confirms;
              vault-level strategy activity happens separately.
            </p>
            <div className="form-row">
              <input
                className="input"
                aria-label="Amount to save"
                inputMode="decimal"
                value={saveAmount}
                onChange={(event) => setSaveAmount(event.target.value)}
              />
              <button
                className="button"
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
              <p className="subtle">Enter an amount up to {formatUsdcAmount(financial.privateBalance)} USDC.</p>
            ) : null}
            {!financial.fixture && state !== undefined && !roundOpen ? (
              <p className="subtle">This vault round is not open for deposits.</p>
            ) : null}
          </article>
          <article className="card">
            <h2>Withdraw savings</h2>
            <p className="subtle">
              Withdraw from this vault to your Private USDC balance. There is no withdrawal queue.
            </p>
            <div className="form-row">
              <input
                className="input"
                aria-label="Amount to withdraw"
                inputMode="decimal"
                value={withdrawAmount}
                onChange={(event) => setWithdrawAmount(event.target.value)}
              />
              <button
                className="button secondary"
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
              <p className="subtle">This prize period has ended. Withdrawal requires two wallet confirmations.</p>
            ) : null}
          </article>
        </div>
        <aside className="grid">
          <article className="card">
            <div className="card-label">Current prize round</div>
            <div className="stat">{entered ? "Entered" : "Not entered"}</div>
            <p className="subtle">
              Your prize chances start when you enter this round and grow while your savings remain in the vault.
            </p>
            <div className="disclosure">
              <strong>
                Refundable settlement bond
                <br />
                {bond === undefined ? "Unavailable" : `${formatEther(bond)} ETH`}
              </strong>
              <br />
              This public ETH bond is separate from your private savings. Unused collateral is refundable; a fixed
              portion compensates permissionless private draw finalization.
            </div>
            <button
              className="button"
              data-testid="enter-round"
              style={{ width: "100%", marginTop: 14 }}
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
          <article className="card">
            <div className="card-label">Prize eligibility</div>
            <div className="stat">
              {financial.privateEligibility[slug] === undefined
                ? entered
                  ? "Active · private"
                  : "Not active"
                : financial.privateEligibility[slug] === 0n
                  ? "No eligible savings yet"
                  : "Revealed · active"}
            </div>
            <p className="subtle">
              Exact eligibility remains private. Earlier savings history before registration does not count for this
              round.
            </p>
            <button
              className="button secondary small"
              disabled={
                busy || (!financial.financialActionsEnabled && !walletMismatch) || (!entered && !walletMismatch)
              }
              onClick={() => {
                if (walletMismatch) void auth.reconnectFinancialWallet().catch(() => undefined);
                else void financial.revealEligibility(slug).catch(() => undefined);
              }}
            >
              {walletMismatch ? "Switch to verified wallet" : "Reveal private eligibility"}
            </button>
          </article>
        </aside>
      </div>
      {financial.txStage !== "ready" ? (
        <div className="tx-status" role="status">
          {financial.txLabel}
        </div>
      ) : null}
      {financial.error ? (
        <>
          <div className="error" role="alert">
            {financial.error.message}
          </div>
          {financial.error.technicalDetail ? (
            <details className="subtle">
              <summary>Technical detail</summary>
              <code>{financial.error.technicalDetail}</code>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
