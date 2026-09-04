"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatEther, formatUnits } from "viem";
import { useState, type ReactNode } from "react";

import { useAuth } from "@/components/auth-provider";
import { useWalletIdentity } from "@/components/wallet-identity-provider";
import {
  claimV2Refund,
  claimV2Reward,
  withdrawV2Savings,
} from "@/lib/leopold/v2-actions";
import {
  useV2FunctionalState,
  v2FormatCountdown,
  v2FormatDate,
  type V2DialogKind,
} from "@/components/final-ui/v2-functional-state";
import styles from "@/components/final-ui/dashboard-experience.module.css";

type V2State = ReturnType<typeof useV2FunctionalState>;

function Status({ children, tone = "good" }: { children: ReactNode; tone?: "good" | "gold" | "neutral" }) {
  return <span className={`${styles.status} ${tone === "gold" ? styles.statusGold : tone === "neutral" ? styles.statusNeutral : ""}`}>{children}</span>;
}

function PageHeader({ kicker, title, copy, action, compactTitle = false }: { kicker: string; title: ReactNode; copy: string; action?: ReactNode; compactTitle?: boolean }) {
  return <header className={`${styles.pageHeader} ${compactTitle ? styles.homePageHeader : ""}`}><div className={styles.pageHeaderCopy}><span className={styles.kicker}>{kicker}</span><h1 className={`${styles.title} ${compactTitle ? styles.homeTitle : ""}`}>{title}</h1><p className={styles.lede}>{copy}</p></div>{action ? <div className={styles.headerMeta}>{action}</div> : null}</header>;
}

function WalletNotice({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <section className={styles.walletNotice} role="status"><div><strong>Connect your verified financial wallet to continue.</strong><span>Financial and private actions remain paused. Public Leopold information remains available.</span></div><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/login">Connect verified wallet</Link></section>;
}

function LiveReadNotice({ v2 }: { v2: V2State }) {
  if (!v2.topologyError && v2.readStatus !== "error") return null;
  return <section className={styles.walletNotice} role="alert"><div><strong>We couldn&apos;t update Prize Savings.</strong><span>{v2.readError ?? "The live V2 topology could not be verified. No placeholder state is being shown."}</span></div><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => void v2.load()}>Try again</button></section>;
}

function ActionNotice({ v2 }: { v2: V2State }) {
  if (v2.action.status === "idle") return null;
  if (v2.action.status === "running") return <section className={styles.walletNotice} role="status"><div><strong>{v2.action.kind === "v2-add-money" ? "Adding to savings" : "Updating Prize Savings"}</strong><span>{v2.action.stage ? `Stage: ${v2.action.stage}. ` : ""}Review each wallet request. Leopold waits for confirmation before continuing.</span></div></section>;
  if (v2.action.status === "success") return <section className={styles.walletNotice} role="status"><div><strong>Action complete.</strong><span>{v2.action.hashes.length ? "Your wallet transaction is confirmed." : "Your current state is up to date."}</span></div><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={v2.dismissAction}>Dismiss</button></section>;
  return <section className={styles.walletNotice} role="alert"><div><strong>{v2.action.recoveryRequired ? "Transaction needs your attention." : "We couldn&apos;t complete that."}</strong><span>{v2.action.error}{v2.action.recoveryRequired ? " Check your wallet activity before trying again; Leopold will not rebroadcast the transaction." : ""}</span></div><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={v2.dismissAction}>Close</button></section>;
}

function CurrentDrawBoard({ v2 }: { v2: V2State }) {
  const data = v2.data;
  return <div className={styles.drawBoardWrap}><div className={styles.drawBoard}>
    <div className={styles.drawColumn}><span>Daily draw</span><strong>{data ? `#${data.roundId.toString()}` : "Checking"}</strong><small>Daily · 24 hour rounds</small></div>
    <div className={styles.drawColumn}><span>Draw closes</span><strong>{v2FormatCountdown(v2.nextDraw, v2.now)}</strong><small>{v2FormatDate(v2.nextDraw)}</small></div>
    <div className={styles.drawColumn}><span>Your entry</span><strong>{v2.entryStatus.label}</strong><small>{v2.entryStatus.message}</small></div>
  </div><div className={styles.drawStatusStrip}><span className={styles.drawStatusIcon} aria-hidden="true">✦</span><div><strong>{v2.data ? v2.entryStatus.message : "Checking Prize Savings status."}</strong><span>Your next eligible entry happens automatically while Prize Savings is on.</span></div></div></div>;
}

function RecentDraws({ v2 }: { v2: V2State }) {
  const latest = v2.data?.latestResultRound;
  return <div className={styles.historyList}>
    <div className={styles.historyRow}><div><strong>{latest && v2.data?.latestResultRoundId ? `Draw #${v2.data.latestResultRoundId.toString()}` : v2.data ? "No settled draws" : "Checking draws"}</strong><span>{latest ? v2FormatDate(latest[1]) : v2.data ? "No completed draw is available." : "Reading live Sepolia state."}</span></div><Status tone="neutral">{v2.resultReady ? "Result ready" : latest ? "Settling" : "Unavailable"}</Status></div>
    <div className={styles.historyRow}><div><strong>{v2.data ? `Draw #${v2.data.roundId.toString()}` : "Current draw"}</strong><span>{v2.data ? v2FormatDate(v2.data.round[0]) : "Reading live Sepolia state."}</span></div><Status>{v2.drawStatus.label}</Status></div>
  </div>;
}

function ReferenceButton({ children, href = "/app" }: { children: ReactNode; href?: string }) {
  return <Link className={`${styles.button} ${styles.buttonSecondary}`} href={href}>{children}</Link>;
}

function ActionButton({ children, onClick, disabled = false }: { children: ReactNode; onClick(): void; disabled?: boolean }) {
  return <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={onClick} disabled={disabled}>{children}</button>;
}

function V2ActionDialog({ v2 }: { v2: V2State }) {
  const dialog = v2.dialog as V2DialogKind | null;
  if (!dialog) return null;
  const title = dialog === "add-money" ? "Add to your savings" : dialog === "withdraw" ? "Withdraw savings" : dialog === "turn-on" ? "Turn on Prize Savings" : dialog === "turn-off" ? "Turn off future entries?" : dialog === "entry-top-up" ? "Top up entry balance" : "Withdraw entry balance";
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !v2.busy) v2.closeDialog(); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="v2-action-title"><div className="modal-head"><div><span className="eyebrow">{dialog === "add-money" || dialog === "withdraw" ? "Savings" : dialog === "turn-on" || dialog === "turn-off" ? "Prize Savings" : "Entry balance"}</span><h2 id="v2-action-title">{title}</h2></div><button type="button" onClick={v2.closeDialog} disabled={v2.busy} aria-label="Close">×</button></div>{dialog === "turn-off" ? <p className="subtle">You&apos;ll stay in any draw you&apos;re already entered in, but you won&apos;t be entered into future draws.</p> : dialog === "turn-on" ? <><p className="subtle">Leopold will fund your upcoming entries, then turn on automatic entry. You&apos;ll review each wallet request.</p><label className="card-label" htmlFor="v2-draw-count">Upcoming draws to cover</label><input id="v2-draw-count" className="input" inputMode="numeric" value={v2.draws} onChange={(event) => v2.setDraws(event.target.value)} /></> : <><label className="card-label" htmlFor="v2-action-amount">Amount</label><input id="v2-action-amount" className="input" inputMode="decimal" value={v2.amount} onChange={(event) => v2.setAmount(event.target.value)} /><p className="subtle">{dialog === "add-money" ? "USDC" : dialog === "withdraw" ? "USDC will return to your wallet." : "ETH entry balance. Reserved funds cannot be withdrawn."}</p></>}<div className="modal-actions"><button className="button secondary" type="button" onClick={v2.closeDialog} disabled={v2.busy}>Cancel</button><button className="button" type="button" onClick={v2.submitDialog} disabled={v2.busy}>{v2.busy ? "Waiting…" : dialog === "turn-off" ? "Turn off" : "Continue"}</button></div></div></div>;
}

export function V2HomePage() {
  const v2 = useV2FunctionalState();
  const data = v2.data;
  const privateBalance = v2.revealedSavingsValue !== null ? `${formatUnits(v2.revealedSavingsValue, 6)} USDC` : data?.privateHandlesRead === true ? "•••••• USDC" : data?.privateHandlesRead === false ? "0.00 USDC" : v2.readStatus === "error" ? "Unavailable" : "Checking";
  const resultCopy = v2.revealedResultValue !== null ? v2.revealedResultValue > 0n ? `You won ${formatUnits(v2.revealedResultValue, 6)} USDC` : "No prize this time" : v2.resultReady ? "Your result is ready" : data ? "No result yet" : "Checking result";
  return <>
    <PageHeader kicker="PRIZE SAVINGS · DAILY" title="Your savings, with a chance to win." copy="Save once, stay in the draw, and check back when the next result is ready." action={<Status tone={data ? "good" : "neutral"}>{data ? "Live" : "Checking"}</Status>} compactTitle />
    <WalletNotice visible={v2.shouldShowWalletNotice} />
    <LiveReadNotice v2={v2} />
    <ActionNotice v2={v2} />
    <section className={`${styles.grid} ${styles.gridTwo} ${styles.homeTopGrid}`} aria-label="Prize Savings overview">
      <article className={`${styles.panel} ${styles.darkSavingsCard}`}>
        <div className={styles.panelHeader}><div><p className={styles.panelKicker}>YOUR SAVINGS</p></div><span className={styles.metricIcon} aria-label="Private balance">◈</span></div>
        <div className={styles.homeAmount}>{privateBalance.split(" ")[0]} <small>{privateBalance.split(" ").slice(1).join(" ")}</small></div>
        <p className={styles.panelCopy}>{data?.privateHandlesRead ? "Only you can view this balance." : "Add money to start building your balance."}</p>
        <div className={styles.homeActions}><ActionButton onClick={() => v2.openDialog("add-money")} disabled={v2.busy}>Add money</ActionButton><ActionButton onClick={() => v2.openDialog("withdraw")} disabled={v2.busy || data?.privateHandlesRead !== true}>Withdraw</ActionButton>{data?.privateHandlesRead ? <button className={styles.textAction} type="button" disabled={v2.busy} onClick={v2.revealSavings}>{v2.revealedSavingsValue === null ? "View balance" : "Hide balance"}</button> : null}</div>
        <p className={styles.homeFine}>Your wallet will ask you to review each step before anything happens.</p>
      </article>
      <article className={`${styles.panel} ${styles.goldPrizeCard}`}>
        <div className={styles.panelHeader}><div><p className={styles.panelKicker}>YOUR CHANCE TO WIN</p><h2 className={styles.panelTitle}>Prize Savings</h2></div><Status tone={data?.autoEntryEnabled ? "good" : "neutral"}>{data?.autoEntryEnabled === null || !data ? "Checking" : data.autoEntryEnabled ? "On" : "Off"}</Status></div>
        <p className={styles.homeState}>{data ? v2.entryStatus.message : "Checking Prize Savings status."}</p>
        <div className={styles.homeMetaGrid}><div><span>Next draw</span><strong>{v2FormatDate(v2.nextDraw)}</strong></div><div><span>Entry funding</span><strong>{v2.entryBalanceLabel}</strong></div></div>
        <div className={styles.homeActions}>{!v2.prizeSavingsOn ? <ActionButton onClick={() => v2.openDialog("turn-on")} disabled={v2.busy}>Turn on Prize Savings</ActionButton> : null}<ReferenceButton href="/app/profile">Manage Prize Savings</ReferenceButton></div>
      </article>
    </section>

    <section className={styles.homeSection} aria-labelledby="current-draw-heading"><div className={styles.homeSectionHeading}><div><p className={styles.panelKicker}>TODAY&apos;S CHANCE</p><h2 id="current-draw-heading">Current draw</h2></div><Status tone={v2.drawStatus.tone}>{v2.drawStatus.label}</Status></div><CurrentDrawBoard v2={v2} /></section>

    <section className={`${styles.grid} ${styles.gridThree} ${styles.homeSection}`} aria-label="Prize Savings details">
      <article className={`${styles.panel} ${styles.homeTallCard}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>LATEST RESULT</p><h2 className={styles.panelTitle}>Your result</h2></div><Status tone={v2.resultReady ? "good" : "neutral"}>{v2.resultReady ? "Ready" : data ? "Pending" : "Checking"}</Status></div><h3 className={styles.homeSubheading}>{resultCopy}</h3><p className={styles.panelCopy}>{v2.resultReady ? v2.revealedResultValue === null ? "Reveal it when you&apos;re ready." : "You&apos;re already in the next draw." : "Your result will appear here after the draw settles."}</p>{v2.resultReady ? <button className={styles.textAction} type="button" disabled={v2.busy} onClick={v2.revealResult}>{v2.revealedResultValue === null ? "Reveal result" : "Hide result"}</button> : null}</article>
      <article className={`${styles.panel} ${styles.homeTallCard}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>KEEP YOUR CHANCE GOING</p><h2 className={styles.panelTitle}>Entry balance</h2></div><Status tone={v2.entryBalanceTone}>{v2.entryBalanceLabel}</Status></div><h3 className={styles.homeSubheading}>{v2.fundedDraws === null ? "Checking readiness" : v2.fundedDraws > 0n ? "Ready for upcoming draws" : "Add entry balance"}</h3><p className={styles.panelCopy}>Your balance covers automatic entry without a manual step each draw.</p><button className={styles.textAction} type="button" disabled={v2.busy} onClick={() => v2.openDialog("entry-top-up")}>Manage entry balance →</button></article>
      <article className={`${styles.panel} ${styles.homeTallCard}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>HISTORY</p><h2 className={styles.panelTitle}>Recent draws</h2></div><Link className={styles.textAction} href="/app/v2/draws">All draws →</Link></div><RecentDraws v2={v2} /></article>
    </section>

    <section className={`${styles.grid} ${styles.gridTwo} ${styles.homeSection}`} aria-label="Prize Savings settings and Classic Vaults">
      <article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>MANAGE</p><h2 className={styles.panelTitle}>Prize Savings settings</h2></div><Status tone={v2.prizeSavingsOn ? "good" : "neutral"}>{data ? v2.prizeSavingsOn ? "On" : "Off" : "Checking"}</Status></div><div className={styles.settingsList}><div className={styles.settingRow}><div><strong>Top up entry balance</strong><span>{data ? "Ready for upcoming draws" : "Checking live balance"}</span></div><ActionButton onClick={() => v2.openDialog("entry-top-up")} disabled={v2.busy}>Top up</ActionButton></div><div className={styles.settingRow}><div><strong>Withdraw unused entry balance</strong><span>Only funds not reserved for a draw can be withdrawn.</span></div><ActionButton onClick={() => v2.openDialog("entry-withdraw")} disabled={v2.busy || data?.automationCredit === null || data?.automationCredit === 0n}>Withdraw</ActionButton></div><div className={styles.settingRow}><div><strong>Future draw entries</strong><span>{v2.prizeSavingsOn ? "You&apos;ll keep entering automatically." : "Turn Prize Savings on to enter."}</span></div><ActionButton onClick={() => v2.openDialog(v2.prizeSavingsOn ? "turn-off" : "turn-on")} disabled={v2.busy}>{v2.prizeSavingsOn ? "Turn off" : "Turn on"}</ActionButton></div></div><p className={styles.homeFine}>Switching products never moves your money.</p></article>
      <article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>A DIFFERENT WAY TO SAVE</p><h2 className={styles.panelTitle}>Classic Vaults</h2></div><Status tone="neutral">V1</Status></div><p className={styles.panelCopy}>Choose Daily, Weekly, Monthly, or Boost and enter each vault manually.</p><div className={styles.tagList}><span className={styles.tag}>Daily</span><span className={styles.tag}>Weekly</span><span className={styles.tag}>Monthly</span><span className={styles.tag}>Boost</span></div><p className={styles.homeFine}>Classic Vaults and Prize Savings balances always stay separate.</p><Link className={styles.button} href="/app/classic">Explore Classic Vaults</Link></article>
    </section>

    <section className={`${styles.grid} ${styles.gridTwo} ${styles.homeSection}`} aria-label="Rewards and guidance">
      <article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>MONEY</p><h2 className={styles.panelTitle}>Rewards &amp; returns</h2></div><Status tone={data ? "good" : "neutral"}>{data ? "Live status" : "Checking"}</Status></div><div className={styles.referenceList}><div className={styles.referenceRow}><div><strong>Settlement reward</strong><span>{data?.rewardCredit !== null && data?.rewardCredit !== undefined && data.rewardCredit > 0n ? "Ready to claim" : data ? "Nothing ready yet" : "Checking live state"}</span></div><Link className={styles.textAction} href="/app/v2/rewards">View rewards →</Link></div><div className={styles.referenceRow}><div><strong>Entry balance return</strong><span>{v2.resultReady && data?.latestResultRefundClaimed === false ? "Ready after this draw" : data ? "Nothing ready yet" : "Checking live state"}</span></div><Link className={styles.textAction} href="/app/v2/rewards">View returns →</Link></div></div></article>
      <article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>GOOD TO KNOW</p><h2 className={styles.panelTitle}>How Leopold works</h2></div><span className={styles.metricIcon} aria-hidden="true">◈</span></div><p className={styles.panelCopy}>Learn how your balance, draw entries, and results are protected.</p><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/transparency">Visit Transparency</Link></article>
    </section>
    <V2ActionDialog v2={v2} />
  </>;
}

export function V2DrawsPage() {
  const v2 = useV2FunctionalState();
  const data = v2.data;
  const latest = data?.latestResultRound;
  return <><PageHeader kicker="PRIZE SAVINGS" title={<>Draws &amp; results</>} copy="See your current draw and the results that are ready for you." action={<ReferenceButton>Prize Savings home</ReferenceButton>} /><LiveReadNotice v2={v2} /><section className={`${styles.grid} ${styles.gridTwo} ${styles.pageSection}`}><article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>CURRENT DRAW</p><h2 className={styles.panelTitle}>{data ? `Daily draw #${data.roundId.toString()}` : "Current draw"}</h2></div><Status tone={v2.drawStatus.tone}>{v2.drawStatus.label}</Status></div><div className={styles.detailList}><div><span>Draw closes</span><strong>{v2FormatDate(data?.round[1])}</strong></div><div><span>Your entry</span><strong>{v2.entryStatus.label}</strong></div><div><span>Entry balance</span><strong>{v2.entryBalanceLabel}</strong></div></div><p className={styles.panelCopy}>Entry happens automatically while Prize Savings is on. There is no per-draw action.</p></article><article className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>YOUR LATEST RESULT</p><h2 className={styles.panelTitle}>{data?.latestResultRoundId ? `Draw #${data.latestResultRoundId.toString()}` : "No result yet"}</h2></div><Status tone={v2.resultReady ? "good" : "neutral"}>{v2.resultReady ? "Ready" : data ? "Pending" : "Checking"}</Status></div><div className={styles.resultBlank}><strong>{v2.resultReady ? "Your result is ready" : latest ? "Settlement is still in progress." : "No settled result yet."}</strong><span>{v2.resultReady ? "Reveal it privately from the Prize Savings home." : "Results become available after the draw is complete."}</span></div><Link className={`${styles.button} ${styles.buttonSecondary}`} href={v2.resultReady ? "/app#result" : "/app"}>{v2.resultReady ? "Reveal result" : "Go to Prize Savings"}</Link></article></section><section className={`${styles.panel} ${styles.pageSection}`}><div className={styles.homeSectionHeading}><h2>Recent draws</h2><span className={styles.headerMeta}>Live Sepolia data</span></div><RecentDraws v2={v2} /></section></>;
}

function activityLabel(kind: string): string {
  const labels: Record<string, string> = { "v2-add-money": "Added money to savings", "v2-reveal-savings": "Viewed savings balance", "v2-reveal-result": "Viewed draw result", "v2-prize-savings-enable": "Turned on Prize Savings", "v2-prize-savings-disable": "Turned off future draw entries", "v2-entry-balance-top-up": "Added to entry balance", "v2-entry-balance-withdraw": "Withdrew unused entry balance", "v2-withdraw-savings": "Withdrew savings", "v2-claim-reward": "Claimed settlement reward", "v2-claim-refund": "Claimed an entry return" };
  return labels[kind] ?? "Prize Savings update";
}

export function V2ActivityPage() {
  const v2 = useV2FunctionalState();
  const items = v2.history.filter((item) => item.kind.startsWith("v2-"));
  return <><PageHeader kicker="PRIZE SAVINGS" title="Activity" copy="Your savings, draw, and wallet activity in one place." action={<ReferenceButton>Prize Savings home</ReferenceButton>} /><LiveReadNotice v2={v2} /><section className={`${styles.panel} ${styles.activityStatus}`}><div><p className={styles.panelKicker}>LIVE STATUS</p><h2 className={styles.panelTitle}>{v2.data ? `Daily draw #${v2.data.roundId.toString()}` : "Current draw"}</h2><p className={styles.panelCopy}>{v2.data ? v2.entryStatus.message : "Checking live Prize Savings state."}</p></div><Status tone={v2.drawStatus.tone}>{v2.drawStatus.label}</Status></section><section className={`${styles.panel} ${styles.pageSection}`}><div className={styles.homeSectionHeading}><h2>Recent activity</h2><span className={styles.headerMeta}>Only Prize Savings activity</span></div><div className={styles.historyList}>{items.length ? items.map((item) => <div className={styles.historyRow} key={item.id}><div><strong>{activityLabel(item.kind)}</strong><span>{item.hash ? `${item.hash.slice(0, 10)}…` : "Awaiting wallet confirmation"} · Sepolia</span></div><Status tone={item.stage === "complete" ? "good" : "neutral"}>{item.stage === "complete" ? "Confirmed" : item.stage === "failed" ? "Needs attention" : "Processing"}</Status></div>) : <div className={styles.empty}>{v2.data ? "Your Prize Savings activity will appear here." : "Checking live activity state."}</div>}</div></section></>;
}

export function V2RewardsPage() {
  const v2 = useV2FunctionalState();
  const data = v2.data;
  const rewardReady = Boolean(data?.rewardCredit && data.rewardCredit > 0n);
  const refundReady = v2.resultReady && data?.latestResultRefundClaimed === false;
  return <><PageHeader kicker="PRIZE SAVINGS" title={<>Rewards &amp; returns</>} copy="Keep track of draw rewards and entry balance returns." action={<ReferenceButton>Prize Savings home</ReferenceButton>} /><LiveReadNotice v2={v2} /><section className={`${styles.grid} ${styles.gridTwo}`}><article className={styles.panel}><p className={styles.panelKicker}>DRAW RESULT</p><h2 className={styles.panelTitle}>{v2.resultReady ? "Your result is ready" : "No result ready"}</h2><p className={styles.panelCopy}>{v2.resultReady ? "Reveal your result from the Prize Savings home when you&apos;re ready." : "Your result and any prize will appear after a draw settles."}</p><Link className={`${styles.button} ${styles.buttonSecondary}`} href={v2.resultReady ? "/app#result" : "/app"}>{v2.resultReady ? "Reveal result" : "View Prize Savings"}</Link></article><article className={styles.panel}><p className={styles.panelKicker}>ENTRY BALANCE RETURN</p><h2 className={styles.panelTitle}>{refundReady ? "Ready to claim" : "Nothing ready yet"}</h2><p className={styles.panelCopy}>{refundReady ? "Your completed draw has an entry balance return available." : "Returns become available after eligible draw accounting is complete."}</p>{refundReady && data?.latestResultRoundId ? <ActionButton onClick={() => void v2.runAction("v2-claim-refund", (clients) => claimV2Refund(clients, data.latestResultRoundId!))} disabled={v2.busy}>Claim refund</ActionButton> : <ReferenceButton>View returns</ReferenceButton>}</article></section><section className={`${styles.grid} ${styles.gridTwo} ${styles.pageSection}`}><article className={styles.panel}><p className={styles.panelKicker}>SETTLEMENT REWARD</p><div className={styles.rewardValue}>{data?.rewardCredit === null || !data ? "Checking" : `${formatEther(data.rewardCredit)} ETH`}</div><p className={styles.panelCopy}>Rewards earned from eligible draw work are shown here separately from prizes.</p>{rewardReady ? <ActionButton onClick={() => void v2.runAction("v2-claim-reward", (clients) => claimV2Reward(clients))} disabled={v2.busy}>Claim settlement reward</ActionButton> : null}</article><article className={styles.panel}><p className={styles.panelKicker}>ENTRY BALANCE</p><div className={styles.rewardValue}>{data?.automationCredit === null || !data ? "Checking" : `${formatEther(data.automationCredit)} ETH`}</div><p className={styles.panelCopy}>Unused funds stay available for future automatic entries. Reserved funds stay locked until the draw is complete.</p><ActionButton onClick={() => v2.openDialog("entry-top-up")} disabled={v2.busy}>Manage entry balance</ActionButton></article></section></>;
}

export function V2ProfilePage() {
  const auth = useAuth();
  const walletIdentity = useWalletIdentity();
  const v2 = useV2FunctionalState();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const session = walletIdentity.walletSession;
  const walletLinked = Boolean(auth.financialWallet);
  const walletConnected = session.status === "CONNECTED" || session.status === "WRONG_NETWORK";
  const accountStatus = auth.accountStatus === "SIGNED_IN_READY" ? "Account ready" : auth.accountStatus === "AUTH_LOADING" ? "Checking" : "Account setup";
  return <><PageHeader kicker="ACCOUNT · PROFILE" title="Profile" copy="Manage your Leopold account, experience, and privacy preferences." action={<Status tone={auth.accountStatus === "SIGNED_IN_READY" ? "good" : "neutral"}>{accountStatus}</Status>} /><section className={styles.profileGrid}>
    <article className={`${styles.panel} ${styles.profilePanel}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>LEOPOLD ACCOUNT</p><h2 className={styles.panelTitle}>Your account</h2></div><Status tone={auth.authenticated ? "good" : "neutral"}>{auth.authenticated ? "Verified" : "Checking"}</Status></div><div className={styles.profileValue}>{auth.username ?? "Your account"}</div><p className={styles.panelCopy}>Your account identity stays separate from your financial wallet.</p><div className={styles.profileActions}><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => void auth.signOut().then(() => router.push("/login"))}>Sign out</button></div></article>
    <article className={`${styles.panel} ${styles.profilePanel}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>EXPERIENCE</p><h2 className={styles.panelTitle}>Prize Savings</h2></div><Status tone="gold">V2</Status></div><p className={styles.panelCopy}>Save once and enter upcoming draws automatically.</p><div className={styles.savingActions}><Link className={styles.button} href="/app">Open Overview</Link><Link className={`${styles.button} ${styles.buttonSecondary}`} href="/app/classic">Classic Vaults</Link></div></article>
    <article className={`${styles.panel} ${styles.profilePanel}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>LINKED ACCOUNTS</p><h2 className={styles.panelTitle}>Wallet connection</h2></div><Status tone="neutral">{walletLinked ? (walletConnected ? "Connected" : "Linked") : "Not linked"}</Status></div><div className={styles.setting}><div><strong>Financial wallet</strong><span>Connect the verified wallet used for saving.</span></div><button className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`} type="button" onClick={() => { if (walletLinked) void walletIdentity.connectVerifiedWallet(); else auth.openWalletLink(); }}>{walletConnected ? "Connected" : "Connect"}</button></div><div className={styles.setting}><div><strong>Network</strong><span>Ethereum Sepolia</span></div><span className={styles.listValue}>{session.status === "WRONG_NETWORK" ? "Switch required" : session.status === "CONNECTED" ? "Ready" : "Checking"}</span></div><div className={styles.profileActionRow}><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={!walletConnected} onClick={walletIdentity.disconnectLeopoldWallet}>Disconnect wallet</button><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={!auth.xEnabled} onClick={() => void (auth.xLinked ? auth.unlinkX() : auth.linkX()).catch(() => undefined)}>{auth.xLinked ? "Unlink X" : "Link X"}</button></div></article>
    <article className={`${styles.panel} ${styles.profilePanel}`}><div className={styles.panelHeader}><div><p className={styles.panelKicker}>PRIVACY</p><h2 className={styles.panelTitle}>Your values stay private</h2></div><span className={styles.metricIcon}>◈</span></div><p className={styles.panelCopy}>Balances and results are hidden until you deliberately choose to view them.</p><div className={styles.tagList}><span className={styles.tag}>Balance hidden</span><span className={styles.tag}>Result private</span></div><div className={styles.profilePublic}><div><strong>Make Public</strong><span>Move available private USDC back to public USDC.</span></div><div className={styles.profilePublicForm}><label className={styles.srOnly} htmlFor="v2-make-public-amount">Amount of private USDC</label><div className={styles.profilePublicInput}><input id="v2-make-public-amount" inputMode="decimal" placeholder="0.00" aria-label="Amount of private USDC" value={amount} onChange={(event) => setAmount(event.target.value)} /><span>USDC</span></div><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" disabled={!walletConnected || v2.busy || !amount.trim()} onClick={() => v2.runAmountAction("v2-withdraw-savings", amount, 6, withdrawV2Savings)}>Make Public</button></div>{v2.action.status !== "idle" ? <div className={styles.resultBlank}>{v2.action.status === "error" ? v2.action.error : v2.action.status === "success" ? "Transaction confirmed." : "Updating private USDC…"}</div> : null}</div></article>
  </section><p className={styles.footerNote}>Profile changes affect your view only. Savings remain in their separate experience.</p></>;
}

export function DashboardExperience() {
  return <V2HomePage />;
}
