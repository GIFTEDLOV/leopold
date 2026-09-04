"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { useFinancial } from "@/components/financial-provider";
import { useWalletIdentity } from "@/components/wallet-identity-provider";
import styles from "@/components/final-ui/dashboard-experience.module.css";

function Status({ children, tone = "good" }: { children: ReactNode; tone?: "good" | "gold" | "neutral" }) {
  return <span className={`${styles.status} ${tone === "gold" ? styles.statusGold : tone === "neutral" ? styles.statusNeutral : ""}`}>{children}</span>;
}

function PageHeader({ kicker, title, copy, action, compactTitle = false }: { kicker: string; title: ReactNode; copy: string; action?: ReactNode; compactTitle?: boolean }) {
  return <header className={`${styles.pageHeader} ${compactTitle ? styles.homePageHeader : ""}`}><div className={styles.pageHeaderCopy}><span className={styles.kicker}>{kicker}</span><h1 className={`${styles.title} ${compactTitle ? styles.homeTitle : ""}`}>{title}</h1><p className={styles.lede}>{copy}</p></div>{action ? <div className={styles.headerMeta}>{action}</div> : null}</header>;
}

function WalletNotice() {
  return <section className={styles.walletNotice} role="status"><div><strong>Connect your verified financial wallet to continue.</strong><span>Financial and private actions remain paused. Public Leopold information remains available.</span></div><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/login">Connect verified wallet</Link></section>;
}

function CurrentDrawBoard() {
  return <div className={styles.drawBoardWrap}><div className={styles.drawBoard}>
    <div className={styles.drawColumn}><span>Daily draw</span><strong>#2</strong><small>Daily · 24 hour rounds</small></div>
    <div className={styles.drawColumn}><span>Draw closes</span><strong>3h 11m left</strong><small>Thu, Sep 3, 4:48 PM</small></div>
    <div className={styles.drawColumn}><span>Your entry</span><strong>Prize Savings is off</strong><small>Future entries are off</small></div>
  </div><div className={styles.drawStatusStrip}><span className={styles.drawStatusIcon} aria-hidden="true">✦</span><div><strong>Prize Savings is off.</strong><span>Your next eligible entry happens automatically while Prize Savings is on.</span></div></div></div>;
}

function RecentDraws() {
  return <div className={styles.historyList}><div className={styles.historyRow}><div><strong>Draw #1</strong><span>Settlement is still in progress.</span></div><Status tone="neutral">Settled</Status></div><div className={styles.historyRow}><div><strong>Draw #2</strong><span>Current daily draw.</span></div><Status>Current</Status></div></div>;
}

function ReferenceButton({ children, href = "/app" }: { children: ReactNode; href?: string }) {
  return <Link className={`${styles.button} ${styles.buttonSecondary}`} href={href}>{children}</Link>;
}

export function V2HomePage() {
  return <>
    <PageHeader kicker="PRIZE SAVINGS · DAILY" title="Your savings, with a chance to win." copy="Save once, stay in the draw, and check back when the next result is ready." action={<Status>Prize Savings</Status>} compactTitle />
    <WalletNotice />
    <section className={`${styles.grid} ${styles.gridTwo} ${styles.homeTopGrid}`} aria-label="Prize Savings overview">
      <article className={`${styles.panel} ${styles.darkSavingsCard}`}>
        <div className={styles.panelHeader}><div><p className={styles.panelKicker}>YOUR SAVINGS</p></div><span className={styles.metricIcon} aria-label="Private balance">◈</span></div>
        <div className={styles.homeAmount}>•••••• <small>USDC</small></div>
        <p className={styles.panelCopy}>Add money to start building your balance.</p>
        <div className={styles.homeActions}><Link className={styles.button} href="#add-money">Add money</Link><ReferenceButton>Withdraw</ReferenceButton></div>
        <p className={styles.homeFine}>Your wallet will ask you to review each step before anything happens.</p>
      </article>
      <article className={`${styles.panel} ${styles.goldPrizeCard}`}>
        <div className={styles.panelHeader}><div><p className={styles.panelKicker}>YOUR CHANCE TO WIN</p><h2 className={styles.panelTitle}>Prize Savings</h2></div><Status tone="neutral">Off</Status></div>
        <p className={styles.homeState}>Prize Savings is off.</p>
        <div className={styles.homeMetaGrid}><div><span>Next draw</span><strong>Thu, Sep 3, 4:48 PM</strong></div><div><span>Entry funding</span><strong>Needs funding</strong></div></div>
        <div className={styles.homeActions}><Link className={`${styles.button} ${styles.primaryPrizeButton}`} href="/app/profile">Turn on Prize Savings</Link><ReferenceButton href="/app/profile">Manage Prize Savings</ReferenceButton></div>
      </article>
    </section>

    <section className={styles.homeSection} aria-labelledby="current-draw-heading"><div className={styles.homeSectionHeading}><div><p className={styles.panelKicker}>TODAY&apos;S CHANCE</p><h2 id="current-draw-heading">Current draw</h2></div><Status>Open</Status></div><CurrentDrawBoard /></section>

    <section className={`${styles.grid} ${styles.gridThree} ${styles.homeSection}`} aria-label="Prize Savings details">
      <article className={`${styles.panel} ${styles.homeTallCard}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>LATEST RESULT</p><h2 className={styles.panelTitle}>Your result</h2></div><Status tone="neutral">Pending</Status></div><h3 className={styles.homeSubheading}>No result yet</h3><p className={styles.panelCopy}>Your result will appear here after the draw settles.</p></article>
      <article className={`${styles.panel} ${styles.homeTallCard}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>KEEP YOUR CHANCE GOING</p><h2 className={styles.panelTitle}>Entry balance</h2></div><Status tone="gold">Needs funding</Status></div><h3 className={styles.homeSubheading}>Add entry balance</h3><p className={styles.panelCopy}>Your balance covers automatic entry without a manual step each draw.</p><Link className={styles.textAction} href="/app/profile">Manage entry balance →</Link></article>
      <article className={`${styles.panel} ${styles.homeTallCard}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>HISTORY</p><h2 className={styles.panelTitle}>Recent draws</h2></div><Link className={styles.textAction} href="/app/v2/draws">All draws →</Link></div><RecentDraws /></article>
    </section>

    <section className={`${styles.grid} ${styles.gridTwo} ${styles.homeSection}`} aria-label="Prize Savings settings and Classic Vaults">
      <article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>MANAGE</p><h2 className={styles.panelTitle}>Prize Savings settings</h2></div><Status tone="neutral">Off</Status></div><div className={styles.settingsList}><div className={styles.settingRow}><div><strong>Top up entry balance</strong><span>Ready for upcoming draws</span></div><ReferenceButton>Top up</ReferenceButton></div><div className={styles.settingRow}><div><strong>Withdraw unused entry balance</strong><span>Only funds not reserved for a draw can be withdrawn.</span></div><ReferenceButton>Withdraw</ReferenceButton></div><div className={styles.settingRow}><div><strong>Future draw entries</strong><span>Turn Prize Savings on to enter.</span></div><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/app/profile">Turn on</Link></div></div><p className={styles.homeFine}>Switching products never moves your money.</p></article>
      <article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>A DIFFERENT WAY TO SAVE</p><h2 className={styles.panelTitle}>Classic Vaults</h2></div><Status tone="neutral">V1</Status></div><p className={styles.panelCopy}>Choose Daily, Weekly, Monthly, or Boost and enter each vault manually.</p><div className={styles.tagList}><span className={styles.tag}>Daily</span><span className={styles.tag}>Weekly</span><span className={styles.tag}>Monthly</span><span className={styles.tag}>Boost</span></div><p className={styles.homeFine}>Classic Vaults and Prize Savings balances always stay separate.</p><Link className={styles.button} href="/app/classic">Explore Classic Vaults</Link></article>
    </section>

    <section className={`${styles.grid} ${styles.gridTwo} ${styles.homeSection}`} aria-label="Rewards and guidance">
      <article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>MONEY</p><h2 className={styles.panelTitle}>Rewards &amp; returns</h2></div><Status>Live status</Status></div><div className={styles.referenceList}><div className={styles.referenceRow}><div><strong>Settlement reward</strong><span>Nothing ready yet</span></div><Link className={styles.textAction} href="/app/v2/rewards">View rewards →</Link></div><div className={styles.referenceRow}><div><strong>Entry balance return</strong><span>Nothing ready yet</span></div><Link className={styles.textAction} href="/app/v2/rewards">View returns →</Link></div></div></article>
      <article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>GOOD TO KNOW</p><h2 className={styles.panelTitle}>How Leopold works</h2></div><span className={styles.metricIcon} aria-hidden="true">◈</span></div><p className={styles.panelCopy}>Learn how your balance, draw entries, and results are protected.</p><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/transparency">Visit Transparency</Link></article>
    </section>
  </>;
}

export function V2DrawsPage() {
  return <><PageHeader kicker="PRIZE SAVINGS" title={<>Draws &amp; results</>} copy="See your current draw and the results that are ready for you." action={<ReferenceButton>Prize Savings home</ReferenceButton>} /><section className={`${styles.grid} ${styles.gridTwo} ${styles.pageSection}`}><article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>CURRENT DRAW</p><h2 className={styles.panelTitle}>Daily draw #2</h2></div><Status>Open</Status></div><div className={styles.detailList}><div><span>Draw closes</span><strong>Thu, Sep 3, 4:48 PM</strong></div><div><span>Your entry</span><strong>Prize Savings is off</strong></div><div><span>Entry balance</span><strong>0 USDC</strong></div></div><p className={styles.panelCopy}>Entry happens automatically while Prize Savings is on. There is no per-draw action.</p></article><article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>YOUR LATEST RESULT</p><h2 className={styles.panelTitle}>Draw #1</h2></div><Status tone="neutral">Pending</Status></div><div className={styles.resultBlank}><strong>Settled</strong><span>Results become available after the draw is complete.</span></div><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/app">Go to Prize Savings</Link></article></section><section className={`${styles.panel} ${styles.pageSection}`}><div className={styles.homeSectionHeading}><h2>Recent draws</h2><span className={styles.headerMeta}>Live Sepolia data</span></div><RecentDraws /></section></>;
}

export function V2ActivityPage() {
  return <><PageHeader kicker="PRIZE SAVINGS" title="Activity" copy="Your savings, draw, and wallet activity in one place." action={<ReferenceButton>Prize Savings home</ReferenceButton>} /><section className={`${styles.panel} ${styles.activityStatus}`}><div><p className={styles.panelKicker}>LIVE STATUS</p><h2 className={styles.panelTitle}>Daily draw #2</h2><p className={styles.panelCopy}>Prize Savings is off.</p></div><Status>Open</Status></section><section className={`${styles.panel} ${styles.pageSection}`}><div className={styles.homeSectionHeading}><h2>Recent activity</h2><span className={styles.headerMeta}>Only Prize Savings activity</span></div><div className={styles.empty}>Your Prize Savings activity will appear here.</div></section></>;
}

export function V2RewardsPage() {
  return <><PageHeader kicker="PRIZE SAVINGS" title={<>Rewards &amp; returns</>} copy="Keep track of draw rewards and entry balance returns." action={<ReferenceButton>Prize Savings home</ReferenceButton>} /><section className={`${styles.grid} ${styles.gridTwo}`}><article className={styles.panel}><p className={styles.panelKicker}>DRAW RESULT</p><h2 className={styles.panelTitle}>No result ready</h2><p className={styles.panelCopy}>Your result and any prize will appear after a draw settles.</p><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/app">View Prize Savings</Link></article><article className={styles.panel}><p className={styles.panelKicker}>ENTRY BALANCE RETURN</p><h2 className={styles.panelTitle}>Nothing ready yet</h2><p className={styles.panelCopy}>Returns become available after eligible draw accounting is complete.</p><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/app">Back to home</Link></article></section><section className={`${styles.grid} ${styles.gridTwo} ${styles.pageSection}`}><article className={styles.panel}><p className={styles.panelKicker}>SETTLEMENT REWARD</p><div className={styles.rewardValue}>0 <small>ETH</small></div><p className={styles.panelCopy}>Rewards earned from eligible draw work are shown here separately from prizes.</p></article><article className={styles.panel}><p className={styles.panelKicker}>ENTRY BALANCE</p><div className={styles.rewardValue}>0 <small>ETH</small></div><p className={styles.panelCopy}>Unused funds stay available for future automatic entries. Reserved funds stay locked until the draw is complete.</p></article></section></>;
}

export function V2ProfilePage() {
  const auth = useAuth();
  const financial = useFinancial();
  const walletIdentity = useWalletIdentity();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const session = walletIdentity.walletSession;
  const walletLinked = Boolean(auth.financialWallet);
  const walletConnected = session.status === "CONNECTED" || session.status === "WRONG_NETWORK";

  return <><PageHeader kicker="ACCOUNT · PROFILE" title="Profile" copy="Manage your Leopold account, experience, and privacy preferences." action={<Status>Account ready</Status>} /><section className={styles.profileGrid}>
    <article className={`${styles.panel} ${styles.profilePanel}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>LEOPOLD ACCOUNT</p><h2 className={styles.panelTitle}>Your account</h2></div><Status>Verified</Status></div><div className={styles.profileValue}>{auth.username ?? "Your account"}</div><p className={styles.panelCopy}>Your account identity stays separate from your financial wallet.</p><div className={styles.profileActions}><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => void auth.signOut().then(() => router.push("/login"))}>Sign out</button></div></article>
    <article className={`${styles.panel} ${styles.profilePanel}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>EXPERIENCE</p><h2 className={styles.panelTitle}>Prize Savings</h2></div><Status tone="gold">V2</Status></div><p className={styles.panelCopy}>Save once and enter upcoming draws automatically.</p><div className={styles.savingActions}><Link className={styles.button} href="/app">Open Overview</Link><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/app/classic">Classic Vaults</Link></div></article>
    <article className={`${styles.panel} ${styles.profilePanel}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>LINKED ACCOUNTS</p><h2 className={styles.panelTitle}>Wallet connection</h2></div><Status tone="neutral">{walletLinked ? (walletConnected ? "Connected" : "Linked") : "Not linked"}</Status></div><div className={styles.setting}><div><strong>Financial wallet</strong><span>Connect the verified wallet used for saving.</span></div><button className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} type="button" onClick={() => { if (walletLinked) void walletIdentity.connectVerifiedWallet(); else auth.openWalletLink(); }}>{walletConnected ? "Connected" : "Connect"}</button></div><div className={styles.setting}><div><strong>Network</strong><span>Ethereum Sepolia</span></div><span className={styles.listValue}>{session.status === "WRONG_NETWORK" ? "Switch required" : "Ready"}</span></div><div className={styles.profileActionRow}><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={!walletConnected} onClick={walletIdentity.disconnectLeopoldWallet}>Disconnect wallet</button><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={!auth.xEnabled} onClick={() => void (auth.xLinked ? auth.unlinkX() : auth.linkX()).catch(() => undefined)}>{auth.xLinked ? "Unlink X" : "Link X"}</button></div></article>
    <article className={`${styles.panel} ${styles.profilePanel}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>PRIVACY</p><h2 className={styles.panelTitle}>Your values stay private</h2></div><span className={styles.metricIcon}>◈</span></div><p className={styles.panelCopy}>Balances and results are hidden until you deliberately choose to view them.</p><div className={styles.tagList}><span className={styles.tag}>Balance hidden</span><span className={styles.tag}>Result private</span></div><div className={styles.profilePublic}><div><strong>Make Public</strong><span>Move available private USDC back to public USDC.</span></div><div className={styles.profilePublicForm}><label className={styles.srOnly} htmlFor="v2-make-public-amount">Amount of private USDC</label><div className={styles.profilePublicInput}><input id="v2-make-public-amount" inputMode="decimal" placeholder="0.00" aria-label="Amount of private USDC" value={amount} onChange={(event) => setAmount(event.target.value)} /><span>USDC</span></div><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={!walletConnected || !financial.financialActionsEnabled || !amount.trim()} onClick={() => void financial.makePublic(amount).catch(() => undefined)}>Make Public</button></div>{financial.txStage !== "ready" ? <div className={styles.resultBlank}>{financial.txLabel}</div> : null}</div></article>
  </section><p className={styles.footerNote}>Profile changes affect your view only. Savings remain in their separate experience.</p></>;
}

export function DashboardExperience() {
  return <V2HomePage />;
}
