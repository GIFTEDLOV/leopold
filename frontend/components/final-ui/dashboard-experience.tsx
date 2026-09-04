"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { formatUnits } from "viem";

import { useAuth } from "@/components/auth-provider";
import { useExperience } from "@/components/experience-provider";
import { useWalletIdentity } from "@/components/wallet-identity-provider";
import {
  useV2FunctionalState,
  v2FormatCountdown,
  v2FormatDate,
  v2StageLabel,
  type V2DialogKind,
} from "./v2-functional-state";
import styles from "./dashboard-experience.module.css";

function Status({ children, tone = "good" }: { children: ReactNode; tone?: "good" | "gold" | "neutral" }) {
  return <span className={`${styles.status} ${tone === "gold" ? styles.statusGold : tone === "neutral" ? styles.statusNeutral : ""}`}>{children}</span>;
}

function PageHeader({ kicker, title, copy, action, compactTitle = false }: { kicker: string; title: ReactNode; copy: string; action?: ReactNode; compactTitle?: boolean }) {
  return <header className={`${styles.pageHeader} ${compactTitle ? styles.homePageHeader : ""}`}><div className={styles.pageHeaderCopy}><span className={styles.kicker}>{kicker}</span><h1 className={`${styles.title} ${compactTitle ? styles.homeTitle : ""}`}>{title}</h1><p className={styles.lede}>{copy}</p></div>{action ? <div className={styles.headerMeta}>{action}</div> : null}</header>;
}

function Usdc({ value, decimals = 6 }: { value: bigint | null | undefined; decimals?: number }) {
  return <>{value === null || value === undefined ? "Checking" : formatUnits(value, decimals)}</>;
}

function v2ActionLabel(kind: V2DialogKind): string {
  return ({
    "add-money": "Add money",
    withdraw: "Withdraw savings",
    "entry-top-up": "Top up entry balance",
    "entry-withdraw": "Withdraw entry balance",
    "turn-on": "Turn on Prize Savings",
    "turn-off": "Turn off Prize Savings",
  })[kind];
}

function V2Dialog({ state }: { state: ReturnType<typeof useV2FunctionalState> }) {
  if (!state.dialog) return null;
  const isToggle = state.dialog === "turn-on" || state.dialog === "turn-off";
  const isTurnOn = state.dialog === "turn-on";
  return <div className={styles.dialogBackdrop} role="presentation" onMouseDown={state.closeDialog}>
    <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="v2-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
      <p className={styles.panelKicker}>PRIZE SAVINGS</p>
      <h2 id="v2-dialog-title" className={styles.panelTitle}>{v2ActionLabel(state.dialog)}</h2>
      <p className={styles.panelCopy}>{isToggle ? isTurnOn ? "Choose how many upcoming draws your entry balance should cover." : "Future automatic entries will stop. Your savings remain available to you." : "Your wallet will ask you to review each step before anything happens."}</p>
      {isTurnOn ? <label className={styles.dialogField}>Upcoming draws<input className={styles.dialogInput} inputMode="numeric" value={state.draws} onChange={(event) => state.setDraws(event.target.value)} /></label> : isToggle ? null : <label className={styles.dialogField}>Amount <span>USDC</span><input className={styles.dialogInput} inputMode="decimal" value={state.amount} onChange={(event) => state.setAmount(event.target.value)} /></label>}
      {state.action.status === "error" ? <p className={styles.dialogError}>{state.action.error}</p> : null}
      <div className={styles.dialogActions}><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={state.closeDialog} disabled={state.busy}>Cancel</button><button className={styles.button} type="button" onClick={state.submitDialog} disabled={state.busy}>{state.busy ? v2StageLabel(state.action.stage) : v2ActionLabel(state.dialog)}</button></div>
    </section>
  </div>;
}

function WalletNotice({ state }: { state: ReturnType<typeof useV2FunctionalState> }) {
  if (!state.shouldShowWalletNotice) return null;
  return <section className={styles.walletNotice} role="status"><div><strong>Connect your verified financial wallet to continue.</strong><span>Financial and private actions remain paused. Public Leopold information remains available.</span></div><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/login">Connect verified wallet</Link></section>;
}

function CurrentDrawBoard({ state }: { state: ReturnType<typeof useV2FunctionalState> }) {
  const entry = state.prizeSavingsOn ? state.entryStatus.label : "Prize Savings is off";
  return <div className={styles.drawBoardWrap}><div className={styles.drawBoard}>
    <div className={styles.drawColumn}><span>Daily draw</span><strong>#{state.data?.roundId?.toString() ?? "—"}</strong><small>Daily · 24 hour rounds</small></div>
    <div className={styles.drawColumn}><span>Draw closes</span><strong>{v2FormatCountdown(state.nextDraw, state.now)}</strong><small>{v2FormatDate(state.nextDraw)}</small></div>
    <div className={styles.drawColumn}><span>Your entry</span><strong>{entry}</strong><small>{state.entryBalanceLabel}</small></div>
  </div><div className={styles.drawStatusStrip}><span className={styles.drawStatusIcon} aria-hidden="true">✦</span><div><strong>{state.prizeSavingsOn ? "Prize Savings is on." : "Prize Savings is off."}</strong><span>Your next eligible entry happens automatically while Prize Savings is on.</span></div></div></div>;
}

function RecentDraws({ state }: { state: ReturnType<typeof useV2FunctionalState> }) {
  return <div className={styles.historyList}>
    <div className={styles.historyRow}><div><strong>Draw #{state.data?.roundId?.toString() ?? "—"}</strong><span>{state.drawStatus.label === "Open" ? "Current daily draw." : "Settlement is in progress."}</span></div><Status tone={state.drawStatus.tone}>{state.drawStatus.label}</Status></div>
    {state.data?.latestResultRound ? <div className={styles.historyRow}><div><strong>Draw #{state.data.latestResultRound[0].toString()}</strong><span>{state.resultReady ? "Your latest result is ready." : "Result will appear after settlement."}</span></div><Status tone={state.resultReady ? "good" : "neutral"}>{state.resultReady ? "Ready" : "Pending"}</Status></div> : null}
  </div>;
}

function ReferenceButton({ children, href = "/app" }: { children: ReactNode; href?: string }) {
  return <Link className={`${styles.button} ${styles.buttonSecondary}`} href={href}>{children}</Link>;
}

export function DashboardExperience() {
  return <V2HomePage />;
}

export function V2HomePage() {
  const state = useV2FunctionalState();
  const savingsStatus = state.prizeSavingsOn ? "On" : "Off";
  const actionMessage = state.action.status === "success" ? "Your wallet activity was confirmed." : state.action.status === "running" ? v2StageLabel(state.action.stage) : null;
  return <>
    <PageHeader kicker="PRIZE SAVINGS · DAILY" title="Your savings, with a chance to win." copy="Save once, stay in the draw, and check back when the next result is ready." action={<Status>Prize Savings</Status>} compactTitle />
    <WalletNotice state={state} />
    {state.readStatus === "error" || state.topologyError ? <section className={styles.systemNotice}><div><strong>Prize Savings data needs attention.</strong><span>{state.topologyError ? "The current on-chain topology could not be verified." : state.readError}</span></div><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => void state.load()}>Try again</button></section> : null}
    {actionMessage ? <section className={styles.systemNotice}><div><strong>{actionMessage}</strong><span>{state.action.hashes.length ? `${state.action.hashes.length} wallet transaction${state.action.hashes.length === 1 ? "" : "s"} submitted.` : ""}</span></div><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={state.dismissAction}>Dismiss</button></section> : null}
    <section className={`${styles.grid} ${styles.gridTwo} ${styles.homeTopGrid}`} aria-label="Prize Savings overview">
      <article className={`${styles.panel} ${styles.darkSavingsCard}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>YOUR SAVINGS</p></div><span className={styles.metricIcon} aria-label="Private balance">◈</span></div><div className={styles.homeAmount}>{state.formatPrivateSavings.replace(" USDC", "")} <small>USDC</small></div><p className={styles.panelCopy}>Add money to start building your balance.</p><div className={styles.homeActions}><button className={styles.button} type="button" onClick={() => state.openDialog("add-money")}>Add money</button><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => state.openDialog("withdraw")}>Withdraw</button><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={state.revealSavings}>{state.revealedSavingsValue === null ? "Show balance" : "Hide balance"}</button></div><p className={styles.homeFine}>Your wallet will ask you to review each step before anything happens.</p></article>
      <article className={`${styles.panel} ${styles.goldPrizeCard}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>YOUR CHANCE TO WIN</p><h2 className={styles.panelTitle}>Prize Savings</h2></div><Status tone={state.prizeSavingsOn ? "good" : "neutral"}>{savingsStatus}</Status></div><p className={styles.homeState}>Prize Savings is {savingsStatus.toLowerCase()}.</p><div className={styles.homeMetaGrid}><div><span>Next draw</span><strong>{v2FormatDate(state.nextDraw)}</strong></div><div><span>Entry funding</span><strong>{state.entryBalanceLabel}</strong></div></div><div className={styles.homeActions}><button className={styles.button} type="button" onClick={() => state.openDialog(state.prizeSavingsOn ? "turn-off" : "turn-on")}>{state.prizeSavingsOn ? "Turn off Prize Savings" : "Turn on Prize Savings"}</button><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/app/profile">Manage Prize Savings</Link></div></article>
    </section>
    <section className={styles.homeSection} aria-labelledby="current-draw-heading"><div className={styles.homeSectionHeading}><div><p className={styles.panelKicker}>TODAY&apos;S CHANCE</p><h2 id="current-draw-heading">Current draw</h2></div><Status tone={state.drawStatus.tone}>{state.drawStatus.label}</Status></div><CurrentDrawBoard state={state} /></section>
    <section className={`${styles.grid} ${styles.gridThree} ${styles.homeSection}`} aria-label="Prize Savings details">
      <article className={`${styles.panel} ${styles.homeTallCard}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>LATEST RESULT</p><h2 className={styles.panelTitle}>Your result</h2></div><Status tone={state.resultReady ? "good" : "neutral"}>{state.resultReady ? "Ready" : "Pending"}</Status></div><h3 className={styles.homeSubheading}>{state.resultReady ? state.revealedResultValue === null ? "Result ready" : `${formatUnits(state.revealedResultValue, 6)} USDC` : "No result yet"}</h3><p className={styles.panelCopy}>{state.resultReady ? "Choose to view your private result when you are ready." : "Your result will appear here after the draw settles."}</p>{state.resultReady ? <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={state.revealResult}>{state.revealedResultValue === null ? "Show result" : "Hide result"}</button> : null}</article>
      <article className={`${styles.panel} ${styles.homeTallCard}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>KEEP YOUR CHANCE GOING</p><h2 className={styles.panelTitle}>Entry balance</h2></div><Status tone={state.entryBalanceTone}>{state.entryBalanceLabel}</Status></div><h3 className={styles.homeSubheading}>{state.fundedDraws === null ? "Checking" : `${state.fundedDraws.toString()} funded ${state.fundedDraws === 1n ? "draw" : "draws"}`}</h3><p className={styles.panelCopy}>Your balance covers automatic entry without a manual step each draw.</p><Link className={styles.textAction} href="/app/profile">Manage entry balance →</Link></article>
      <article className={`${styles.panel} ${styles.homeTallCard}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>HISTORY</p><h2 className={styles.panelTitle}>Recent draws</h2></div><Link className={styles.textAction} href="/app/v2/draws">All draws →</Link></div><RecentDraws state={state} /></article>
    </section>
    <section className={`${styles.grid} ${styles.gridTwo} ${styles.homeSection}`} aria-label="Prize Savings settings and Classic Vaults"><article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>MANAGE</p><h2 className={styles.panelTitle}>Prize Savings settings</h2></div><Status tone={state.prizeSavingsOn ? "good" : "neutral"}>{savingsStatus}</Status></div><div className={styles.settingsList}><div className={styles.settingRow}><div><strong>Top up entry balance</strong><span>Ready for upcoming draws</span></div><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => state.openDialog("entry-top-up")}>Top up</button></div><div className={styles.settingRow}><div><strong>Withdraw unused entry balance</strong><span>Only funds not reserved for a draw can be withdrawn.</span></div><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => state.openDialog("entry-withdraw")}>Withdraw</button></div><div className={styles.settingRow}><div><strong>Future draw entries</strong><span>Turn Prize Savings on to enter.</span></div><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => state.openDialog(state.prizeSavingsOn ? "turn-off" : "turn-on")}>{state.prizeSavingsOn ? "Turn off" : "Turn on"}</button></div></div><p className={styles.homeFine}>Switching products never moves your money.</p></article><article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>A DIFFERENT WAY TO SAVE</p><h2 className={styles.panelTitle}>Classic Vaults</h2></div><Status tone="neutral">V1</Status></div><p className={styles.panelCopy}>Choose Daily, Weekly, Monthly, or Boost and enter each vault manually.</p><div className={styles.tagList}><span className={styles.tag}>Daily</span><span className={styles.tag}>Weekly</span><span className={styles.tag}>Monthly</span><span className={styles.tag}>Boost</span></div><p className={styles.homeFine}>Classic Vaults and Prize Savings balances always stay separate.</p><Link className={styles.button} href="/app/classic">Explore Classic Vaults</Link></article></section>
    <section className={`${styles.grid} ${styles.gridTwo} ${styles.homeSection}`} aria-label="Rewards and guidance"><article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>MONEY</p><h2 className={styles.panelTitle}>Rewards &amp; returns</h2></div><Status>Live status</Status></div><div className={styles.referenceList}><div className={styles.referenceRow}><div><strong>Latest result</strong><span>{state.resultReady ? "Your result is ready to view." : "Nothing ready yet"}</span></div><Link className={styles.textAction} href="/app/v2/rewards">View rewards →</Link></div><div className={styles.referenceRow}><div><strong>Entry balance</strong><span>{state.entryBalanceLabel}</span></div><Link className={styles.textAction} href="/app/v2/rewards">View returns →</Link></div></div></article><article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>GOOD TO KNOW</p><h2 className={styles.panelTitle}>How Leopold works</h2></div><span className={styles.metricIcon} aria-hidden="true">◈</span></div><p className={styles.panelCopy}>Learn how your balance, draw entries, and results are protected.</p><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/transparency">Visit Transparency</Link></article></section>
    <V2Dialog state={state} />
  </>;
}

export function V2DrawsPage() {
  const state = useV2FunctionalState();
  return <><PageHeader kicker="PRIZE SAVINGS" title={<>Draws &amp; results</>} copy="See your current draw and the results that are ready for you." action={<ReferenceButton>Prize Savings home</ReferenceButton>} /><WalletNotice state={state} /><section className={`${styles.grid} ${styles.gridTwo} ${styles.pageSection}`}><article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>CURRENT DRAW</p><h2 className={styles.panelTitle}>Daily draw #{state.data?.roundId?.toString() ?? "—"}</h2></div><Status tone={state.drawStatus.tone}>{state.drawStatus.label}</Status></div><div className={styles.detailList}><div><span>Draw closes</span><strong>{v2FormatDate(state.nextDraw)}</strong></div><div><span>Your entry</span><strong>{state.prizeSavingsOn ? state.entryStatus.label : "Prize Savings is off"}</strong></div><div><span>Entry balance</span><strong><Usdc value={state.data?.automationCredit} decimals={18} /> USDC</strong></div></div><p className={styles.panelCopy}>Entry happens automatically while Prize Savings is on. There is no per-draw action.</p></article><article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>YOUR LATEST RESULT</p><h2 className={styles.panelTitle}>Draw #{state.data?.latestResultRound?.[0].toString() ?? "—"}</h2></div><Status tone={state.resultReady ? "good" : "neutral"}>{state.resultReady ? "Ready" : "Pending"}</Status></div><div className={styles.resultBlank}><strong>{state.resultReady ? state.revealedResultValue === null ? "Result ready" : `${formatUnits(state.revealedResultValue, 6)} USDC` : "No result ready"}</strong><span>{state.resultReady ? "Choose to view your private result." : "Results become available after the draw is complete."}</span></div>{state.resultReady ? <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={state.revealResult}>{state.revealedResultValue === null ? "Show result" : "Hide result"}</button> : <Link className={`${styles.button} ${styles.buttonSecondary}`} href="/app">Go to Prize Savings</Link>}</article></section><section className={`${styles.panel} ${styles.pageSection}`}><div className={styles.homeSectionHeading}><h2>Recent draws</h2><span className={styles.headerMeta}>Live Sepolia data</span></div><RecentDraws state={state} /></section><V2Dialog state={state} /></>;
}

export function V2ActivityPage() {
  const state = useV2FunctionalState();
  return <><PageHeader kicker="PRIZE SAVINGS" title="Activity" copy="Your savings, draw, and wallet activity in one place." action={<ReferenceButton>Prize Savings home</ReferenceButton>} /><section className={`${styles.panel} ${styles.activityStatus}`}><div><p className={styles.panelKicker}>LIVE STATUS</p><h2 className={styles.panelTitle}>Daily draw #{state.data?.roundId?.toString() ?? "—"}</h2><p className={styles.panelCopy}>Prize Savings is {state.prizeSavingsOn ? "on" : "off"}.</p></div><Status tone={state.drawStatus.tone}>{state.drawStatus.label}</Status></section><section className={`${styles.panel} ${styles.pageSection}`}><div className={styles.homeSectionHeading}><h2>Recent activity</h2><span className={styles.headerMeta}>Only Prize Savings activity</span></div>{state.history.length ? <div className={styles.historyList}>{state.history.map((item) => <div className={styles.historyRow} key={item.id}><div><strong>{item.kind.replaceAll("-", " ")}</strong><span>{new Date(item.updatedAt).toLocaleString()}</span></div><Status tone={item.stage === "failed" ? "gold" : "neutral"}>{item.stage}</Status></div>)}</div> : <div className={styles.empty}>Your Prize Savings activity will appear here.</div>}</section></>;
}

export function V2RewardsPage() {
  const state = useV2FunctionalState();
  return <><PageHeader kicker="PRIZE SAVINGS" title={<>Rewards &amp; returns</>} copy="Keep track of draw rewards and entry balance returns." action={<ReferenceButton>Prize Savings home</ReferenceButton>} /><section className={`${styles.grid} ${styles.gridTwo}`}><article className={styles.panel}><p className={styles.panelKicker}>DRAW RESULT</p><h2 className={styles.panelTitle}>{state.resultReady ? "Result ready" : "No result ready"}</h2><p className={styles.panelCopy}>{state.resultReady ? "Your private result is ready for you to view." : "Your result and any prize will appear after a draw settles."}</p><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/app">View Prize Savings</Link></article><article className={styles.panel}><p className={styles.panelKicker}>ENTRY BALANCE RETURN</p><h2 className={styles.panelTitle}>{state.entryBalanceLabel}</h2><p className={styles.panelCopy}>Returns become available after eligible draw accounting is complete.</p><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/app">Back to home</Link></article></section><section className={`${styles.grid} ${styles.gridTwo} ${styles.pageSection}`}><article className={styles.panel}><p className={styles.panelKicker}>SETTLEMENT REWARD</p><div className={styles.rewardValue}>— <small>ETH</small></div><p className={styles.panelCopy}>Rewards earned from eligible draw work are shown here separately from prizes.</p></article><article className={styles.panel}><p className={styles.panelKicker}>ENTRY BALANCE</p><div className={styles.rewardValue}><Usdc value={state.data?.automationCredit} decimals={18} /> <small>USDC</small></div><p className={styles.panelCopy}>Unused funds stay available for future automatic entries. Reserved funds stay locked until the draw is complete.</p></article></section></>;
}

export function V2ProfilePage() {
  const state = useV2FunctionalState();
  const auth = useAuth();
  const wallet = useWalletIdentity();
  const { setExperience } = useExperience();
  const [makePublicAmount, setMakePublicAmount] = useState("0.001");
  const connected = wallet.walletSession.status === "CONNECTED";
  return <><PageHeader kicker="ACCOUNT · PROFILE" title="Profile" copy="Manage your Leopold account, experience, and privacy preferences." action={<Status tone={auth.authenticated ? "good" : "neutral"}>{auth.authenticated ? "Account ready" : "Sign in required"}</Status>} /><section className={styles.profileGrid}>
    <article className={`${styles.panel} ${styles.profilePanel}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>LEOPOLD ACCOUNT</p><h2 className={styles.panelTitle}>Your account</h2></div><Status tone={auth.emailVerified ? "good" : "neutral"}>{auth.emailVerified ? "Verified" : "Pending"}</Status></div><div className={styles.profileValue}>{auth.username ?? auth.email ?? "Your account"}</div><p className={styles.panelCopy}>Your account identity stays separate from your financial wallet.</p><div className={styles.profileActions}><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => void auth.signOut()}>Sign out</button></div></article>
    <article className={`${styles.panel} ${styles.profilePanel}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>EXPERIENCE</p><h2 className={styles.panelTitle}>Prize Savings</h2></div><Status tone="gold">V2</Status></div><p className={styles.panelCopy}>Save once and enter upcoming draws automatically.</p><div className={styles.savingActions}><Link className={styles.button} href="/app" onClick={() => setExperience("v2")}>Open Overview</Link><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/app/classic" onClick={() => setExperience("v1")}>Classic Vaults</Link></div></article>
    <article className={`${styles.panel} ${styles.profilePanel}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>LINKED ACCOUNTS</p><h2 className={styles.panelTitle}>Wallet connection</h2></div><Status tone={connected ? "good" : "neutral"}>{connected ? "Connected" : "Not linked"}</Status></div><div className={styles.setting}><div><strong>Financial wallet</strong><span>Connect the verified wallet used for saving.</span></div>{connected ? <span className={styles.listValue}>{wallet.walletSession.address?.slice(0, 6)}…{wallet.walletSession.address?.slice(-4)}</span> : <Link className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} href="/login">Connect</Link>}</div><div className={styles.setting}><div><strong>Network</strong><span>Ethereum Sepolia</span></div><span className={styles.listValue}>{wallet.walletSession.chainId === 11155111 ? "Ready" : "Check network"}</span></div><div className={styles.profileActionRow}>{connected ? <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={wallet.disconnectLeopoldWallet}>Disconnect wallet</button> : null}{auth.xEnabled ? <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => void (auth.xLinked ? auth.unlinkX() : auth.linkX())}>{auth.xLinked ? "Unlink X" : "Link X"}</button> : null}</div></article>
    <article className={`${styles.panel} ${styles.profilePanel}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>PRIVACY</p><h2 className={styles.panelTitle}>Your values stay private</h2></div><span className={styles.metricIcon}>◈</span></div><p className={styles.panelCopy}>Balances and results are hidden until you deliberately choose to view them.</p><div className={styles.tagList}><span className={styles.tag}>Balance hidden</span><span className={styles.tag}>Result private</span></div><div className={styles.profilePublic}><div><strong>Withdraw savings</strong><span>Move available Prize Savings USDC back to your connected wallet.</span></div><div className={styles.profilePublicForm}><label className={styles.srOnly} htmlFor="v2-withdraw-amount">Amount of Prize Savings USDC</label><div className={styles.profilePublicInput}><input id="v2-withdraw-amount" inputMode="decimal" value={makePublicAmount} onChange={(event) => setMakePublicAmount(event.target.value)} aria-label="Amount of Prize Savings USDC" /><span>USDC</span></div><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => { state.openDialog("withdraw"); state.setAmount(makePublicAmount); }}>Withdraw</button></div></div></article>
  </section><p className={styles.footerNote}>Profile changes affect your view only. Savings remain in their separate experience.</p><V2Dialog state={state} /></>;
}
