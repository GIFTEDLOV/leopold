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

function shortAddress(address: string | null): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const financial = useFinancial();
  const auth = useAuth();
  const walletIdentity = useWalletIdentity();
  const session = walletIdentity.walletSession;
  const health = walletIdentity.networkHealth;
  const recovery = walletIdentity.recovery;
  const clientReady = auth.clientReady;
  const [addMoney, setAddMoney] = useState(false);
  const [walletMenu, setWalletMenu] = useState(false);

  const networkLabel =
    auth.accountStatus === "AUTH_LOADING"
      ? "Loading account"
      : auth.accountStatus === "SIGNED_OUT"
        ? "Account sign-in required"
        : auth.accountStatus === "SIGNED_IN_PROFILE_INCOMPLETE"
          ? "Account setup required"
          : auth.financialWalletMetadata.status === "LOADING"
            ? "Loading wallet information"
            : auth.financialWalletMetadata.status === "NONE"
              ? "Financial wallet not linked"
              : session.status === "BOOTSTRAPPING"
                ? "Loading wallet session"
                : session.status === "DISCONNECTED"
                  ? "Wallet disconnected"
                  : session.status === "CONNECTING"
                    ? "Connecting wallet"
                    : session.status === "WRONG_NETWORK"
                      ? "Wrong network — switch to Sepolia"
                      : session.status === "ERROR"
                        ? "Wallet connection error"
                        : health.state === "WALLET_RPC_UNAVAILABLE"
                          ? "Wallet RPC unavailable"
                          : health.state === "APP_RPC_UNAVAILABLE"
                            ? "Leopold RPC unavailable"
                            : health.state === "UNKNOWN"
                              ? "Network health unavailable"
                              : "Ethereum Sepolia";
  const networkIsHealthy = session.status === "CONNECTED" && health.state === "HEALTHY";
  const headerWalletLabel =
    auth.accountStatus === "AUTH_LOADING"
      ? "Checking…"
      : auth.accountStatus === "SIGNED_OUT"
        ? "Signed out"
        : auth.accountStatus === "SIGNED_IN_PROFILE_INCOMPLETE"
          ? "Account setup"
          : auth.financialWalletMetadata.status === "LOADING"
            ? "Checking…"
            : auth.financialWalletMetadata.status === "NONE"
              ? "Not linked"
              : session.status === "BOOTSTRAPPING"
                ? "Checking…"
                : session.status === "DISCONNECTED" || session.status === "ERROR"
                  ? "Disconnected"
                  : session.status === "CONNECTING"
                    ? "Connecting…"
                    : session.status === "WRONG_NETWORK"
                      ? `Wrong network · ${shortAddress(session.verifiedAddress)}`
                      : shortAddress(session.address);

  const recoveryButton = (() => {
    switch (recovery.action) {
      case "LINK_FINANCIAL_WALLET":
        return (
          <button className="button secondary" onClick={auth.openWalletLink}>
            Link financial wallet
          </button>
        );
      case "CONFIRM_FINANCIAL_WALLET":
        return (
          <button className="button secondary" onClick={() => void auth.confirmCurrentWalletAsFinancial()}>
            Confirm financial wallet
          </button>
        );
      case "CONNECT_VERIFIED_WALLET":
        return (
          <button className="button secondary" onClick={() => void walletIdentity.connectVerifiedWallet()}>
            Connect verified wallet
          </button>
        );
      case "CONFIRM_ACCOUNT_SELECTION":
        return (
          <button className="button secondary" onClick={() => void walletIdentity.connectVerifiedWallet()}>
            I&apos;ve selected the account
          </button>
        );
      case "CANCEL_CONNECTION":
        return (
          <button className="button secondary" onClick={walletIdentity.disconnectLeopoldWallet}>
            Cancel
          </button>
        );
      case "SWITCH_TO_SEPOLIA":
        return (
          <button className="button secondary" onClick={() => void walletIdentity.switchToSepolia()}>
            Switch to Ethereum Sepolia
          </button>
        );
      case "RETRY_PROVIDER":
        return (
          <button className="button secondary" onClick={() => void walletIdentity.connectVerifiedWallet()}>
            Retry provider connection
          </button>
        );
      case "RETRY_NETWORK":
        return (
          <button className="button secondary" onClick={() => void walletIdentity.retryNetworkHealth()}>
            Retry network
          </button>
        );
      case "NONE":
      case "ERROR":
        return null;
    }
  })();

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
          <div className="account-control">
            <button
              className="account-pill"
              onClick={() => setWalletMenu((open) => !open)}
              disabled={!clientReady}
              aria-expanded={walletMenu}
              aria-haspopup="menu"
            >
              {headerWalletLabel}
            </button>
            {walletMenu ? (
              <div className="account-popover" role="menu">
                <strong>Financial wallet</strong>
                <span>{shortAddress(session.verifiedAddress)}</span>
                <strong>Wallet session</strong>
                <span>
                  {session.status === "CONNECTED" || session.status === "WRONG_NETWORK" ? "Connected" : "Disconnected"}
                </span>
                {session.status === "CONNECTED" || session.status === "WRONG_NETWORK" ? (
                  <>
                    <strong>Network</strong>
                    <span>{session.status === "CONNECTED" ? "Ethereum Sepolia" : "Wrong network"}</span>
                    <button
                      className="button secondary small"
                      role="menuitem"
                      onClick={() => {
                        walletIdentity.disconnectLeopoldWallet();
                        setWalletMenu(false);
                      }}
                    >
                      Disconnect
                    </button>
                  </>
                ) : auth.financialWallet ? (
                  <button
                    className="button secondary small"
                    role="menuitem"
                    onClick={() => void walletIdentity.connectVerifiedWallet()}
                  >
                    Reconnect verified wallet
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            className="button"
            onClick={() => setAddMoney(true)}
            disabled={addMoneyButtonDisabled(clientReady, auth.accountStatus === "SIGNED_IN_READY", financial.fixture)}
          >
            + Add Money
          </button>
        </header>

        {recovery.visible ? (
          <div className="inline-notice" role="alert">
            <strong>{recovery.message}</strong>
            <span>{recovery.detail}</span>
            {auth.authError ? <span className="error">{auth.authError}</span> : null}
            {recoveryButton}
            {health.state === "WALLET_RPC_UNAVAILABLE" ? (
              <details>
                <summary>How to fix</summary>
                <p>
                  In MetaMask, open Networks → Sepolia → Edit → Default RPC URL. Choose or add a working Sepolia RPC.
                  The tested option is <code>https://ethereum-sepolia-rpc.publicnode.com</code>.
                </p>
              </details>
            ) : null}
            {session.technicalDetail || health.technicalDetail ? (
              <details>
                <summary>Technical detail</summary>
                <code>{session.technicalDetail ?? health.technicalDetail}</code>
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
