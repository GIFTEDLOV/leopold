"use client";

import { useState } from "react";
import { formatUsdcAmount } from "@/lib/leopold/amounts";
import { useFinancial } from "./financial-provider";

export function AddMoneyModal({ onClose }: { onClose(): void }) {
  const financial = useFinancial();
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState("10");
  const busy = ["wallet", "submitted", "confirming", "private"].includes(financial.txStage);
  const canUseWrapper = financial.fixture || (financial.connected && !financial.wrongNetwork);
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
        {step === 1 ? (
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
        {step === 2 ? (
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
        {step === 3 ? (
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
        {step === 4 ? (
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
          <div className="error" role="alert">
            {financial.error.message}
          </div>
        ) : null}
      </div>
    </div>
  );
}
