"use client";

import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AddMoneyModal } from "./add-money-modal";
import { useAuth } from "./auth-provider";
import { useFinancial } from "./financial-provider";
import { useWalletIdentity } from "./wallet-identity-provider";
import { addMoneyButtonDisabled } from "@/lib/auth/hydration";
import { V2_ADD_MONEY_EVENT, experienceForPath, type AppExperience } from "@/lib/ui/experience";
import { useExperience } from "./experience-provider";
import styles from "@/components/full-site/leopold-app-ui.module.css";

const classicNavigation = [
  ["Home", "/app/classic", "home"],
  ["Vaults", "/app/classic/vaults", "vaults"],
  ["Prizes", "/app/classic/prizes", "prizes"],
  ["Activity", "/app/classic/activity", "activity"],
  ["Rewards", "/app/classic/rewards", "rewards"],
  ["Profile", "/app/classic/profile", "profile"],
] as const;

const v2Navigation = [
  ["Overview", "/app", "home"],
  ["Draws", "/app/v2/draws", "prizes"],
  ["Activity", "/app/v2/activity", "activity"],
  ["Rewards", "/app/v2/rewards", "rewards"],
  ["Profile", "/app/profile", "profile"],
] as const;

type NavigationIcon = "home" | "vaults" | "prizes" | "activity" | "rewards" | "profile";

function NavIcon({ name }: { name: NavigationIcon }) {
  const common = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, strokeWidth: 1.7 };
  if (name === "home") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1Z" /></svg>;
  if (name === "vaults") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect {...common} x="3" y="4" width="18" height="16" rx="2" /><path {...common} d="M8 4v16M8 9h13M8 15h13" /></svg>;
  if (name === "prizes") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M8 4h8v4c0 3-1.8 5-4 5s-4-2-4-5V4Z" /><path {...common} d="M8 6H4v1c0 3 1.8 5 5 5M16 6h4v1c0 3-1.8 5-5 5M12 13v4M8 20h8M9 17h6" /></svg>;
  if (name === "activity") return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M4 13h4l2-6 4 11 2-5h4" /></svg>;
  if (name === "rewards") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect {...common} x="4" y="9" width="16" height="11" rx="1" /><path {...common} d="M3 9h18V6H3v3ZM12 6v14M12 6H8.5a2.5 2.5 0 1 1 2.5-2.5L12 6Zm0 0h3.5A2.5 2.5 0 1 0 13 3.5L12 6Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle {...common} cx="12" cy="8" r="4" /><path {...common} d="M4.5 21a7.5 7.5 0 0 1 15 0" /></svg>;
}

function shortAddress(address: string | null): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";
}

export function isNavigationItemActive(pathname: string, href: string): boolean {
  const isHomeRoute = href === "/app" || href === "/app/classic";
  return isHomeRoute ? pathname === href : pathname === href || pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const financial = useFinancial();
  const auth = useAuth();
  const walletIdentity = useWalletIdentity();
  const session = walletIdentity.walletSession;
  const health = walletIdentity.networkHealth;
  const recovery = walletIdentity.recovery;
  const showShellRecovery = recovery.visible && recovery.action !== "CONNECT_VERIFIED_WALLET";
  const clientReady = auth.clientReady;
  const [addMoney, setAddMoney] = useState(false);
  const [walletMenu, setWalletMenu] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const { experience, setExperience } = useExperience();
  const routeExperience = experienceForPath(pathname);
  const activeExperience: AppExperience = pathname === "/app" && experience === "v1" ? "v1" : routeExperience ?? experience;
  const isV2 = activeExperience === "v2";
  const navigation = isV2 ? v2Navigation : classicNavigation;

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

  const topbarContent = (
    <>
      <button
        className={styles.menuButton}
        type="button"
        onClick={() => setMobileOpen((open) => !open)}
        aria-controls="app-navigation"
        aria-expanded={mobileOpen}
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
      >
        ☰
      </button>
      <Link className={styles.networkBrand} href={isV2 ? "/app" : "/app/classic"} aria-label={`${isV2 ? "Prize Savings" : "Classic Vaults"} home. ${networkLabel}`}>
        <Image src="/marketing/leopold/leopold-monogram.png" width={24} height={24} alt="" aria-hidden="true" />
        <span>Leop<span>old</span></span>
      </Link>
      <div className={`${styles.topActions} account-control`}>
        <button
          className={`${styles.wallet} account-pill`}
          onClick={() => setWalletMenu((open) => !open)}
          disabled={!clientReady}
          aria-expanded={walletMenu}
          aria-haspopup="menu"
        >
          {headerWalletLabel}
        </button>
        {walletMenu ? (
          <div className="account-popover" role="menu">
            <strong>Experience</strong>
            <Link className={`account-experience-link ${activeExperience === "v2" ? "selected" : ""}`} role="menuitem" href="/app" onClick={() => { setExperience("v2"); setWalletMenu(false); }}>
              <span>Prize Savings</span>
              <small>Save and enter upcoming draws automatically</small>
            </Link>
            <Link className={`account-experience-link ${activeExperience === "v1" ? "selected" : ""}`} role="menuitem" href="/app/classic" onClick={() => { setExperience("v1"); setWalletMenu(false); }}>
              <span>Classic Vaults</span>
              <small>Choose Daily, Weekly, Monthly, or Boost</small>
            </Link>
            <span className="account-experience-note">Switching views never moves your money.</span>
            <Link className="account-profile-link" href="/app/profile" onClick={() => setWalletMenu(false)}>Profile &amp; settings</Link>
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
        {isV2 ? pathname === "/app" ? (
          <button className={styles.primaryButton} type="button" onClick={() => window.dispatchEvent(new Event(V2_ADD_MONEY_EVENT))}>
            + Add Money
          </button>
        ) : (
          <Link className={styles.primaryButton} href="/app#add-money">
            + Add Money
          </Link>
        ) : (
          <button
            className={styles.primaryButton}
            onClick={() => setAddMoney(true)}
            disabled={addMoneyButtonDisabled(clientReady, auth.accountStatus === "SIGNED_IN_READY", financial.fixture)}
          >
            + Add Money
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className={`${styles.frame} app-frame ${pathname === "/app/help" ? "" : styles.currencyGlow} ${isV2 ? styles.v2Frame : styles.v1Frame}`}>
      <a className={styles.skipApp} href="#app-content">Skip to content</a>
      <aside
        id="app-navigation"
        className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}
        onMouseEnter={() => setRailOpen(true)}
        onMouseLeave={() => setRailOpen(false)}
        onFocus={() => setRailOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setRailOpen(false);
        }}
      >
        <Link className={styles.brand} href="/">
          <Image src="/marketing/leopold/leopold-monogram.png" width={30} height={30} alt="" aria-hidden="true" />
          <span>Leop<span>old</span></span>
        </Link>
        <p className={styles.navLabel}>PRIVATE SAVINGS</p>
        <nav className={styles.nav} aria-label="Authenticated application">
          {navigation.map(([label, href, icon]) => {
            const active = isNavigationItemActive(pathname, href);
            return (
              <Link
                key={href}
                className={active ? styles.active : ""}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <i><NavIcon name={icon} /></i>
                <span>{label}</span>
                <b aria-hidden="true">↗</b>
              </Link>
            );
          })}
        </nav>
        <div className={styles.sidebarFoot}>
          <p>Private values stay hidden until you deliberately reveal them.</p>
          <Link href="/app/help">Help &amp; support</Link>
          <Link href="/transparency">Protocol transparency</Link>
          <ThemeToggle className={styles.sidebarThemeToggle} />
        </div>
      </aside>
      {mobileOpen ? <button className={styles.mobileScrim} type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} /> : null}
      <div className={styles.mainColumn}>
        <div className={`${styles.contentBackdrop} ${railOpen || mobileOpen ? styles.contentBackdropOpen : ""}`} aria-hidden="true" />
        <div className={styles.v2TopControls}>{topbarContent}</div>
        <main id="app-content" className={isV2 ? `${styles.content} ${styles.v2Content}` : undefined}>
          {showShellRecovery ? (
            <div className={`${styles.alert} inline-notice`} role="alert">
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
      </div>
      {addMoney ? <AddMoneyModal onClose={() => setAddMoney(false)} /> : null}
    </div>
  );
}
