"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useFinancial } from "@/components/financial-provider";
import { useWalletIdentity } from "@/components/wallet-identity-provider";
import styles from "@/components/full-site/leopold-app-ui.module.css";

export default function ClassicProfilePage() {
  const financial = useFinancial();
  const auth = useAuth();
  const walletIdentity = useWalletIdentity();
  const router = useRouter();
  const [amount, setAmount] = useState("1");
  const session = walletIdentity.walletSession;

  return (
    <div className={styles.content}>
      <style jsx global>{`
        .sites-classic-experience { grid-column: 1 / -1; }
        .sites-experience-options {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 20px;
        }
        .sites-experience-choice {
          min-width: 0;
          height: 68px;
          min-height: 68px;
          display: grid;
          place-content: center;
          justify-items: center;
          gap: 5px;
          padding: 10px 18px;
          border: 1px solid rgba(88,132,170,.38);
          border-radius: 9px;
          background: linear-gradient(145deg,#05172c 0%,#020c1d 72%,#010611 100%);
          color: #fffef9;
          text-align: center;
          cursor: pointer;
          box-shadow: inset 0 1px rgba(203,226,243,.09), 0 7px 16px rgba(2,9,18,.2);
          transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
        }
        .sites-experience-choice strong { font: 700 12px/1.1 var(--app-sans, Arial, sans-serif); letter-spacing: .03em; }
        .sites-experience-choice span { font: 9px/1.2 var(--app-mono, "Courier New", monospace); letter-spacing: .06em; text-transform: uppercase; opacity: .76; }
        .sites-experience-choice:hover,
        .sites-experience-choice:focus-visible { transform: translateY(-1px); box-shadow: inset 0 1px rgba(203,226,243,.12), 0 10px 22px rgba(2,9,18,.25); }
        .sites-experience-choice[aria-current="page"] {
          border-color: #c9ab60;
          background: linear-gradient(180deg,#d9ba6b 0%,#b99549 100%);
          color: #07101d;
          box-shadow: inset 0 1px rgba(255,255,255,.55), 0 8px 18px rgba(16,37,64,.16);
        }
        .sites-experience-note { margin: 13px 0 0; color: #6f7b8b; font: 9px/1.45 var(--app-mono, "Courier New", monospace); letter-spacing: .08em; text-transform: uppercase; }
        html[data-leopold-theme="dark"] .sites-experience-note { color: #9fabb9; }
        @media (max-width: 760px) {
          .sites-experience-options { grid-template-columns: 1fr; gap: 8px; }
          .sites-experience-choice { height: 58px; min-height: 58px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sites-experience-choice { transition: none; }
          .sites-experience-choice:hover,
          .sites-experience-choice:focus-visible { transform: none; }
        }
      `}</style>
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>PROFILE</p>
          <h1>Profile</h1>
          <p>Manage your Leopold account, experience, linked accounts, wallet session, and privacy preferences.</p>
        </div>
      </div>
      <div className={styles.profileGrid}>
        <article className={`${styles.panel} sites-classic-experience`}>
          <p className={styles.eyebrow}>EXPERIENCE</p><h2>Choose how you save.</h2>
          <p>Prize Savings and Classic Vaults are separate experiences. Switching this view never moves your funds.</p>
          <div className="sites-experience-options">
            <button className="sites-experience-choice" type="button" onClick={() => router.push("/app")}>
              <strong>Prize Savings</strong><span>Automatic participation</span>
            </button>
            <button className="sites-experience-choice" type="button" aria-current="page" onClick={() => router.push("/app/classic")}>
              <strong>Classic Vaults</strong><span>Daily · Weekly · Monthly · Boost</span>
            </button>
          </div>
          <p className="sites-experience-note">No funds move.</p>
        </article>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>LEOPOLD ACCOUNT</p><h2>Account identity.</h2>
          <div className={styles.listRow}><div><strong>Username</strong><span>Offchain application identity</span></div><span>{auth.username ?? "Incomplete"}</span></div>
          <div className={styles.listRow}><div><strong>Email</strong><span>{auth.emailVerified ? "Verified" : "Verification required"}</span></div><span>{auth.email ?? "Not connected"}</span></div>
          <div className={styles.listRow}><div><strong>Financial wallet</strong><span>{auth.financialWallet ? "Verified external wallet" : "Not linked"}</span></div><span>{auth.financialWallet ? `${auth.financialWallet.slice(0, 6)}…${auth.financialWallet.slice(-4)}` : "Required"}</span></div>
          <div className={styles.listRow}><div><strong>Wallet session</strong><span>{session.status === "CONNECTED" ? "Ethereum Sepolia" : session.status}</span></div><span>{session.status === "CONNECTED" ? "Connected" : "Disconnected"}</span></div>
          <div className={styles.buttonRow}>
            <button className={styles.outlineButton} onClick={walletIdentity.disconnectLeopoldWallet} disabled={session.status !== "CONNECTED" && session.status !== "WRONG_NETWORK"}>Disconnect wallet</button>
            <button className={styles.outlineButton} onClick={() => void auth.signOut().then(() => router.push("/login"))}>Sign out</button>
          </div>
        </article>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>LINKED ACCOUNTS</p><h2>Optional identity.</h2>
          <div className={styles.listRow}><div><strong>X / Twitter</strong><span>Optional identity enhancement; never a financial signer</span></div>{auth.xEnabled ? <button className={styles.outlineButton} onClick={() => void (auth.xLinked ? auth.unlinkX() : auth.linkX()).catch(() => undefined)}>{auth.xLinked ? "Linked · Unlink" : "Link X"}</button> : <span className={styles.status}>Unavailable</span>}</div>
          {auth.authError ? <div className={styles.notice} role="alert">{auth.authError}</div> : null}
        </article>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>PRIVACY PREFERENCES</p><h2>Reveal deliberately.</h2>
          <div className={styles.listRow}><div><strong>Default reveal behavior</strong><span>Private values require a deliberate reveal each session</span></div><span className={styles.status}>Hidden</span></div>
          <p className={styles.fine}>Decrypted balances and results are kept only in client memory and cleared on wallet or network change.</p>
        </article>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>MAKE PUBLIC</p><h2>Return to public USDC.</h2>
          <p>Request conversion of Private USDC back to public USDC. Completion requires authenticated asynchronous finalization.</p>
          <div className={styles.amountInput}><input aria-label="Private USDC amount to make public" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /><b>USDC</b></div>
          <button className={styles.outlineButton} disabled={session.status !== "CONNECTED" || !financial.financialActionsEnabled} onClick={() => void financial.makePublic(amount).catch(() => undefined)}>Make Public</button>
          {financial.txStage !== "ready" ? <div className={styles.notice}>{financial.txLabel}</div> : null}
        </article>
      </div>
    </div>
  );
}
