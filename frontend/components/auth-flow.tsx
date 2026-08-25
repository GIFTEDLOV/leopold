"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type FormEvent, type ReactNode, useState } from "react";
import { useAuth } from "./auth-provider";
import { useWalletIdentity } from "./wallet-identity-provider";
import { normalizeEmail } from "@/lib/auth/email";
import { LoginShell } from "./login/login-shell";

function AuthFrame({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children: ReactNode }) {
  return (
    <LoginShell eyebrow={eyebrow} title={title}>
      {children}
    </LoginShell>
  );
}

export function LoginClient() {
  const auth = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (auth.authenticated && !auth.otpSent) router.push("/onboarding");
  }, [auth.authenticated, auth.otpSent, router]);

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await auth.requestEmailOtp(normalizeEmail(email));
    } catch (error) {
      setFormError(error instanceof Error && error.name === "EmailValidationError" ? error.message : null);
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await auth.verifyEmailOtp(otp);
      router.push("/onboarding");
    } catch {
      // The provider-specific error is mapped by AuthProvider.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <LoginShell>
      <p className="subtle">
        Sign in with email or prove ownership with your external wallet. No funds move until you choose to save.
      </p>
      {!auth.configured ? (
        <div className="card" role="status">
          <strong>Authentication setup required</strong>
          <p className="subtle">This environment has no Dynamic environment ID. No test or fake login is available.</p>
        </div>
      ) : null}
      {!auth.otpSent ? (
        <form className="auth-form" onSubmit={(event) => void requestOtp(event)}>
          <label className="card-label" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
          <button className="button" disabled={submitting || !auth.configured} type="submit">
            {submitting ? "Sending…" : "Continue with email"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={(event) => void verifyOtp(event)}>
          <label className="card-label" htmlFor="login-otp">
            Verification code
          </label>
          <input
            id="login-otp"
            className="input"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
            placeholder="Enter your code"
            required
          />
          <button className="button" disabled={submitting} type="submit">
            {submitting ? "Verifying…" : "Verify email"}
          </button>
          <button className="button secondary" type="button" onClick={() => void auth.resendEmailOtp()}>
            Send a new code
          </button>
        </form>
      )}
      <div className="auth-divider">or</div>
      <button
        className="button secondary"
        type="button"
        onClick={auth.openWalletAuthentication}
        disabled={!auth.configured}
      >
        Continue with wallet
      </button>
      {formError ? (
        <div className="error" role="alert">
          {formError}
        </div>
      ) : null}
      {auth.authError ? (
        <div className="error" role="alert">
          {auth.authError}
        </div>
      ) : null}
      <p className="subtle auth-footnote">
        Wallet authentication proves ownership; it does not create an embedded wallet or sign financial transactions for
        you.
      </p>
    </LoginShell>
  );
}

export function OnboardingClient() {
  const auth = useAuth();
  const walletIdentity = useWalletIdentity();
  const router = useRouter();
  const [username, setUsername] = useState(auth.username ?? "");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.saveUsername(username);
      router.push("/app");
    } catch {
      // The provider-specific error is mapped by AuthProvider.
    } finally {
      setSubmitting(false);
    }
  }

  async function requestEmail(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.requestEmailOtp(email);
    } catch {
      // The provider-specific error is mapped by AuthProvider.
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyEmail(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.verifyEmailOtp(otp);
    } catch {
      // The provider-specific error is mapped by AuthProvider.
    } finally {
      setSubmitting(false);
    }
  }

  if (!auth.authenticated) {
    return (
      <AuthFrame eyebrow="Welcome to Leopold" title="Sign in before setting up your profile">
        <p className="subtle">Your email identity and external financial wallet remain separate by design.</p>
        <Link className="button" href="/login">
          Continue to sign in
        </Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame eyebrow="Welcome to Leopold" title={<>Finish your <span>profile</span></>}>
      <p className="subtle">
        Choose a unique lowercase username. It stays offchain and is not a public mapping to your financial wallet.
      </p>
      {!auth.emailVerified ? (
        !auth.otpSent ? (
          <form className="auth-form" onSubmit={(event) => void requestEmail(event)}>
            <label className="card-label" htmlFor="wallet-first-email">
              Verified email
            </label>
            <input
              id="wallet-first-email"
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <button className="button" disabled={submitting || !auth.configured} type="submit">
              Send verification code
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={(event) => void verifyEmail(event)}>
            <label className="card-label" htmlFor="wallet-first-otp">
              Verification code
            </label>
            <input
              id="wallet-first-otp"
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              required
            />
            <button className="button" disabled={submitting} type="submit">
              Verify email
            </button>
            <button className="button secondary" type="button" onClick={() => void auth.resendEmailOtp()}>
              Send a new code
            </button>
          </form>
        )
      ) : auth.readiness === "PROFILE_INCOMPLETE" ? (
        <form className="auth-form" onSubmit={(event) => void saveProfile(event)}>
          <label className="card-label" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="input"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="your_username"
            minLength={3}
            maxLength={20}
            pattern="[a-z0-9_]{3,20}"
            required
          />
          <span className="subtle">3–20 characters: a–z, 0–9, underscore.</span>
          <button className="button" disabled={submitting} type="submit">
            {submitting ? "Saving…" : "Save username"}
          </button>
        </form>
      ) : auth.profileStatus === "INCOMPLETE" ? (
        <div className="card" role="status">
          <span className="badge">Account signed in</span>
          <h2>Complete required account information</h2>
          <p className="subtle">
            Dynamic is protecting this account until its remaining profile or security requirements are complete.
          </p>
          <button className="button" type="button" onClick={auth.openProfileCompletion}>
            Complete account information
          </button>
        </div>
      ) : (
        <div className="card profile-ready-card">
          <span className="badge">Email verified</span>
          <h2>{auth.username ?? "Profile ready"}</h2>
          <p className="subtle">
            You can enter Leopold’s shell now. A verified external wallet is required for savings.
          </p>
        </div>
      )}
      <div className="profile-actions">
        {auth.profileStatus === "COMPLETE" &&
        auth.emailVerified &&
        (auth.readiness === "WALLET_REQUIRED" ||
          (auth.financialWallet && walletIdentity.walletSession.status !== "CONNECTED")) ? (
          <button
            className="button secondary"
            onClick={() => {
              if (walletIdentity.walletSession.status === "WRONG_NETWORK") void walletIdentity.switchToSepolia();
              else if (auth.financialWalletMetadata.status === "PRESENT") void walletIdentity.connectVerifiedWallet();
              else if (auth.financialWalletMetadata.status === "NONE") {
                if (auth.canConfirmCurrentWalletAsFinancial) void auth.confirmCurrentWalletAsFinancial();
                else auth.openWalletLink();
              }
            }}
            type="button"
          >
            {auth.financialWallet
              ? walletIdentity.walletSession.status === "WRONG_NETWORK"
                ? "Switch to Sepolia"
                : walletIdentity.walletSession.status === "CONNECTING"
                  ? "Connecting wallet…"
                  : "Connect verified wallet"
              : auth.canConfirmCurrentWalletAsFinancial
                ? "Confirm financial wallet"
                : "Connect wallet now"}
          </button>
        ) : null}
        <Link className="button profile-primary" href="/app">
          Enter Leopold shell
        </Link>
      </div>
      {error ? (
        <div className="error" role="alert">
          {error}
        </div>
      ) : null}
      {auth.authError ? (
        <div className="error" role="alert">
          {auth.authError}
        </div>
      ) : null}
    </AuthFrame>
  );
}
