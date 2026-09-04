"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useExperience } from "@/components/experience-provider";
import { useFinancial } from "@/components/financial-provider";
import { useWalletIdentity } from "@/components/wallet-identity-provider";
import styles from "@/components/full-site/leopold-app-ui.module.css";

export default function ClassicProfilePage() {
  const financial = useFinancial();
  const auth = useAuth();
  const walletIdentity = useWalletIdentity();
  const router = useRouter();
  const { setExperience } = useExperience();
  const [amount, setAmount] = useState("1");
  const session = walletIdentity.walletSession;

  return (
    <div className={styles.content}>
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>PROFILE</p>
          <h1>Profile</h1>
          <p>Your Leopold identity stays offchain; your external wallet controls the financial state.</p>
        </div>
      </div>
      <div className={styles.profileGrid}>
        <article className={`${styles.panel} ${styles.experiencePanel}`}>
          <div className={styles.panelTitle}>
            <div>
              <p className={styles.eyebrow}>EXPERIENCE</p>
              <h2>Choose how Leopold feels</h2>
            </div>
            <span className={styles.status}>NO FUNDS MOVE</span>
          </div>
          <p>Switch between Prize Savings and Classic Vaults any time. This only changes the app view; each product keeps its own balance and history.</p>
          <div className={styles.experienceSwitcher} role="group" aria-label="Choose your Leopold experience">
            <button type="button" aria-pressed={false} onClick={() => { setExperience("v2"); router.push("/app"); }}>
              <strong>Prize Savings</strong>
              <span>Save and enter upcoming draws automatically</span>
            </button>
            <button type="button" className={styles.experienceSelected} aria-pressed={true} onClick={() => { setExperience("v1"); router.push("/app/classic"); }}>
              <strong>Classic Vaults</strong>
              <span>Daily, Weekly, Monthly, Boost</span>
            </button>
          </div>
        </article>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>Leopold account</p><h2>Account identity.</h2>
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
          <p className={styles.eyebrow}>Linked accounts</p><h2>Optional identity.</h2>
          <div className={styles.listRow}><div><strong>X / Twitter</strong><span>Optional identity enhancement; never a financial signer</span></div>{auth.xEnabled ? <button className={styles.outlineButton} onClick={() => void (auth.xLinked ? auth.unlinkX() : auth.linkX()).catch(() => undefined)}>{auth.xLinked ? "Linked · Unlink" : "Link X"}</button> : <span className={styles.status}>Unavailable</span>}</div>
          {auth.authError ? <div className={styles.notice} role="alert">{auth.authError}</div> : null}
        </article>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>Privacy preferences</p><h2>Reveal deliberately.</h2>
          <div className={styles.listRow}><div><strong>Default reveal behavior</strong><span>Private values require a deliberate reveal each session</span></div><span className={styles.status}>Hidden</span></div>
          <p className={styles.fine}>Decrypted balances and results are kept only in client memory and cleared on wallet or network change.</p>
        </article>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>Make public</p><h2>Return to public USDC.</h2>
          <p>Request conversion of Private USDC back to public USDC. Completion requires authenticated asynchronous finalization.</p>
          <div className={styles.amountInput}><input aria-label="Private USDC amount to make public" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /><b>USDC</b></div>
          <button className={styles.outlineButton} disabled={session.status !== "CONNECTED" || !financial.financialActionsEnabled} onClick={() => void financial.makePublic(amount).catch(() => undefined)}>Make Public</button>
          {financial.txStage !== "ready" ? <div className={styles.notice}>{financial.txLabel}</div> : null}
        </article>
      </div>
    </div>
  );
}
