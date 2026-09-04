"use client";

import Link from "next/link";
import { formatUnits } from "viem";

import { useLeopoldUiController, type UiVaultSummary } from "@/components/leopold-ui-controller";
import styles from "@/components/full-site/leopold-app-ui.module.css";

const vaultArtwork: Record<string, string> = {
  daily: "/marketing/leopold/leopold-daily.webp",
  weekly: "/marketing/leopold/leopold-weekly.webp",
  monthly: "/marketing/leopold/leopold-monthly.webp",
  boost: "/marketing/leopold/leopold-boost.webp",
};

function Status({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "gold" | "good" }) {
  return <span className={`${styles.status} ${styles[`status${tone}`]}`}>{children}</span>;
}

function privateAmount(vault: UiVaultSummary): string {
  if (vault.privateSavings.state !== "revealed" || vault.privateSavings.value === null) return "••••••";
  return formatUnits(vault.privateSavings.value, 6);
}

function VaultCard({ vault, index }: { vault: UiVaultSummary; index: number }) {
  return <article className={`${styles.vaultCard} ${vault.recommended ? styles.recommended : ""}`}>
    <figure><img src={vaultArtwork[vault.id]} alt={`${vault.name} prize-saving vault`} /><span>{String(index + 1).padStart(2, "0")}</span></figure>
    <div><div className={styles.vaultTitleRow}><h3>{vault.name}</h3><span>{vault.recommended ? "Recommended" : `${Math.round(vault.durationSeconds / 86_400)} day cycle`}</span></div><div className={styles.vaultMeta}><span>Round status · {vault.round.label}</span></div><dl><div><dt>Current round</dt><dd>{vault.round.id?.toString() ?? "—"}</dd></div><div><dt>Prize reserve</dt><dd>{vault.round.publicPrizeReserve === null ? "—" : `${formatUnits(vault.round.publicPrizeReserve, 6)} USDC`}</dd></div><div><dt>Entry</dt><dd>{vault.round.entered ? "Entered" : "Not entered"}</dd></div></dl><p><span>Your savings</span><strong>{privateAmount(vault)} USDC</strong></p><div className={styles.vaultCardActions}><Link className={styles.outlineButton} href={`/app/vaults/${vault.id}`}>View</Link><Link className={styles.primaryButton} href={`/app/vaults/${vault.id}#save`}>Save</Link></div></div>
  </article>;
}

export function ClassicDashboardExperience() {
  const controller = useLeopoldUiController();
  const connected = controller.wallet.state === "connected";
  const savingsValue = controller.balances.privateUsdc.state === "revealed" && controller.balances.privateUsdc.value !== null
    ? `${formatUnits(controller.balances.privateUsdc.value, 6)} USDC`
    : "•••••• USDC";
  const availableValue = controller.balances.publicUsdc.value === null ? "•••••• USDC" : `${formatUnits(controller.balances.publicUsdc.value, 6)} USDC`;
  const nextVault = controller.vaults.find((vault) => vault.state === "open") ?? controller.vaults.find((vault) => vault.recommended) ?? controller.vaults[0];
  const entered = controller.vaults.filter((vault) => vault.round.entered);
  return <div className={styles.content}>
    <header className={styles.pageHeading}><div><p className={styles.eyebrow}>CLASSIC VAULTS</p><h1>Good to see you.</h1><p>Choose a savings schedule, enter its draw, and manage your classic vaults.</p></div><Link className={styles.outlineButton} href="/app/vaults">Explore vaults ↗</Link></header>
    {!connected ? <section className={styles.alert} role="status"><div><b>Financial wallet not connected</b><span>Connect the verified external wallet linked to your Leopold account to load financial state.</span></div><button type="button" onClick={() => void controller.wallet.actions.connect().catch(() => undefined)}>Connect verified wallet</button></section> : null}
    {controller.transactions.current.state === "failure" ? <section className={styles.alert} role="alert"><div><b>Wallet action needs attention</b><span>{controller.transactions.current.error?.message ?? controller.transactions.current.label}</span></div><button type="button" onClick={() => void controller.refresh()}>Refresh</button></section> : null}
    <section className={styles.metrics}>
      <article className={styles.metricHero}><div><span>Your savings</span><Status>{controller.balances.privateUsdc.state === "revealed" ? "VISIBLE" : "HIDDEN"}</Status></div><strong>{savingsValue.replace(" USDC", "")} <small>USDC</small></strong><p>Reveal each vault to view its balance.</p><Link href="/app/vaults">Review vault savings ↗</Link></article>
      <article><div><span>Available to save</span><Status tone={controller.balances.publicUsdc.state === "available" ? "good" : "gold"}>{controller.balances.publicUsdc.state === "available" ? "READY" : "CHECKING"}</Status></div><strong>{availableValue.replace(" USDC", "")} <small>USDC</small></strong><button className={styles.premiumGoldButton} type="button" onClick={() => void controller.balances.actions.revealPrivateUsdc().catch(() => undefined)} disabled={!controller.wallet.canUseFinancialActions}>{controller.balances.privateUsdc.state === "revealed" ? "Hide balance" : "View balance"}</button></article>
      <article><div><span>Next prize opportunity</span><Status tone="gold">{nextVault?.round.label ?? "CHECKING"}</Status></div><strong className={styles.metricName}>{nextVault?.name ?? "Vault"}</strong><p>Save and enter while the round is open.</p><Link href="/app/prizes">View prize center ↗</Link></article>
    </section>
    <section className={styles.section}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>FOUR OFFICIAL VAULTS</p><h2>Choose a vault</h2></div><Link href="/app/vaults">View all vaults →</Link></div><div className={styles.vaultGrid}>{controller.vaults.map((vault, index) => <VaultCard key={vault.id} vault={vault} index={index} />)}</div></section>
    <section className={styles.twoColumns}>
      <article className={styles.panel}><div className={styles.panelTitle}><div><p className={styles.eyebrow}>PRIZE STATUS</p><h2>Prize entries.</h2></div><Link href="/app/prizes">View prizes →</Link></div>{entered.length ? <div>{entered.map((vault) => <div className={styles.listRow} key={vault.id}><div><strong>{vault.name} Vault</strong><span>Round {vault.round.id?.toString() ?? "—"} · {vault.round.label}</span></div><Status tone="good">ENTERED</Status></div>)}</div> : <div className={styles.empty}><span>◇</span><h3>No entered rounds yet</h3><p>Open prize entries will appear after a successful vault entry transaction.</p><Link href="/app/vaults">Choose a vault ↗</Link></div>}</article>
      <article className={styles.panel}><div className={styles.panelTitle}><div><p className={styles.eyebrow}>PRIVACY-SAFE HISTORY</p><h2>Recent activity.</h2></div><Link href="/app/activity">All activity ↗</Link></div>{controller.transactions.history.length ? <div>{controller.transactions.history.slice(0, 4).map((transaction) => <div className={styles.listRow} key={transaction.id}><div><strong>{transaction.kind.replaceAll("-", " ")}</strong><span>{new Date(transaction.updatedAt).toLocaleString()}</span></div><Status tone={transaction.state === "failure" ? "gold" : "neutral"}>{transaction.label}</Status></div>)}</div> : <div className={styles.empty}><span>◇</span><h3>No recent activity</h3><p>This browser session has no Leopold transaction history yet.</p></div>}</article>
    </section>
  </div>;
}
