"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import { useFinancial } from "./financial-provider";
import { getAuthHydrationPhase } from "@/lib/auth/hydration";
import { getFinancialWalletRecoveryAction } from "@/lib/auth/readiness";

export function WalletGate({ children }: { children: ReactNode }) {
  const financial = useFinancial();
  const auth = useAuth();
  const recoveryAction = getFinancialWalletRecoveryAction(
    auth.identity,
    financial.networkHealth.state === "WRONG_NETWORK"
      ? false
      : financial.networkHealth.state === "HEALTHY"
        ? true
        : null,
  );
  if (getAuthHydrationPhase(auth.clientReady) === "AUTH_INITIALIZING")
    return (
      <div className="wallet-gate" data-testid="auth-initializing">
        <span className="brand-mark">L</span>
        <h2>Loading your Leopold account</h2>
        <p>Financial actions stay disabled until your authenticated wallet is ready.</p>
      </div>
    );
  if (!auth.authenticated)
    return (
      <div className="wallet-gate">
        <span className="brand-mark">L</span>
        <h2>Enter your Leopold account</h2>
        <p>
          Start with email or your external wallet. Leopold never holds your private keys; a verified external wallet is
          still required for financial actions.
        </p>
        <Link className="button" href="/login">
          Continue to sign in
        </Link>
        {financial.error ? (
          <div className="error" role="alert">
            {financial.error.message}
          </div>
        ) : null}
      </div>
    );
  if (auth.readiness === "SESSION_EXPIRED" || auth.readiness === "ACCOUNT_CONFLICT")
    return (
      <div className="wallet-gate">
        <span className="brand-mark">L</span>
        <h2>{auth.readiness === "SESSION_EXPIRED" ? "Session expired" : "Account conflict"}</h2>
        <p>
          {auth.readiness === "SESSION_EXPIRED"
            ? "Sign in again to continue. Private values have been cleared."
            : "This credential belongs to another Leopold account. Sign in to that account before linking anything."}
        </p>
        <Link className="button" href="/login">
          Return to sign in
        </Link>
      </div>
    );
  if (!financial.connected && financial.fixture)
    return (
      <div className="wallet-gate">
        <span className="brand-mark">L</span>
        <h2>Connect your wallet</h2>
        <p>
          Your verified external wallet is the financial signer. The development fixture never creates an embedded
          wallet.
        </p>
        <button
          className="button"
          onClick={() => void financial.connectWallet().catch(() => undefined)}
          disabled={financial.connecting}
        >
          {financial.connecting ? "Connecting…" : "Connect Wallet"}
        </button>
        {financial.error ? (
          <div className="error" role="alert">
            {financial.error.message}
          </div>
        ) : null}
      </div>
    );
  if (auth.authenticated && auth.readiness === "WALLET_REQUIRED" && recoveryAction === "LINK_WALLET")
    return (
      <>
        <div className="inline-notice" role="status">
          <strong>Link your financial wallet to continue.</strong> Leopold has no verified financial wallet for this
          account yet.
          <button className="button secondary" onClick={auth.openWalletLink}>
            Link Wallet
          </button>
        </div>
        {children}
      </>
    );
  if (financial.networkHealth.state === "CHECKING")
    return (
      <div className="wallet-gate" data-testid="network-checking">
        <span className="brand-mark">L</span>
        <h2>Checking wallet network</h2>
        <p>Financial actions stay disabled until the active signing wallet is confirmed on Ethereum Sepolia.</p>
      </div>
    );
  if (financial.networkHealth.state === "WRONG_NETWORK")
    return (
      <div className="wallet-gate">
        <span className="brand-mark">L</span>
        <h2>Switch to Ethereum Sepolia</h2>
        <p>Leopold’s test financial operations only run on Sepolia. No transaction has been attempted.</p>
        <button
          className="button"
          onClick={() => {
            void financial.switchToSepolia().catch(() => undefined);
          }}
        >
          Switch to Sepolia
        </button>
        {financial.error ? (
          <div className="error" role="alert">
            {financial.error.message}
          </div>
        ) : null}
      </div>
    );
  if (!financial.connected && auth.authenticated && recoveryAction === "RECONNECT_WALLET")
    return (
      <>
        <div className="inline-notice" role="status">
          <strong>Reconnect your existing verified wallet to continue.</strong> Your Leopold financial wallet is already
          linked; reconnect that wallet instead of linking a new one.
          <button
            className="button secondary"
            onClick={() => void auth.reconnectFinancialWallet().catch(() => undefined)}
          >
            Reconnect verified wallet
          </button>
        </div>
        {children}
      </>
    );
  return children;
}
