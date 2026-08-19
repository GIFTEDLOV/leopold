"use client";

import { useState } from "react";
import { formatUsdcAmount } from "@/lib/leopold/amounts";
import { useFinancial } from "./financial-provider";
import { useAuth } from "./auth-provider";
import { useWalletIdentity } from "./wallet-identity-provider";
import { transactionIsBusy } from "@/lib/leopold/transactions";

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
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-money-title">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Add money</span>
            <h2 id="add-money-title">Make savings private</h2>
          </div>
          <button onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="stepper" aria-label={`Step ${step} of 4`}>
          {[1, 2, 3, 4].map((item) => (
            <span key={item} className={item <= step ? "active" : ""} />
          ))}
        </div>
        {auth.accountStatus === "AUTH_LOADING" || auth.financialWalletMetadata.status === "LOADING" ? (
          <div className="card" role="status" data-testid="account-metadata-loading">
            <span className="badge neutral">Loading account</span>
            <h3>Resolving verified wallet information</h3>
            <p className="subtle">No wallet command will run until account metadata finishes loading.</p>
          </div>
        ) : auth.accountStatus === "SIGNED_OUT" ? (
          <div className="card" role="status">
            <span className="badge neutral">Account sign-in required</span>
            <h3>Enter your Leopold account</h3>
            <a className="button" href="/login">
              Continue to sign in
            </a>
          </div>
        ) : auth.accountStatus === "SIGNED_IN_PROFILE_INCOMPLETE" ? (
          <div className="card" role="status">
            <span className="badge neutral">Account signed in</span>
            <h3>Complete required account information</h3>
            <button className="button" onClick={auth.openProfileCompletion}>
              Complete account information
            </button>
          </div>
        ) : auth.financialWalletMetadata.status === "ERROR" || auth.financialWalletMetadata.status === "UNAVAILABLE" ? (
          <div className="card" role="alert">
            <span className="badge neutral">Wallet metadata unavailable</span>
            <h3>Financial actions are paused</h3>
            <p className="subtle">No verified wallet metadata has been changed.</p>
          </div>
        ) : walletState === "BOOTSTRAPPING" ? (
          <div className="card" role="status" data-testid="network-checking">
            <span className="badge neutral">Checking wallet network</span>
            <h3>Confirm Ethereum Sepolia</h3>
            <p className="subtle">
              Financial actions remain disabled until Leopold confirms the active signing wallet.
            </p>
          </div>
        ) : walletState === "WRONG_NETWORK" ? (
          <div className="card" role="alert" data-testid="wrong-network">
            <span className="badge neutral">Wrong network</span>
            <h3>Switch to Ethereum Sepolia</h3>
            <p className="subtle">
              No financial transaction will be simulated or sent while your wallet is on another chain.
            </p>
            <button className="button" disabled={busy} onClick={() => void walletIdentity.switchToSepolia()}>
              Switch to Sepolia
            </button>
          </div>
        ) : walletState === "CONNECTING" ? (
          <div className="card" role="status" data-testid="wallet-connecting">
            <span className="badge neutral">Connecting wallet</span>
            <h3>
              {walletIdentity.walletSession.reason === "ACCOUNT_SELECTION_REQUIRED"
                ? "Select your verified account"
                : "Connecting your verified wallet"}
            </h3>
            <p className="subtle">
              {walletIdentity.walletSession.reason === "ACCOUNT_SELECTION_REQUIRED"
                ? "Choose the verified account in Rabby or MetaMask, then continue."
                : "This bounded connection attempt will finish without a page refresh."}
            </p>
            {walletIdentity.walletSession.reason === "ACCOUNT_SELECTION_REQUIRED" ? (
              <button className="button" onClick={() => void walletIdentity.connectVerifiedWallet()}>
                I&apos;ve selected the account
              </button>
            ) : null}
          </div>
        ) : healthState === "WALLET_RPC_UNAVAILABLE" && walletState === "CONNECTED" ? (
          <div className="card" role="alert" data-testid="wallet-rpc-unavailable">
            <span className="badge neutral">Wallet RPC unavailable</span>
            <h3>Your wallet&apos;s Sepolia connection isn&apos;t working</h3>
            <p className="subtle">
              Leopold is online, but your wallet cannot currently reach Ethereum Sepolia. Financial actions are paused.
            </p>
            <button className="button" onClick={() => void financial.retryNetworkHealth()} disabled={busy}>
              Retry network
            </button>
          </div>
        ) : healthState === "APP_RPC_UNAVAILABLE" && walletState === "CONNECTED" ? (
          <div className="card" role="alert" data-testid="app-rpc-unavailable">
            <span className="badge neutral">Leopold RPC unavailable</span>
            <h3>Leopold&apos;s Sepolia service is unavailable</h3>
            <p className="subtle">Financial actions are paused until Leopold&apos;s public Sepolia service responds.</p>
            <button className="button" onClick={() => void financial.retryNetworkHealth()} disabled={busy}>
              Retry network
            </button>
          </div>
        ) : walletState === "CONNECTED" && (healthState === "NOT_CHECKED" || healthState === "CHECKING") ? (
          <div className="card" role="status" data-testid="network-health-checking">
            <span className="badge neutral">Checking Sepolia service</span>
            <h3>Your wallet session is connected</h3>
            <p className="subtle">Financial actions will resume when the bounded network check finishes.</p>
          </div>
        ) : (walletState === "DISCONNECTED" || walletState === "ERROR") && auth.financialWallet ? (
          <div className="card" role="alert" data-testid="wallet-disconnected">
            <span className="badge neutral">Wallet disconnected</span>
            <h3>Reconnect your verified financial wallet</h3>
            <p className="subtle">This Leopold account already has a verified financial wallet.</p>
            <button className="button" onClick={() => void walletIdentity.connectVerifiedWallet()}>
              Reconnect verified wallet
            </button>
          </div>
        ) : healthState === "UNKNOWN" && walletState === "CONNECTED" ? (
          <div className="card" role="alert" data-testid="network-health-unknown">
            <span className="badge neutral">Network health unavailable</span>
            <h3>Confirm your Sepolia connection</h3>
            <p className="subtle">Leopold could not confirm the active wallet and public Sepolia connections.</p>
            <button className="button" onClick={() => void financial.retryNetworkHealth()} disabled={busy}>
              Retry network
            </button>
          </div>
        ) : !canUseWrapper ? (
          <div className="card" role="status">
            <span className="badge neutral">Wallet authorization required</span>
            <h3>Connect your financial wallet</h3>
            <p className="subtle">
              Your wallet controls your savings. Leopold does not hold your funds or create an embedded wallet.
            </p>
            {auth.financialWalletMetadata.status === "NONE" ? (
              <button className="button" onClick={auth.openWalletLink}>
                Link financial wallet
              </button>
            ) : auth.financialWalletMetadata.status === "PRESENT" ? (
              <button className="button" onClick={() => void walletIdentity.connectVerifiedWallet()}>
                Reconnect verified wallet
              </button>
            ) : (
              <span className="subtle">Wallet recovery is not available in this state.</span>
            )}
            {auth.authError ? (
              <div className="error" role="alert">
                {auth.authError}
              </div>
            ) : null}
          </div>
        ) : null}
        {canUseWrapper && step === 1 ? (
          <>
            <p className="subtle">Public USDC balance</p>
            <div className="stat">
              {financial.usdcBalance === null ? "Unavailable" : `${formatUsdcAmount(financial.usdcBalance)} USDC`}
            </div>
            <p className="subtle">Need funds? The official Compound Sepolia faucet supplies canonical Circle USDC.</p>
            <div className="form-row">
              <button
                className="button secondary"
                data-testid="get-usdc"
                disabled={busy}
                onClick={() => {
                  void financial.acquireUsdc().catch(() => undefined);
                }}
              >
                Get Test USDC
              </button>
              <button className="button" onClick={() => setStep(2)} disabled={!canUseWrapper || busy}>
                Continue
              </button>
            </div>
          </>
        ) : null}
        {canUseWrapper && step === 2 ? (
          <>
            <label className="card-label" htmlFor="private-amount">
              Amount
            </label>
            <input
              id="private-amount"
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <p className="subtle">
              USDC uses 6 decimal places. Leopold approves only this exact amount when approval is needed.
            </p>
            <button className="button" onClick={() => setStep(3)}>
              Review
            </button>
          </>
        ) : null}
        {canUseWrapper && step === 3 ? (
          <>
            <div className="card">
              <div className="card-label">You are making private</div>
              <div className="stat">{amount || "0"} USDC</div>
              <div className="subtle">Your wallet may ask for approval first, then the Make Private transaction.</div>
            </div>
            <button
              className="button"
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
            <div className="card">
              <span className="badge">Ready</span>
              <h3>Private USDC is ready</h3>
              <p className="subtle">
                Choose a vault whenever you’re ready. Saving and entering a prize round are separate actions.
              </p>
            </div>
            <button className="button" onClick={onClose}>
              Choose a vault
            </button>
          </>
        ) : null}
        {financial.txStage !== "ready" ? (
          <div className="tx-status" role="status" aria-live="polite">
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
    </div>
  );
}
