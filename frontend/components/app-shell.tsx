"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AddMoneyModal } from "./add-money-modal";
import { useAuth } from "./auth-provider";
import { useFinancial } from "./financial-provider";

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
  const [addMoney, setAddMoney] = useState(false);
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
            <span className={`dot ${financial.wrongNetwork ? "bad" : ""}`} />
            {financial.wrongNetwork ? "Wrong network" : "Ethereum Sepolia"}
          </div>
          <button
            className="account-pill"
            onClick={() => {
              if (financial.connected) financial.disconnectWallet();
              else if (auth.authenticated) auth.openWalletLink();
              else void financial.connectWallet().catch(() => undefined);
            }}
          >
            {financial.accountLabel}
          </button>
          <button
            className="button"
            onClick={() => setAddMoney(true)}
            disabled={!auth.authenticated && !financial.fixture}
          >
            + Add Money
          </button>
        </header>
        {children}
      </main>
      {addMoney ? <AddMoneyModal onClose={() => setAddMoney(false)} /> : null}
    </div>
  );
}
