"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useFinancial } from "@/components/financial-provider";
import { useWalletIdentity } from "@/components/wallet-identity-provider";

export default function ProfilePage() {
  const financial = useFinancial();
  const auth = useAuth();
  const walletIdentity = useWalletIdentity();
  const router = useRouter();
  const [amount, setAmount] = useState("1");
  const walletMismatch = Boolean(walletIdentity.identity.state === "WALLET_MISMATCH");
  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <h1>Profile</h1>
          <p>Your Leopold identity stays offchain; your external wallet controls the financial state.</p>
        </div>
      </div>
      <div className="grid two">
        <article className="card">
          <h2>Leopold account</h2>
          <div className="list-row">
            <div className="list-main">
              <strong>Username</strong>
              <span>Offchain application identity</span>
            </div>
            <span>{auth.username ?? "Incomplete"}</span>
          </div>
          <div className="list-row">
            <div className="list-main">
              <strong>Email</strong>
              <span>{auth.emailVerified ? "Verified" : "Verification required"}</span>
            </div>
            <span>{auth.email ?? "Not connected"}</span>
          </div>
          <div className="list-row">
            <div className="list-main">
              <strong>Financial wallet</strong>
              <span>{auth.financialWallet ? "Verified external wallet" : "Not linked"}</span>
            </div>
            <span>
              {auth.financialWallet
                ? `${auth.financialWallet.slice(0, 6)}…${auth.financialWallet.slice(-4)}`
                : "Required"}
            </span>
          </div>
          <div className="list-row">
            <div className="list-main">
              <strong>Connected wallet</strong>
              <span>
                {walletIdentity.identity.connectedAddress
                  ? walletMismatch
                    ? "Different from your verified financial wallet"
                    : walletIdentity.identity.state === "READY"
                      ? "Ownership verified"
                      : "Signature required"
                  : "Disconnected"}
              </span>
            </div>
            <span>
              {walletIdentity.identity.connectedAddress
                ? `${walletIdentity.identity.connectedAddress.slice(0, 6)}…${walletIdentity.identity.connectedAddress.slice(-4)}`
                : "Not connected"}
            </span>
          </div>
          <div className="form-row">
            <button className="button secondary" onClick={financial.disconnectWallet}>
              Disconnect wallet
            </button>
            <button className="button secondary" onClick={() => void auth.signOut().then(() => router.push("/login"))}>
              Sign out
            </button>
          </div>
        </article>
        <article className="card">
          <h2>Linked accounts</h2>
          <div className="list-row">
            <div className="list-main">
              <strong>X / Twitter</strong>
              <span>Optional identity enhancement; never a financial signer</span>
            </div>
            {auth.xEnabled ? (
              <button
                className="button secondary"
                onClick={() => void (auth.xLinked ? auth.unlinkX() : auth.linkX()).catch(() => undefined)}
              >
                {auth.xLinked ? "Linked · Unlink" : "Link X"}
              </button>
            ) : (
              <span className="badge neutral">Unavailable</span>
            )}
          </div>
          {auth.authError ? (
            <div className="error" role="alert">
              {auth.authError}
            </div>
          ) : null}
        </article>
        <article className="card">
          <h2>Privacy preferences</h2>
          <div className="list-row">
            <div className="list-main">
              <strong>Default reveal behavior</strong>
              <span>Private values require a deliberate reveal each session</span>
            </div>
            <span className="badge">Hidden</span>
          </div>
          <p className="subtle">
            Decrypted balances and results are kept only in client memory and cleared on wallet or network change.
          </p>
        </article>
        <article className="card">
          <h2>Make Public</h2>
          <p className="subtle">
            Request conversion of Private USDC back to public USDC. Completion requires authenticated asynchronous
            finalization.
          </p>
          <div className="form-row">
            <input
              className="input"
              aria-label="Private USDC amount to make public"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
            />
            <button
              className="button secondary"
              disabled={walletIdentity.identity.state !== "READY" || !financial.financialActionsEnabled}
              onClick={() => {
                void financial.makePublic(amount).catch(() => undefined);
              }}
            >
              Make Public
            </button>
          </div>
          {financial.txStage !== "ready" ? <div className="tx-status">{financial.txLabel}</div> : null}
        </article>
      </div>
    </div>
  );
}
