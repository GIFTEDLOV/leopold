"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import { useFinancial } from "./financial-provider";
import { useWalletIdentity } from "./wallet-identity-provider";
import { getAuthHydrationPhase } from "@/lib/auth/hydration";

export function WalletGate({ children }: { children: ReactNode }) {
  const financial = useFinancial();
  const auth = useAuth();
  const walletIdentity = useWalletIdentity();
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
  if (auth.authenticated && walletIdentity.identity.recoveryAction === "LINK_WALLET")
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
  return children;
}
