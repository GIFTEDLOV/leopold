"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AddMoneyModal } from "./add-money-modal";
import { useAuth } from "./auth-provider";
import { useFinancial } from "./financial-provider";
import { useWalletIdentity } from "./wallet-identity-provider";
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
  const walletIdentity = useWalletIdentity();
  const clientReady = auth.clientReady;
  const [addMoney, setAddMoney] = useState(false);
  const identityState = walletIdentity.identity.state;
  const healthState = walletIdentity.identity.networkHealth.state;
  const identityNeedsRecovery =
    identityState === "UNINITIALIZED" &&
    auth.clientReady &&
    Boolean(auth.financialWallet) &&
    walletIdentity.identity.reason !== "AUTH_INITIALIZING" &&
    healthState === "NOT_CHECKED";
  const networkLabel =
    identityState === "UNINITIALIZED" && !auth.financialWallet
      ? "Wallet setup required"
      : identityState === "UNINITIALIZED" && healthState === "CHECKING"
        ? "Checking wallet network"
        : identityState === "DISCONNECTED"
          ? "Disconnected"
          : identityState === "WALLET_MISMATCH"
            ? "Wrong wallet"
            : identityState === "WRONG_NETWORK"
              ? "Wrong network — switch to Sepolia"
              : healthState === "WALLET_RPC_UNAVAILABLE"
                ? "Wallet RPC unavailable"
                : healthState === "APP_RPC_UNAVAILABLE"
                  ? "Leopold RPC unavailable"
                  : healthState === "UNKNOWN"
                    ? "Network health unavailable"
                    : identityState === "READY"
                      ? "Ethereum Sepolia"
                      : "Checking wallet network";
  const networkIsHealthy = identityState === "READY";
  const headerWalletLabel =
    identityState === "DISCONNECTED"
      ? "Disconnected"
      : identityState === "WALLET_MISMATCH"
        ? `Wrong wallet · ${walletIdentity.identity.connectedAddress?.slice(0, 6)}…${walletIdentity.identity.connectedAddress?.slice(-4)}`
        : identityState === "UNINITIALIZED"
          ? clientReady
            ? "Checking…"
            : "Not connected"
          : walletIdentity.identity.verifiedAddress
            ? `${walletIdentity.identity.verifiedAddress.slice(0, 6)}…${walletIdentity.identity.verifiedAddress.slice(-4)}`
            : "Not connected";
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
              if (identityState === "READY") financial.disconnectWallet();
              else if (walletIdentity.identity.recoveryAction === "RECONNECT_VERIFIED_WALLET")
                void walletIdentity.reconnectVerifiedWallet();
              else if (walletIdentity.identity.recoveryAction === "SWITCH_TO_VERIFIED_WALLET")
                void walletIdentity.switchToVerifiedWallet();
              else if (walletIdentity.identity.recoveryAction === "SWITCH_TO_SEPOLIA")
                void walletIdentity.switchToSepolia();
              else if (auth.authenticated && auth.financialWallet) void walletIdentity.refreshWalletIdentity();
              else if (auth.authenticated) auth.openWalletLink();
              else void financial.connectWallet().catch(() => undefined);
            }}
            disabled={!clientReady}
          >
            {headerWalletLabel}
          </button>
          <button
            className="button"
            onClick={() => setAddMoney(true)}
            disabled={addMoneyButtonDisabled(clientReady, auth.authenticated, financial.fixture)}
          >
            + Add Money
          </button>
        </header>
        {identityState === "DISCONNECTED" ||
        identityState === "WALLET_MISMATCH" ||
        identityState === "WRONG_NETWORK" ||
        identityNeedsRecovery ||
        healthState === "WALLET_RPC_UNAVAILABLE" ||
        healthState === "APP_RPC_UNAVAILABLE" ||
        healthState === "UNKNOWN" ? (
          <div className="inline-notice" role="alert">
            <strong>
              {identityNeedsRecovery
                ? walletIdentity.identity.recoveryMessage
                : identityState === "DISCONNECTED"
                  ? "Connect your verified financial wallet to continue."
                  : identityState === "WALLET_MISMATCH"
                    ? "Switch back to your verified financial wallet to continue."
                    : identityState === "WRONG_NETWORK"
                      ? "Switch to Ethereum Sepolia to continue."
                      : healthState === "WALLET_RPC_UNAVAILABLE"
                        ? "Your wallet's Sepolia connection isn't working."
                        : healthState === "APP_RPC_UNAVAILABLE"
                          ? "Leopold's Sepolia service is currently unavailable."
                          : "Network health could not be confirmed."}
            </strong>
            <span>
              {identityNeedsRecovery
                ? "Leopold is waiting for the verified wallet connection to be synchronized."
                : identityState === "DISCONNECTED"
                  ? "Financial and private actions remain paused until your verified wallet is connected."
                  : identityState === "WALLET_MISMATCH"
                    ? `Verified: ${walletIdentity.identity.verifiedAddress?.slice(0, 6)}…${walletIdentity.identity.verifiedAddress?.slice(-4)} · Connected: ${walletIdentity.identity.connectedAddress?.slice(0, 6)}…${walletIdentity.identity.connectedAddress?.slice(-4)}`
                    : identityState === "WRONG_NETWORK"
                      ? "Leopold’s test financial operations only run on Sepolia. No transaction has been attempted."
                      : healthState === "WALLET_RPC_UNAVAILABLE"
                        ? "Leopold is online, but your wallet cannot currently reach Ethereum Sepolia. Choose another Sepolia RPC in your wallet or use another wallet."
                        : healthState === "APP_RPC_UNAVAILABLE"
                          ? "Leopold cannot currently reach its configured public Sepolia service. Financial actions remain paused."
                          : "Financial actions remain paused until both the wallet and Leopold's public Sepolia connection are confirmed."}
            </span>
            {auth.authError ? <span className="error">{auth.authError}</span> : null}
            {identityNeedsRecovery && walletIdentity.identity.recoveryAction === "SWITCH_TO_VERIFIED_WALLET" ? (
              <button className="button secondary" onClick={() => void walletIdentity.switchToVerifiedWallet()}>
                Switch to verified wallet
              </button>
            ) : identityState === "WALLET_MISMATCH" ? (
              <button className="button secondary" onClick={() => void walletIdentity.switchToVerifiedWallet()}>
                Switch to verified wallet
              </button>
            ) : identityState === "DISCONNECTED" && auth.financialWallet ? (
              <button className="button secondary" onClick={() => void walletIdentity.reconnectVerifiedWallet()}>
                Reconnect verified wallet
              </button>
            ) : identityState === "WRONG_NETWORK" ? (
              <button className="button secondary" onClick={() => void walletIdentity.switchToSepolia()}>
                Switch to Sepolia
              </button>
            ) : (
              <button className="button secondary" onClick={() => void financial.retryNetworkHealth()}>
                Retry connection
              </button>
            )}
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
            {walletIdentity.identity.networkHealth.technicalDetail || walletIdentity.identity.technicalDetail ? (
              <details>
                <summary>Technical detail</summary>
                <code>
                  {walletIdentity.identity.technicalDetail ?? walletIdentity.identity.networkHealth.technicalDetail}
                </code>
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
