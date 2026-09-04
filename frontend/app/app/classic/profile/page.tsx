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
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>PROFILE</p>
          <h1>Profile</h1>
          <p>Manage your Leopold account, experience, linked accounts, wallet session, and privacy preferences.</p>
        </div>
      </div>
      <div className={styles.profileGrid}>
        <article className={styles.panel} style={{ gridColumn: "1 / -1" }}>
          <p className={styles.eyebrow}>EXPERIENCE</p><h2>Choose how you save.</h2>
          <p>Prize Savings and Classic Vaults are separate experiences. Switching this view never moves your funds.</p>
          <div className={styles.buttonRow}>
            <button className={styles.outlineButton} type="button" onClick={() => router.push("/app")}>Prize Savings</button>
            <button className={styles.primaryButton} type="button" aria-current="page" onClick={() => router.push("/app/classic")}>Classic Vaults</button>
          </div>
          <p className={styles.fine}>NO FUNDS MOVE WHEN YOU SWITCH EXPERIENCES.</p>
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
