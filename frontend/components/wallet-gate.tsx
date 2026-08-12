"use client";

import type { ReactNode } from "react";
import { useFinancial } from "./financial-provider";

export function WalletGate({ children }: { children: ReactNode }) {
  const financial = useFinancial();
  if (!financial.connected)
    return (
      <div className="wallet-gate">
        <span className="brand-mark">L</span>
        <h2>Connect your wallet</h2>
        <p>
          Your wallet is your financial account for this phase. Leopold never asks for email, username, or social
          sign-in.
        </p>
        <button
          className="button"
          onClick={() => {
            void financial.connectWallet().catch(() => undefined);
          }}
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
  if (financial.wrongNetwork)
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
  return children;
}
