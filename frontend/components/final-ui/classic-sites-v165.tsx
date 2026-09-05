"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { formatEther } from "viem";

import { ConfigurationStatus, FixtureStatus } from "@/components/configuration-status";
import { useFinancial } from "@/components/financial-provider";
import { formatUsdcAmount, parseUsdcAmount } from "@/lib/leopold/amounts";
import { getVaultConfig, leopoldConfig, type VaultId } from "@/lib/leopold/config";
import { canPrepareVaultWithdrawal, getEffectiveVaultRoundStatus } from "@/lib/leopold/reads";
import { transactionIsBusy } from "@/lib/leopold/transactions";
import styles from "@/components/full-site/leopold-app-ui.module.css";

const vaultNotes: Record<VaultId, string> = {
  daily: "Fast cycle",
  weekly: "Recommended",
  monthly: "Longer cycle",
  boost: "Sponsor-enhanced prizes",
};

const vaultDurations: Record<VaultId, string> = {
  daily: "1 day",
  weekly: "7 days",
  monthly: "30 days",
  boost: "7 days",
};

const vaultImages: Record<VaultId, string> = {
  daily: "/marketing/leopold/leopold-daily.webp",
  weekly: "/marketing/leopold/leopold-weekly.webp",
  monthly: "/marketing/leopold/leopold-monthly.webp",
  boost: "/marketing/leopold/leopold-boost.webp",
};

const vaultIndex: Record<VaultId, string> = {
  daily: "01",
  weekly: "02",
  monthly: "03",
  boost: "04",
};

function subscribeToHashChange(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getSaveHashSnapshot() {
  return typeof window !== "undefined" && window.location.hash === "#save";
}

function getServerSaveHashSnapshot() {
  return false;
}

function PageFrame({ children }: { children: ReactNode }) {
  return <div className={styles.content}>{children}</div>;
}

function PageHeading({ eyebrow, title, copy, action }: { eyebrow: string; title: ReactNode; copy: string; action?: ReactNode }) {
  return (
    <header className={styles.pageHeading}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action}
    </header>
  );
}

function Status({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "gold" | "good" }) {
  const toneClass = tone === "gold" ? styles.statusgold : tone === "good" ? styles.statusgood : "";
  return <span className={`${styles.status} ${toneClass}`}>{children}</span>;
}

function Empty({ title, copy, href, action }: { title: string; copy: string; href?: string; action?: string }) {
  return (
    <div className={styles.empty}>
      <span>◇</span>
      <h3>{title}</h3>
      <p>{copy}</p>
      {href && action ? <Link href={href}>{action} ↗</Link> : null}
    </div>
  );
}

function privatePositionLabel(revealed: boolean, amount: bigint | null | undefined): string {
  return revealed && amount !== null && amount !== undefined ? `${formatUsdcAmount(amount)} USDC` : "•••••• USDC";
}

function ClassicVaultCard({ slug }: { slug: VaultId }) {
  const financial = useFinancial();
  const vault = getVaultConfig(slug)!;
  const state = financial.publicVaultState[slug];
  const status = getEffectiveVaultRoundStatus(state, financial.latestBlockTimestamp);
  const entered = financial.enteredVaults.has(slug);
  const revealed = financial.revealedVaults.has(slug);
  const saveEnabled = financial.fixture || (financial.financialActionsEnabled && status.depositOpen);

  return (
    <article className={`${styles.vaultCard} ${slug === "weekly" ? styles.recommended : ""}`} data-testid={`classic-vault-${slug}`}>
      <figure>
        <img src={vaultImages[slug]} alt={`${vault.name} prize-saving vault`} />
        <span>{vaultIndex[slug]}</span>
      </figure>
      <div>
        <div className={styles.vaultTitleRow}>
          <h3>{vault.name}</h3>
          <span>{vaultNotes[slug]}</span>
        </div>
        <div className={styles.vaultMeta}>
          <span>Round status · {financial.fixture && !state ? "Open" : status.label}</span>
        </div>
        <dl>
          <div><dt>Round duration</dt><dd>{vaultDurations[slug]}</dd></div>
          <div><dt>Prize</dt><dd>{state ? `${formatUsdcAmount(state.publicPrize)} USDC` : "Unavailable"}</dd></div>
          <div><dt>Round status</dt><dd>{financial.fixture && !state ? "Open" : status.label}</dd></div>
        </dl>
        <p>
          <span>Your savings</span>
          <strong>{privatePositionLabel(revealed, financial.vaultPositions[slug])}</strong>
        </p>
        <div className={styles.vaultCardActions}>
          <Link className={styles.outlineButton} href={`/app/classic/vaults/${slug}`}>View</Link>
          {saveEnabled ? (
            <Link className={styles.primaryButton} href={`/app/classic/vaults/${slug}#save`}>Save</Link>
          ) : (
            <button className={styles.primaryButton} type="button" disabled>Save</button>
          )}
        </div>
        {entered ? <Status tone="good">ENTERED</Status> : null}
      </div>
    </article>
  );
}

export function ClassicVaultsSitesPage() {
  return (
    <PageFrame>
      <FixtureStatus />
      <ConfigurationStatus />
      <PageHeading eyebrow="CLASSIC VAULTS" title="Vaults" copy="Choose Daily, Weekly, Monthly, or Boost and enter each draw yourself." />
      <section className={styles.filterBar}>
        <span>4 official vaults</span>
        <div>
          <button type="button" className={styles.selected} aria-pressed="true">All</button>
          <button type="button" aria-pressed="false">Open</button>
          <button type="button" aria-pressed="false">Entered</button>
        </div>
      </section>
      <div className={`${styles.vaultGrid} ${styles.vaultGridLarge}`}>
        {leopoldConfig.vaults.map((vault) => <ClassicVaultCard key={vault.slug} slug={vault.slug} />)}
      </div>
      <section className={styles.privacyBand}>
        <p className={styles.eyebrow}>WHAT REMAINS PRIVATE</p>
        <h2>Your position is not a leaderboard.</h2>
        <p>Individual savings, exact prize weight, accepted ticket, winner and winnings remain encrypted. Only explicitly public round state is shown here.</p>
        <Link href="/transparency">Read protocol transparency ↗</Link>
      </section>
    </PageFrame>
  );
}

function TransactionDrawer({ type, slug, close }: { type: "save" | "withdraw"; slug: VaultId; close: () => void }) {
  const financial = useFinancial();
  const vault = getVaultConfig(slug)!;
  const save = type === "save";
  const state = financial.publicVaultState[slug];
  const status = getEffectiveVaultRoundStatus(state, financial.latestBlockTimestamp);
  const busy = transactionIsBusy(financial.txStage);
  const revealed = financial.revealedVaults.has(slug);
  const entered = financial.enteredVaults.has(slug);
  const canPrepareWithdrawal = financial.fixture || canPrepareVaultWithdrawal(state, financial.latestBlockTimestamp);
  const [amount, setAmount] = useState(save ? "10" : "1");
  const amountId = `transaction-${type}-amount`;
  const titleId = `transaction-${type}-title`;

  const invalidAmount = useMemo(() => {
    try {
      return parseUsdcAmount(amount) <= 0n;
    } catch {
      return true;
    }
  }, [amount]);

  const saveExceedsRevealedBalance = useMemo(() => {
    if (!save || !financial.privateBalanceRevealed || financial.privateBalance === null) return false;
    try {
      return parseUsdcAmount(amount) > financial.privateBalance;
    } catch {
      return true;
    }
  }, [amount, financial.privateBalance, financial.privateBalanceRevealed, save]);

  const withdrawExceedsRevealedPosition = useMemo(() => {
    if (save || !revealed) return false;
    const position = financial.vaultPositions[slug];
    if (position === undefined) return false;
    try {
      return parseUsdcAmount(amount) > position;
    } catch {
      return true;
    }
  }, [amount, financial.vaultPositions, revealed, save, slug]);

  const actionDisabled =
    busy ||
    !financial.financialActionsEnabled ||
    invalidAmount ||
    (save ? (!financial.fixture && !status.depositOpen) || saveExceedsRevealedBalance : !canPrepareWithdrawal || withdrawExceedsRevealedPosition);

  const setMax = () => {
    if (save && financial.privateBalanceRevealed && financial.privateBalance !== null) {
      setAmount(formatUsdcAmount(financial.privateBalance));
      return;
    }
    if (!save && revealed && financial.vaultPositions[slug] !== undefined) {
      setAmount(formatUsdcAmount(financial.vaultPositions[slug]!));
    }
  };

  const runAction = async () => {
    if (!financial.financialActionsEnabled) {
      await financial.connectWallet();
      return;
    }
    if (save) await financial.save(slug, amount);
    else await financial.withdraw(slug, amount);
    close();
  };

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={close}>
      <section
        className={`${styles.modal} ${styles.drawer}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        autoFocus
        onKeyDown={(event) => { if (event.key === "Escape") close(); }}
      >
        <button className={styles.close} type="button" onClick={close} aria-label={`Close ${type} dialog`}>×</button>
        <p className={styles.eyebrow}>{save ? "SAVE" : "WITHDRAW"} · {vault.name.toUpperCase()} VAULT</p>
        <h2 id={titleId}>{save ? <>Enter private <em>savings.</em></> : <>Return your <em>principal.</em></>}</h2>
        <p>{save ? "The amount is prepared as Private USDC before the vault transaction is submitted." : "Withdrawal is independent of whether you win a prize. Availability follows the protocol’s current private liquid buffer."}</p>
        <label className={styles.inputLabel} htmlFor={amountId}>
          Amount
          <span>
            Available: {save
              ? financial.privateBalanceRevealed && financial.privateBalance !== null
                ? `${formatUsdcAmount(financial.privateBalance)} USDC`
                : "private"
              : revealed && financial.vaultPositions[slug] !== undefined
                ? `${formatUsdcAmount(financial.vaultPositions[slug]!)} USDC`
                : "private"}
          </span>
        </label>
        <div className={styles.amountInput}>
          <input id={amountId} inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <b>USDC</b>
          <button type="button" onClick={setMax}>MAX</button>
        </div>
        {!financial.financialActionsEnabled ? (
          <div className={styles.notice}>
            <strong>Wallet connection required</strong>
            <span>Connect the verified wallet and switch to Ethereum Sepolia to continue.</span>
          </div>
        ) : financial.error ? (
          <div className={styles.notice} role="alert">
            <strong>{financial.error.message}</strong>
            <span>{financial.error.technicalDetail ?? "Review the wallet request and try again."}</span>
          </div>
        ) : null}
        <div className={styles.transactionPreview}>
          <div><span>{save ? "Vault" : "Destination"}</span><strong>{save ? `${vault.name} Vault` : "Verified wallet"}</strong></div>
          <div><span>Privacy</span><strong>{save ? "Encrypted position" : "Private withdrawal"}</strong></div>
          <div><span>Network fee</span><strong>Shown by wallet</strong></div>
        </div>
        <button className={styles.primaryButton} type="button" disabled={financial.financialActionsEnabled ? actionDisabled : busy} onClick={() => void runAction().catch(() => undefined)}>
          {!financial.financialActionsEnabled ? "Connect verified wallet" : save ? "Save Privately" : "Withdraw"}
        </button>
        {save ? (
          <button
            className={styles.outlineButton}
            style={{ width: "100%", marginTop: 10 }}
            type="button"
            disabled={busy || !financial.financialActionsEnabled || entered || (!financial.fixture && !status.depositOpen)}
            onClick={() => void financial.enterRound(slug).catch(() => undefined)}
          >
            {entered ? "Entered current prize round" : "Enter Prize Round"}
          </button>
        ) : null}
        {financial.txStage !== "ready" ? <p className={styles.fine}>{financial.txLabel}</p> : null}
        <p className={styles.fine}>Status changes only after the existing wallet and protocol actions return.</p>
      </section>
    </div>
  );
}

export function ClassicVaultDetailSitesPage({ slug }: { slug: VaultId }) {
  const financial = useFinancial();
  const vault = getVaultConfig(slug)!;
  const state = financial.publicVaultState[slug];
  const status = getEffectiveVaultRoundStatus(state, financial.latestBlockTimestamp);
  const entered = financial.enteredVaults.has(slug);
  const revealed = financial.revealedVaults.has(slug);
  const busy = transactionIsBusy(financial.txStage);
  const [flowOverride, setFlow] = useState<"save" | "withdraw" | null | undefined>(undefined);
  const saveHashActive = useSyncExternalStore(subscribeToHashChange, getSaveHashSnapshot, getServerSaveHashSnapshot);
  const flow = flowOverride === undefined ? (saveHashActive ? "save" : null) : flowOverride;

  useEffect(() => {
    if (!flow) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setFlow(null); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [flow]);

  return (
    <PageFrame>
      <Link href="/app/classic/vaults" className={styles.back}>← All vaults</Link>
      <section className={styles.vaultHero}>
        <div>
          <p className={styles.eyebrow}>{vaultNotes[slug]} · OFFICIAL VAULT {vaultIndex[slug]}</p>
          <h1>{vault.name} <em>Vault.</em></h1>
          <p>Private prize savings with a {vaultDurations[slug].toLowerCase()} cadence. Principal stays yours and may be withdrawn independently of prize outcome.</p>
          <div className={styles.heroActions}>
            <button className={styles.primaryButton} type="button" onClick={() => setFlow("save")}>Save Privately</button>
            <button className={styles.outlineButton} type="button" onClick={() => setFlow("withdraw")}>Withdraw</button>
          </div>
        </div>
        <figure>
          <img src={vaultImages[slug]} alt={`${vault.name} prize-saving vault`} />
          <span>{vaultIndex[slug]}</span>
        </figure>
      </section>
      <section className={styles.detailMetrics}>
        <div><span>Round status</span><strong>{financial.fixture && !state ? "Open" : state ? status.label : "Not loaded"}</strong><small>{state ? "Public protocol state" : "Connect protocol state"}</small></div>
        <div><span>Current round</span><strong>{state?.roundId.toString() ?? "—"}</strong><small>Public identifier</small></div>
        <div><span>Prize reserve</span><strong>{state ? formatUsdcAmount(state.publicPrize) : "—"}</strong><small>Public USDC</small></div>
        <div><span>Your savings</span><strong>{revealed && financial.vaultPositions[slug] !== undefined ? formatUsdcAmount(financial.vaultPositions[slug]!) : "••••••"}</strong><small>Private USDC</small></div>
      </section>
      <section className={styles.detailGrid}>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>ROUND TIMELINE</p>
          <h2>From entry to private result.</h2>
          <ol className={styles.timeline}>
            <li><b>01</b><div><strong>Round opens</strong><span>Public entry window begins.</span></div></li>
            <li><b>02</b><div><strong>Save and enter</strong><span>Your private position becomes eligible after successful entry.</span></div></li>
            <li><b>03</b><div><strong>Encrypted draw</strong><span>Onchain randomness selects without exposing private positions.</span></div></li>
            <li><b>04</b><div><strong>Reveal privately</strong><span>Only you request your result.</span></div></li>
          </ol>
        </article>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>YOUR POSITION</p>
          <h2>Private until you ask.</h2>
          <div className={styles.privateValue}>{revealed && financial.vaultPositions[slug] !== undefined ? formatUsdcAmount(financial.vaultPositions[slug]!) : "••••••"} <small>USDC</small></div>
          <button
            className={styles.outlineButton}
            type="button"
            disabled={busy || !financial.financialActionsEnabled}
            onClick={() => {
              if (revealed) financial.hideVault(slug);
              else void financial.revealVault(slug).catch(() => undefined);
            }}
          >
            {revealed ? "Hide private position" : financial.financialActionsEnabled ? "Reveal private position" : "Connect wallet to reveal"}
          </button>
          <p className={styles.fine}>Decrypted values remain in client memory and clear when wallet or network identity changes.</p>
          <div className={styles.buttonRow}>
            <button
              className={styles.primaryButton}
              type="button"
              disabled={busy || !financial.financialActionsEnabled || entered || (!financial.fixture && !status.depositOpen)}
              onClick={() => void financial.enterRound(slug).catch(() => undefined)}
            >
              {entered ? "Entered current round" : "Enter Prize Round"}
            </button>
            {entered ? (
              <button className={styles.outlineButton} type="button" disabled={busy || !financial.financialActionsEnabled} onClick={() => void financial.revealEligibility(slug).catch(() => undefined)}>
                Reveal eligibility
              </button>
            ) : null}
          </div>
        </article>
      </section>
      {financial.txStage !== "ready" ? <div className={styles.notice} role="status"><strong>Transaction status</strong><span>{financial.txLabel}</span></div> : null}
      {financial.error ? <div className={styles.notice} role="alert"><strong>{financial.error.message}</strong><span>{financial.error.technicalDetail ?? "Review the wallet request and try again."}</span></div> : null}
      {flow ? <TransactionDrawer type={flow} slug={slug} close={() => setFlow(null)} /> : null}
    </PageFrame>
  );
}

function RevealPanel({ close, state, resultReady, revealed, resultLabel, reveal }: { close: () => void; state: "idle" | "working"; resultReady: boolean; revealed: boolean; resultLabel: string; reveal: () => void }) {
  const currentStep = revealed ? 4 : state === "working" ? 3 : resultReady ? 2 : 1;
  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={close}>
      <section className={styles.modal} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="reveal-title" tabIndex={-1} autoFocus onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
        <button className={styles.close} type="button" onClick={close} aria-label="Close result reveal dialog">×</button>
        <p className={styles.eyebrow}>PRIVATE RESULT REVEAL</p>
        <h2 id="reveal-title">Your result stays <em>yours.</em></h2>
        <div className={styles.stateRail}>
          <div className={currentStep === 1 ? styles.currentState : ""}><b>01</b><span>Not ready</span></div>
          <div className={currentStep === 2 ? styles.currentState : ""}><b>02</b><span>Reveal available</span></div>
          <div className={currentStep === 3 ? styles.currentState : ""}><b>03</b><span>Decrypting</span></div>
          <div className={currentStep === 4 ? styles.currentState : ""}><b>04</b><span>Result</span></div>
        </div>
        <div className={styles.notice}>
          <strong>{revealed ? resultLabel : resultReady ? "Your private result is ready" : "No revealable result"}</strong>
          <span>{revealed ? "This clear result exists only in the current browser session." : resultReady ? "Use the existing private reveal flow to decrypt only your result." : "The real reveal action becomes available only when an entered round is finalized."}</span>
        </div>
        <button className={styles.primaryButton} type="button" disabled={!resultReady || revealed || state === "working"} onClick={reveal}>Reveal privately</button>
      </section>
    </div>
  );
}

export function ClassicPrizesSitesPage() {
  const financial = useFinancial();
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealWorking, setRevealWorking] = useState(false);

  const currentVault =
    leopoldConfig.vaults.find((vault) => financial.enteredVaults.has(vault.slug)) ??
    leopoldConfig.vaults.find((vault) => financial.publicVaultState[vault.slug] !== undefined) ??
    leopoldConfig.vaults[1] ?? leopoldConfig.vaults[0];
  const slug = currentVault.slug;
  const state = financial.publicVaultState[slug];
  const entered = financial.enteredVaults.has(slug);
  const resultReady = financial.fixture ? entered : entered && state?.state === 14;
  const revealed = financial.revealedResults.has(slug);
  const result = financial.privateResults[slug];
  const resultLabel = revealed ? (result === 0n ? "No prize this round" : `Won · ${formatUsdcAmount(result ?? 0n)} USDC`) : "Hidden";

  useEffect(() => {
    if (!revealOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setRevealOpen(false); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [revealOpen]);

  const reveal = async () => {
    if (!resultReady || revealed) return;
    setRevealWorking(true);
    try {
      await financial.revealResult(slug);
    } finally {
      setRevealWorking(false);
    }
  };

  return (
    <PageFrame>
      <FixtureStatus />
      <ConfigurationStatus />
      <PageHeading eyebrow="PRIZES" title="Prizes" copy="Prize entry is public. Your exact chances, result, and winnings stay private." />
      <section className={styles.prizeHero}>
        <div>
          <p className={styles.eyebrow}>CURRENT ROUND</p>
          <h2>{state ? `${currentVault.name} Vault · Round ${state.roundId.toString()}` : "No current round loaded."}</h2>
          <p>{state ? (entered ? "You entered this round. Your private ticket, exact prize weight and result are not reconstructed publicly." : "Connect the verified wallet and enter an open Classic vault to participate. Private tickets and prize weights are never reconstructed publicly.") : "Connect the verified wallet and protocol data to see current entries. Private tickets and prize weights are never reconstructed publicly."}</p>
          <Link href={`/app/classic/vaults/${slug}`}>{entered ? "Open current vault" : "Find an open vault"} ↗</Link>
        </div>
        <div className={styles.orbit} aria-hidden="true"><i /><i /><i /><span>64</span><small>ENCRYPTED BITS</small></div>
      </section>
      <section className={styles.tabRow} aria-label="Prize round views">
        <button type="button" className={styles.selected} aria-pressed="true">Current</button>
        <button type="button" aria-pressed="false">Upcoming</button>
        <button type="button" aria-pressed="false">Completed</button>
      </section>
      <div className={styles.prizeGrid}>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>YOUR RESULT</p>
          <h2>{revealed ? resultLabel : resultReady ? "Result ready." : "Result unavailable."}</h2>
          <p>{revealed ? "Your result was revealed only in this browser session." : resultReady ? "Your private result is ready for a deliberate reveal." : "No completed entered round is available for private reveal."}</p>
          <button className={`${styles.outlineButton} ${styles.revealStatesButton}`} type="button" onClick={() => setRevealOpen(true)}>Reveal Private Result</button>
        </article>
        <article className={styles.panel}>
          <p className={styles.eyebrow}>ROUND HISTORY</p>
          {revealed ? (
            <div className={styles.listRow}><div><strong>{currentVault.name} Vault</strong><span>Round {state?.roundId.toString() ?? "—"}</span></div><span>{resultLabel}</span></div>
          ) : (
            <Empty title="No prize history" copy="Completed rounds you entered will appear here without exposing your private savings position." />
          )}
        </article>
      </div>
      {revealOpen ? <RevealPanel close={() => setRevealOpen(false)} state={revealWorking ? "working" : "idle"} resultReady={Boolean(resultReady)} revealed={revealed} resultLabel={resultLabel} reveal={() => void reveal().catch(() => undefined)} /> : null}
    </PageFrame>
  );
}

export function ClassicActivitySitesPage() {
  const financial = useFinancial();
  return (
    <PageFrame>
      <FixtureStatus />
      <PageHeading eyebrow="ACTIVITY" title="Activity" copy="Public transactions for this wallet. Confidential values are never reconstructed here." />
      <section className={styles.filterBar}>
        <span>Browser session</span>
        <div>
          <button type="button" className={styles.selected} aria-pressed="true">All</button>
          <button type="button" aria-pressed="false">Deposits</button>
          <button type="button" aria-pressed="false">Withdrawals</button>
          <button type="button" aria-pressed="false">Prizes</button>
        </div>
      </section>
      <article className={styles.panel}>
        <div className={styles.tableHead}><span>Action</span><span>Vault / network</span><span>Status</span><span>Transaction</span></div>
        {financial.activity.length ? (
          financial.activity.map((item) => (
            <div className={styles.listRow} key={item.id}>
              <div><strong>{item.label}</strong><span>{item.vault ? `${item.vault} Vault` : "Leopold"}</span></div>
              <span>Ethereum Sepolia</span>
              <Status tone={item.status === "Confirmed" ? "good" : "gold"}>{item.status.toUpperCase()}</Status>
              <span>Browser session</span>
            </div>
          ))
        ) : (
          <Empty title="No recent Leopold activity" copy="Deposits, withdrawals, entries, reveals and claims will appear after the existing actions report them." />
        )}
      </article>
    </PageFrame>
  );
}

export function ClassicRewardsSitesPage() {
  const financial = useFinancial();
  const busy = transactionIsBusy(financial.txStage);
  const liveRefundVault = leopoldConfig.vaults.find((vault) => {
    const state = financial.publicVaultState[vault.slug];
    return state?.entered && state.state === 14 && !state.refundClaimed;
  });
  const refundVault = financial.fixture && financial.enteredVaults.has("weekly") ? leopoldConfig.vaults.find((vault) => vault.slug === "weekly") : liveRefundVault;
  const refundAmount = financial.fixture && refundVault ? 2_500_000_000_000_000n : refundVault ? financial.publicVaultState[refundVault.slug]?.refundAmount : undefined;
  const rewardTotal = leopoldConfig.vaults.reduce((total, vault) => total + (financial.publicVaultState[vault.slug]?.settlementReward ?? 0n), 0n);
  const claimHistory = financial.activity.some((item) => /claim/i.test(item.label));

  return (
    <PageFrame>
      <FixtureStatus />
      <ConfigurationStatus />
      <PageHeading eyebrow="REWARDS" title="Rewards" copy="Refundable bonds and settlement rewards are separate from prizes and savings." />
      <section className={styles.metrics}>
        <article className={styles.metricHero}>
          <div><span>Bond refunds</span><Status>{refundAmount === undefined ? "UNAVAILABLE" : "AVAILABLE"}</Status></div>
          <strong>{refundAmount === undefined ? "—" : formatEther(refundAmount)} <small>ETH</small></strong>
          <p>Available after public bond accounting finalizes for an entered round.</p>
          <button type="button" disabled={busy || !financial.financialActionsEnabled || !refundVault || refundAmount === undefined} onClick={() => { if (refundVault) void financial.claimRefund(refundVault.slug).catch(() => undefined); }}>Claim refund</button>
        </article>
        <article>
          <div><span>Settlement rewards</span><Status>{rewardTotal > 0n ? "AVAILABLE" : "UNAVAILABLE"}</Status></div>
          <strong>{financial.fixture ? "0" : leopoldConfig.ready ? formatEther(rewardTotal) : "—"} <small>ETH</small></strong>
          <p>Credited only when this address performs permissionless draw-finalization work.</p>
        </article>
        <article>
          <div><span>Claimed rewards</span><Status>{claimHistory ? "HISTORY" : "NO HISTORY"}</Status></div>
          <strong>—</strong>
          <p>Completed public reward claims will appear here.</p>
        </article>
      </section>
      <article className={styles.panel}>
        <div className={styles.panelTitle}><div><p className={styles.eyebrow}>BY VAULT</p><h2>Reward availability.</h2></div></div>
        {leopoldConfig.vaults.map((vault) => {
          const reward = financial.publicVaultState[vault.slug]?.settlementReward;
          return (
            <div className={styles.listRow} key={vault.slug}>
              <div><strong>{vault.name} Vault</strong><span>Settlement reward credit</span></div>
              <span>{reward === undefined ? "Unavailable" : `${formatEther(reward)} ETH`}</span>
              <button type="button" disabled={busy || !financial.financialActionsEnabled || !reward || reward <= 0n} onClick={() => void financial.claimRewards(vault.slug).catch(() => undefined)}>Claim</button>
            </div>
          );
        })}
      </article>
      {financial.txStage !== "ready" ? <div className={styles.notice} role="status"><strong>Transaction status</strong><span>{financial.txLabel}</span></div> : null}
    </PageFrame>
  );
}
