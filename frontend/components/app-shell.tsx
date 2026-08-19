"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AddMoneyModal } from "./add-money-modal";
import { useAuth } from "./auth-provider";
import { useFinancial } from "./financial-provider";
import { addMoneyButtonDisabled } from "@/lib/auth/hydration";

const navigation = [
  ["Dashboard", "/app", "⌂"],
  ["Vaults", "/app/vaults", "▥"],
  ["Prizes", "/app/prizes", "◇"],
  ["Activity", "/app/activity", "↗"],
  ["Rewards", "/app/rewards", "✦"],
  ["Profile", "/app/profile", "○"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const financial = useFinancial();
  const auth = useAuth();
  const clientReady = auth.clientReady;
  const [addMoney, setAddMoney] = useState(false);
  const healthState = financial.networkHealth.state;
  const networkLabel =
    healthState === "CHECKING"
      ? "Checking wallet network"
      : healthState === "IDLE"
        ? "Wallet setup required"
        : healthState === "WALLET_DISCONNECTED"
          ? "Wallet disconnected"
          : healthState === "WALLET_MISMATCH"
            ? "Wrong wallet"
            : healthState === "WRONG_NETWORK"
              ? "Wrong network — switch to Sepolia"
              : healthState === "WALLET_RPC_UNAVAILABLE"
                ? "Wallet RPC unavailable"
                : healthState === "APP_RPC_UNAVAILABLE"
                  ? "Leopold RPC unavailable"
                  : healthState === "UNKNOWN"
                    ? "Network health unavailable"
                    : "Ethereum Sepolia";
  const networkIsHealthy = healthState === "HEALTHY";
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">L</span>Leopold
        </Link>
        <nav className="nav-list" aria-label="Primary navigation">
          {navigation.map(([label, href, icon]) => (
            <Link
              key={href}
              className={`nav-link ${pathname === href || (href !== "/app" && pathname.startsWith(href)) ? "active" : ""}`}
              href={href}
            >
              <span className="nav-icon" aria-hidden="true">
                {icon}
              </span>
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          Private Prize Savings
          <br />
          <Link href="/app/help">Help &amp; support</Link> · <Link href="/transparency">Transparency</Link>
        </div>
      </aside>
      <main className="app-main">
        <header className="topbar">
          <div className="network-pill">
            <span className={`dot ${networkIsHealthy ? "" : "bad"}`} />
            {networkLabel}
          </div>
          <button
            className="account-pill"
            onClick={() => {
              if (!clientReady) return;
              if (financial.connected) financial.disconnectWallet();
              else if (auth.authenticated && auth.financialWallet)
                void auth.reconnectFinancialWallet().catch(() => undefined);
              else if (auth.authenticated) auth.openWalletLink();
              else void financial.connectWallet().catch(() => undefined);
            }}
            disabled={!clientReady}
          >
            {clientReady ? financial.accountLabel : "Not connected"}
          </button>
          <button
            className="button"
            onClick={() => setAddMoney(true)}
            disabled={addMoneyButtonDisabled(clientReady, auth.authenticated, financial.fixture)}
          >
            + Add Money
          </button>
        </header>
        {healthState === "WALLET_DISCONNECTED" ||
        healthState === "WALLET_MISMATCH" ||
        healthState === "WALLET_RPC_UNAVAILABLE" ||
        healthState === "APP_RPC_UNAVAILABLE" ||
        healthState === "UNKNOWN" ? (
          <div className="inline-notice" role="alert">
            <strong>
              {healthState === "WALLET_DISCONNECTED"
                ? "Connect your verified financial wallet to continue."
                : healthState === "WALLET_MISMATCH"
                  ? "Switch back to your verified financial wallet to continue."
                  : healthState === "WALLET_RPC_UNAVAILABLE"
                    ? "Your wallet's Sepolia connection isn't working."
                    : healthState === "APP_RPC_UNAVAILABLE"
                      ? "Leopold's Sepolia service is currently unavailable."
                      : "Network health could not be confirmed."}
            </strong>
            <span>
              {healthState === "WALLET_DISCONNECTED"
                ? "Financial and private actions remain paused until your verified wallet is connected."
                : healthState === "WALLET_MISMATCH"
                  ? `Verified: ${auth.financialWallet ? `${auth.financialWallet.slice(0, 6)}…${auth.financialWallet.slice(-4)}` : "Not linked"} · Connected: ${financial.accountLabel}`
                  : healthState === "WALLET_RPC_UNAVAILABLE"
                    ? "Leopold is online, but your wallet cannot currently reach Ethereum Sepolia. Choose another Sepolia RPC in your wallet or use another wallet."
                    : healthState === "APP_RPC_UNAVAILABLE"
                      ? "Leopold cannot currently reach its configured public Sepolia service. Financial actions remain paused."
                      : "Financial actions remain paused until both the wallet and Leopold's public Sepolia connection are confirmed."}
            </span>
            {auth.authError ? <span className="error">{auth.authError}</span> : null}
            {healthState === "WALLET_MISMATCH" ? (
              <button
                className="button secondary"
                onClick={() => void auth.reconnectFinancialWallet().catch(() => undefined)}
              >
                Switch to verified wallet
              </button>
            ) : healthState === "WALLET_DISCONNECTED" && auth.financialWallet ? (
              <button
                className="button secondary"
                onClick={() => void auth.reconnectFinancialWallet().catch(() => undefined)}
              >
                Reconnect verified wallet
              </button>
            ) : healthState !== "WALLET_DISCONNECTED" ? (
              <button className="button secondary" onClick={() => void financial.retryNetworkHealth()}>
                Retry connection
              </button>
            ) : null}
            {healthState === "WALLET_RPC_UNAVAILABLE" ? (
              <details>
                <summary>How to fix</summary>
                <p>
                  In MetaMask, open Networks → Sepolia → Edit → Default RPC URL. Choose or add a working Sepolia RPC.
                  The tested hackathon option is <code>https://ethereum-sepolia-rpc.publicnode.com</code>, but you may
                  use any working provider.
                </p>
              </details>
            ) : null}
            {financial.networkHealth.technicalDetail ? (
              <details>
                <summary>Technical detail</summary>
                <code>{financial.networkHealth.technicalDetail}</code>
              </details>
            ) : null}
          </div>
        ) : null}
        {children}
      </main>
      {addMoney ? <AddMoneyModal onClose={() => setAddMoney(false)} /> : null}
    </div>
  );
}
