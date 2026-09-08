"use client";

import { useEffect, useState } from "react";
import { formatUsdcAmount } from "@/lib/leopold/amounts";
import { useFinancial } from "./financial-provider";
import { useAuth } from "./auth-provider";
import { useWalletIdentity } from "./wallet-identity-provider";
import { transactionIsBusy } from "@/lib/leopold/transactions";
import styles from "@/components/full-site/leopold-app-ui.module.css";

export function AddMoneyModal({ onClose }: { onClose(): void }) {
  const financial = useFinancial();
  const auth = useAuth();
  const walletIdentity = useWalletIdentity();
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState("10");
  const busy = transactionIsBusy(financial.txStage);
  const healthState = walletIdentity.identity.networkHealth.state;
  const walletState = walletIdentity.walletSession.status;
  const canUseWrapper = walletIdentity.walletSession.canUseFinancialActions && financial.connected;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const bodyOverflow = document.body.style.overflow;
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = bodyOverflow;
    };
  }, [onClose]);

  return (
    <div
      className={styles.modalBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`${styles.modal} ${styles.addMoneyModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-money-title"
        tabIndex={-1}
        autoFocus
      >
        <div className={styles.addMoneyHeader}>
          <div>
            <span className={styles.eyebrow}>Add money</span>
            <h2 id="add-money-title">Make savings private</h2>
          </div>
          <button className={styles.close} type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.addMoneyStepper} aria-label={`Step ${step} of 4`}>
          {[1, 2, 3, 4].map((item) => (
            <span
              key={item}
              className={`${styles.addMoneyStep} ${item <= step ? styles.addMoneyStepActive : ""}`}
            />
          ))}
        </div>
        {auth.accountStatus === "AUTH_LOADING" || auth.financialWalletMetadata.status === "LOADING" ? (
          <div className={styles.addMoneyCard} role="status" data-testid="account-metadata-loading">
            <span className={`${styles.addMoneyBadge} ${styles.addMoneyBadgeNeutral}`}>Loading account</span>
            <h3>Resolving verified wallet information</h3>
            <p className={styles.addMoneySubtle}>No wallet command will run until account metadata finishes loading.</p>
          </div>
        ) : auth.accountStatus === "SIGNED_OUT" ? (
          <div className={styles.addMoneyCard} role="status">
            <span className={`${styles.addMoneyBadge} ${styles.addMoneyBadgeNeutral}`}>Account sign-in required</span>
            <h3>Enter your Leopold account</h3>
            <a className={styles.primaryButton} href="/login">
              Continue to sign in
            </a>
          </div>
        ) : auth.accountStatus === "SIGNED_IN_PROFILE_INCOMPLETE" ? (
          <div className={styles.addMoneyCard} role="status">
            <span className={`${styles.addMoneyBadge} ${styles.addMoneyBadgeNeutral}`}>Account signed in</span>
            <h3>Complete required account information</h3>
            <button className={styles.primaryButton} type="button" onClick={auth.openProfileCompletion}>
              Complete account information
            </button>
          </div>
        ) : auth.financialWalletMetadata.status === "ERROR" || auth.financialWalletMetadata.status === "UNAVAILABLE" ? (
          <div className={styles.addMoneyCard} role="alert">
            <span className={`${styles.addMoneyBadge} ${styles.addMoneyBadgeNeutral}`}>Wallet metadata unavailable</span>
            <h3>Financial actions are paused</h3>
            <p className={styles.addMoneySubtle}>No verified wallet metadata has been changed.</p>
          </div>
        ) : walletState === "BOOTSTRAPPING" ? (
          <div className={styles.addMoneyCard} role="status" data-testid="network-checking">
            <span className={`${styles.addMoneyBadge} ${styles.addMoneyBadgeNeutral}`}>Checking wallet network</span>
            <h3>Confirm Ethereum Sepolia</h3>
            <p className={styles.addMoneySubtle}>
              Financial actions remain disabled until Leopold confirms the active signing wallet.
            </p>
          </div>
        ) : walletState === "WRONG_NETWORK" ? (
          <div className={styles.addMoneyCard} role="alert" data-testid="wrong-network">
            <span className={`${styles.addMoneyBadge} ${styles.addMoneyBadgeNeutral}`}>Wrong network</span>
            <h3>Switch to Ethereum Sepolia</h3>
            <p className={styles.addMoneySubtle}>
              No financial transaction will be simulated or sent while your wallet is on another chain.
            </p>
            <button className={styles.primaryButton} type="button" disabled={busy} onClick={() => void walletIdentity.switchToSepolia()}>
              Switch to Sepolia
            </button>
          </div>
        ) : walletState === "CONNECTING" ? (
          <div className={styles.addMoneyCard} role="status" data-testid="wallet-connecting">
            <span className={`${styles.addMoneyBadge} ${styles.addMoneyBadgeNeutral}`}>Connecting wallet</span>
            <h3>
              {walletIdentity.walletSession.reason === "ACCOUNT_SELECTION_REQUIRED"
                ? "Select your verified account"
                : "Connecting your verified wallet"}
            </h3>
            <p className={styles.addMoneySubtle}>
              {walletIdentity.walletSession.reason === "ACCOUNT_SELECTION_REQUIRED"
                ? "Choose the verified account in Rabby or MetaMask, then continue."
                : "This bounded connection attempt will finish without a page refresh."}
            </p>
            {walletIdentity.walletSession.reason === "ACCOUNT_SELECTION_REQUIRED" ? (
              <button className={styles.primaryButton} type="button" onClick={() => void walletIdentity.connectVerifiedWallet()}>
                I&apos;ve selected the account
              </button>
            ) : null}
          </div>
        ) : healthState === "WALLET_RPC_UNAVAILABLE" && walletState === "CONNECTED" ? (
          <div className={styles.addMoneyCard} role="alert" data-testid="wallet-rpc-unavailable">
            <span className={`${styles.addMoneyBadge} ${styles.addMoneyBadgeNeutral}`}>Wallet RPC unavailable</span>
            <h3>Your wallet&apos;s Sepolia connection isn&apos;t working</h3>
            <p className={styles.addMoneySubtle}>
              Leopold is online, but your wallet cannot currently reach Ethereum Sepolia. Financial actions are paused.
            </p>
            <button className={styles.primaryButton} type="button" onClick={() => void financial.retryNetworkHealth()} disabled={busy}>
              Retry network
            </button>
          </div>
        ) : healthState === "APP_RPC_UNAVAILABLE" && walletState === "CONNECTED" ? (
          <div className={styles.addMoneyCard} role="alert" data-testid="app-rpc-unavailable">
            <span className={`${styles.addMoneyBadge} ${styles.addMoneyBadgeNeutral}`}>Leopold RPC unavailable</span>
            <h3>Leopold&apos;s Sepolia service is unavailable</h3>
            <p className={styles.addMoneySubtle}>Financial actions are paused until Leopold&apos;s public Sepolia service responds.</p>
            <button className={styles.primaryButton} type="button" onClick={() => void financial.retryNetworkHealth()} disabled={busy}>
              Retry network
            </button>
          </div>
        ) : walletState === "CONNECTED" && (healthState === "NOT_CHECKED" || healthState === "CHECKING") ? (
          <div className={styles.addMoneyCard} role="status" data-testid="network-health-checking">
            <span className={`${styles.addMoneyBadge} ${styles.addMoneyBadgeNeutral}`}>Checking Sepolia service</span>
            <h3>Your wallet session is connected</h3>
            <p className={styles.addMoneySubtle}>Financial actions will resume when the bounded network check finishes.</p>
          </div>
        ) : (walletState === "DISCONNECTED" || walletState === "ERROR") && auth.financialWallet ? (
          <div className={styles.addMoneyCard} role="alert" data-testid="wallet-disconnected">
            <span className={`${styles.addMoneyBadge} ${styles.addMoneyBadgeNeutral}`}>Wallet disconnected</span>
            <h3>Reconnect your verified financial wallet</h3>
            <p className={styles.addMoneySubtle}>This Leopold account already has a verified financial wallet.</p>
            <button className={styles.primaryButton} type="button" onClick={() => void walletIdentity.connectVerifiedWallet()}>
              Reconnect verified wallet
            </button>
          </div>
        ) : healthState === "UNKNOWN" && walletState === "CONNECTED" ? (
          <div className={styles.addMoneyCard} role="alert" data-testid="network-health-unknown">
            <span className={`${styles.addMoneyBadge} ${styles.addMoneyBadgeNeutral}`}>Network health unavailable</span>
            <h3>Confirm your Sepolia connection</h3>
            <p className={styles.addMoneySubtle}>Leopold could not confirm the active wallet and public Sepolia connections.</p>
            <button className={styles.primaryButton} type="button" onClick={() => void financial.retryNetworkHealth()} disabled={busy}>
              Retry network
            </button>
          </div>
        ) : !canUseWrapper ? (
          <div className={styles.addMoneyCard} role="status">
            <span className={`${styles.addMoneyBadge} ${styles.addMoneyBadgeNeutral}`}>Wallet authorization required</span>
            <h3>Connect your financial wallet</h3>
            <p className={styles.addMoneySubtle}>
              Your wallet controls your savings. Leopold does not hold your funds or create an embedded wallet.
            </p>
            {auth.financialWalletMetadata.status === "NONE" ? (
              auth.canConfirmCurrentWalletAsFinancial ? (
                <button className={styles.primaryButton} type="button" onClick={() => void auth.confirmCurrentWalletAsFinancial()}>
                  Confirm financial wallet
                </button>
              ) : (
                <button className={styles.primaryButton} type="button" onClick={auth.openWalletLink}>
                  Link financial wallet
                </button>
              )
            ) : auth.financialWalletMetadata.status === "PRESENT" ? (
              <button className={styles.primaryButton} type="button" onClick={() => void walletIdentity.connectVerifiedWallet()}>
                Reconnect verified wallet
              </button>
            ) : (
              <span className={styles.addMoneySubtle}>Wallet recovery is not available in this state.</span>
            )}
            {auth.authError ? (
              <div className={styles.addMoneyError} role="alert">
                {auth.authError}
              </div>
            ) : null}
          </div>
        ) : null}
        {canUseWrapper && step === 1 ? (
          <>
            <p className={styles.addMoneySubtle}>Public USDC balance</p>
            <div className={styles.addMoneyStat}>
              {financial.usdcBalance === null ? "Unavailable" : `${formatUsdcAmount(financial.usdcBalance)} USDC`}
            </div>
            <p className={styles.addMoneySubtle}>Need funds? The official Compound Sepolia faucet supplies canonical Circle USDC.</p>
            <div className={styles.addMoneyFormRow}>
              <button
                className={styles.outlineButton}
                type="button"
                data-testid="get-usdc"
                disabled={busy}
                onClick={() => {
                  void financial.acquireUsdc().catch(() => undefined);
                }}
              >
                Get Test USDC
              </button>
              <button className={styles.primaryButton} type="button" onClick={() => setStep(2)} disabled={!canUseWrapper || busy}>
                Continue
              </button>
            </div>
          </>
        ) : null}
        {canUseWrapper && step === 2 ? (
          <>
            <label className={styles.addMoneyLabel} htmlFor="private-amount">
              Amount
            </label>
            <input
              id="private-amount"
              className={styles.addMoneyInput}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <p className={styles.addMoneySubtle}>
              USDC uses 6 decimal places. Leopold approves only this exact amount when approval is needed.
            </p>
            <button className={styles.primaryButton} type="button" onClick={() => setStep(3)}>
              Review
            </button>
          </>
        ) : null}
        {canUseWrapper && step === 3 ? (
          <>
            <div className={styles.addMoneyCard}>
              <div className={styles.addMoneyLabel}>You are making private</div>
              <div className={styles.addMoneyStat}>{amount || "0"} USDC</div>
              <div className={styles.addMoneySubtle}>Your wallet may ask for approval first, then the Make Private transaction.</div>
            </div>
            <button
              className={styles.primaryButton}
              type="button"
              data-testid="make-private"
              disabled={busy}
              onClick={() => {
                void financial
                  .makePrivate(amount)
                  .then(() => setStep(4))
                  .catch(() => undefined);
              }}
            >
              Make Private
            </button>
          </>
        ) : null}
        {canUseWrapper && step === 4 ? (
          <>
            <div className={styles.addMoneyCard}>
              <span className={styles.addMoneyBadge}>Ready</span>
              <h3>Private USDC is ready</h3>
              <p className={styles.addMoneySubtle}>
                Choose a vault whenever you’re ready. Saving and entering a prize round are separate actions.
              </p>
            </div>
            <button className={styles.primaryButton} type="button" onClick={onClose}>
              Choose a vault
            </button>
          </>
        ) : null}
        {financial.txStage !== "ready" ? (
          <div className={styles.addMoneyTxStatus} role="status" aria-live="polite">
            {financial.txLabel}
          </div>
        ) : null}
        {financial.error ? (
          <>
            <div className={styles.addMoneyError} role="alert">
              {financial.error.message}
            </div>
            {financial.error.technicalDetail ? (
              <details className={`${styles.addMoneyDetails} ${styles.addMoneySubtle}`}>
                <summary>Technical detail</summary>
                <code>{financial.error.technicalDetail}</code>
              </details>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
