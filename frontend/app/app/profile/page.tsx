"use client";

import { useState } from "react";
import { useFinancial } from "@/components/financial-provider";

export default function ProfilePage() {
  const financial = useFinancial();
  const [amount, setAmount] = useState("1");
  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <h1>Profile</h1>
          <p>Wallet and local privacy preferences for this browser.</p>
        </div>
      </div>
      <div className="grid two">
        <article className="card">
          <h2>Wallet</h2>
          <div className="list-row">
            <div className="list-main">
              <strong>Connected account</strong>
              <span>Financial account boundary</span>
            </div>
            <span>{financial.accountLabel}</span>
          </div>
          <div className="list-row">
            <div className="list-main">
              <strong>Network</strong>
              <span>Required for financial operations</span>
            </div>
            <span>Ethereum Sepolia</span>
          </div>
          <button className="button secondary" onClick={financial.disconnectWallet}>
            Disconnect wallet
          </button>
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
