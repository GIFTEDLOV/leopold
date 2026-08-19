"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type FormEvent, type ReactNode, useState } from "react";
import { useAuth } from "./auth-provider";
import { useWalletIdentity } from "./wallet-identity-provider";
import { normalizeEmail } from "@/lib/auth/email";

function AuthFrame({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <main className="landing">
      <div className="auth-card">
        <Link className="brand" href="/">
          <span className="brand-mark">L</span>Leopold
        </Link>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
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
    <AuthFrame eyebrow="Private prize savings" title="Your Leopold account, your wallet">
      <p className="subtle">
        Use email to create your Leopold identity. When you choose to save, you will explicitly verify the external
        wallet that controls your funds.
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
    </AuthFrame>
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
    <AuthFrame eyebrow="Welcome to Leopold" title="Finish your profile">
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
      ) : (
        <div className="card">
          <span className="badge">Email verified</span>
          <h2>{auth.username ?? "Profile ready"}</h2>
          <p className="subtle">
            You can enter Leopold’s shell now. A verified external wallet is required for savings.
          </p>
        </div>
      )}
      {auth.emailVerified &&
      (auth.readiness === "WALLET_REQUIRED" || (auth.financialWallet && walletIdentity.identity.state !== "READY")) ? (
        <button
          className="button secondary"
          onClick={() => {
            if (walletIdentity.identity.recoveryAction === "SWITCH_TO_VERIFIED_WALLET")
              void walletIdentity.switchToVerifiedWallet();
            else if (walletIdentity.identity.recoveryAction === "SWITCH_TO_SEPOLIA")
              void walletIdentity.switchToSepolia();
            else if (auth.financialWallet) void walletIdentity.reconnectVerifiedWallet();
            else auth.openWalletLink();
          }}
          type="button"
        >
          {auth.financialWallet
            ? walletIdentity.identity.recoveryAction === "SWITCH_TO_SEPOLIA"
              ? "Switch to Sepolia"
              : walletIdentity.identity.recoveryAction === "SWITCH_TO_VERIFIED_WALLET"
                ? "Switch to verified wallet"
                : "Reconnect verified wallet"
            : "Connect wallet now"}
        </button>
      ) : null}
      <Link className="button secondary" href="/app">
        Enter Leopold shell
      </Link>
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
