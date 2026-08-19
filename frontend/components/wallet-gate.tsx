"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import { useFinancial } from "./financial-provider";
import { deriveWalletGateMode } from "@/lib/auth/recovery";

export function WalletGate({ children }: { children: ReactNode }) {
  const financial = useFinancial();
  const auth = useAuth();
  const mode = deriveWalletGateMode(auth.accountStatus, auth.financialWalletMetadata.status);
  if (mode === "AUTH_LOADING")
    return (
      <div className="wallet-gate" data-testid="auth-initializing">
        <span className="brand-mark">L</span>
        <h2>Loading your Leopold account</h2>
        <p>Financial actions stay disabled until your authenticated wallet is ready.</p>
      </div>
    );
  if (mode === "SIGNED_OUT")
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
  if (mode === "PROFILE_INCOMPLETE")
    return (
      <div className="wallet-gate" data-testid="profile-incomplete">
        <span className="brand-mark">L</span>
        <h2>Complete required account information</h2>
        <p>
          Your Leopold account is signed in. Complete the remaining profile requirements before using financial or
          private actions.
        </p>
        {!auth.emailVerified || !auth.username ? (
          <Link className="button" href="/onboarding">
            Complete Leopold profile
          </Link>
        ) : (
          <button className="button" onClick={auth.openProfileCompletion}>
            Complete account information
          </button>
        )}
      </div>
    );
  if (mode === "FINANCIAL_METADATA_LOADING")
    return (
      <div className="wallet-gate" data-testid="financial-metadata-loading">
        <span className="brand-mark">L</span>
        <h2>Loading verified wallet information</h2>
        <p>Leopold is resolving this account&apos;s existing financial-wallet metadata.</p>
      </div>
    );
  if (mode === "FINANCIAL_METADATA_ERROR")
    return (
      <div className="wallet-gate" data-testid="financial-metadata-error">
        <span className="brand-mark">L</span>
        <h2>Financial-wallet metadata unavailable</h2>
        <p>Your account remains signed in. Financial actions are paused and no metadata has been changed.</p>
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
  return children;
}
