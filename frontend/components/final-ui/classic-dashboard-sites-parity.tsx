"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

import { useLeopoldUiController, type UiPrivateValue, type UiVaultSummary } from "@/components/leopold-ui-controller";
import styles from "@/components/full-site/leopold-app-ui.module.css";

const USDC_DECIMALS = 6n;
const USDC_SCALE = 10n ** USDC_DECIMALS;

const vaultPresentation = {
  daily: { note: "Fast cycle", image: "/marketing/leopold/leopold-daily.webp" },
  weekly: { note: "Recommended", image: "/marketing/leopold/leopold-weekly.webp" },
  monthly: { note: "Longer cycle", image: "/marketing/leopold/leopold-monthly.webp" },
  boost: { note: "Sponsor-enhanced prizes", image: "/marketing/leopold/leopold-boost.webp" },
} as const;

function formatUsdc(value: bigint | null): string {
  if (value === null) return "—";
  const whole = value / USDC_SCALE;
  const fraction = (value % USDC_SCALE).toString().padStart(Number(USDC_DECIMALS), "0").replace(/0+$/, "");
  return fraction ? `${whole.toLocaleString()}.${fraction}` : whole.toLocaleString();
}

function protectedAmount(value: UiPrivateValue<bigint>): string {
  if (value.state === "revealed") return `${formatUsdc(value.value)} USDC`;
  if (value.state === "revealing") return "Revealing…";
  if (value.state === "reveal-failed") return "Reveal failed";
  return "•••••• USDC";
}

function durationLabel(seconds: number): string {
  if (seconds === 86_400) return "1 day";
  if (seconds === 604_800) return "7 days";
  if (seconds === 2_592_000) return "30 days";
  const days = Math.max(1, Math.round(seconds / 86_400));
  return `${days} days`;
}

function vaultStatus(vault: UiVaultSummary): string {
  if (vault.round.entered) return "Entered";
  if (vault.state === "open") return "Open";
  if (vault.state === "closed") return "Round ended";
  if (vault.state === "settling") return "Settling";
  if (vault.state === "settled") return "Settled";
  return "Unavailable";
}

export function ClassicDashboardSitesParity() {
  const controller = useLeopoldUiController();
  const privateUsdc = controller.balances.privateUsdc;
  const enteredVaults = controller.vaults.filter((vault) => vault.round.entered);
  const nextOpportunity = controller.vaults.find((vault) => vault.state === "open" && !vault.round.entered)
    ?? controller.vaults.find((vault) => vault.state === "open")
    ?? null;

  const revealedSavings = useMemo(() => {
    let total = 0n;
    let count = 0;
    for (const vault of controller.vaults) {
      if (vault.privateSavings.state === "revealed" && vault.privateSavings.value !== null) {
        total += vault.privateSavings.value;
        count += 1;
      }
    }
    return { total, count };
  }, [controller.vaults]);

  const totalSavingsLabel = revealedSavings.count
    ? `${formatUsdc(revealedSavings.total)} USDC`
    : "•••••• USDC";

  const revealPrivate = async () => {
    if (privateUsdc.state === "revealed") {
      controller.balances.actions.hidePrivateUsdc();
      return;
    }
    await controller.balances.actions.revealPrivateUsdc();
  };

  return (
    <div className={styles.content}>
      <section className={styles.pageHeading}>
        <div>
          <span className={styles.eyebrow}>CLASSIC VAULTS</span>
          <h1>Good to see you.</h1>
          <p>Save privately in Daily, Weekly, Monthly, or Boost and enter each prize round yourself.</p>
        </div>
        <Link className={styles.outlineButton} href="/app/classic/vaults">Explore vaults</Link>
      </section>

      {!controller.wallet.canUseFinancialActions ? (
        <section className={styles.alert} role="status">
          <div>
            <strong>Financial wallet not connected.</strong>
            <span>Connect your verified wallet to save, enter, reveal, withdraw, or claim.</span>
          </div>
          <button type="button" onClick={() => void controller.wallet.actions.connect().catch(() => undefined)}>
            Connect verified wallet
          </button>
        </section>
      ) : null}

      {controller.transactions.current.state !== "idle" ? (
        <section className={styles.alert} aria-live="polite">
          <div>
            <strong>{controller.transactions.current.label || "Transaction in progress"}</strong>
            <span>{controller.transactions.current.error?.message ?? "Leopold is tracking this action without automatically repeating the write."}</span>
          </div>
          <span>{controller.transactions.current.state.replaceAll("-", " ")}</span>
        </section>
      ) : null}

      <section className={styles.metrics}>
        <article className={styles.metricHero}>
          <div><span>Your savings</span><span>{revealedSavings.count}/{controller.vaults.length} revealed</span></div>
          <strong>{totalSavingsLabel}</strong>
          <p>Your Classic Vault savings stay private until you deliberately reveal each value.</p>
          <Link href="/app/classic/vaults">View your vaults</Link>
        </article>

        <article>
          <div><span>Available to save</span><span>{privateUsdc.state.replaceAll("-", " ")}</span></div>
          <strong>{protectedAmount(privateUsdc)}</strong>
          <button
            className={styles.premiumGoldButton}
            type="button"
            disabled={!controller.wallet.canUseFinancialActions || privateUsdc.state === "revealing"}
            onClick={() => void revealPrivate().catch(() => undefined)}
          >
            {privateUsdc.state === "revealed" ? "Hide balance" : privateUsdc.state === "revealing" ? "Revealing…" : "View balance"}
          </button>
        </article>

        <article>
          <div><span>Next prize opportunity</span><span>{nextOpportunity ? vaultStatus(nextOpportunity) : "Checking"}</span></div>
          <strong className={styles.metricName}>{nextOpportunity?.name ?? "No open round"}</strong>
          <p>{nextOpportunity ? `${durationLabel(nextOpportunity.durationSeconds)} round · ${nextOpportunity.round.participantCount?.toString() ?? "—"} public participants` : "The next available Classic round will appear here."}</p>
          <Link href="/app/classic/prizes">View prizes</Link>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>CHOOSE A VAULT</span>
            <h2>Choose a vault.</h2>
          </div>
          <Link href="/app/classic/vaults">View all vaults</Link>
        </div>

        <div className={styles.vaultGrid}>
          {controller.vaults.map((vault, index) => {
            const status = vaultStatus(vault);
            const presentation = vaultPresentation[vault.id];
            return (
              <article className={`${styles.vaultCard} ${vault.recommended ? styles.recommended : ""}`} key={vault.id}>
                <Link href={`/app/classic/vaults/${vault.id}`}>
                  <figure>
                    <Image src={presentation.image} alt={`${vault.name} Classic Vault`} fill sizes="(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 25vw" />
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.status}>{status}</span>
                  </figure>
                  <div>
                    <div className={styles.vaultTitleRow}>
                      <h3>{vault.name}</h3>
                      <span>{presentation.note}</span>
                    </div>
                    <dl>
                      <div><dt>Round duration</dt><dd>{durationLabel(vault.durationSeconds)}</dd></div>
                      <div><dt>Prize</dt><dd>{vault.round.publicPrizeReserve !== null ? `${formatUsdc(vault.round.publicPrizeReserve)} USDC` : "—"}</dd></div>
                      <div><dt>Round status</dt><dd>{status}</dd></div>
                    </dl>
                    <p><span>Your savings</span><strong>{protectedAmount(vault.privateSavings)}</strong></p>
                  </div>
                </Link>
                <div className={styles.buttonRow} style={{ padding: "0 18px 18px", marginTop: 0 }}>
                  <Link className={styles.outlineButton} href={`/app/classic/vaults/${vault.id}`}>View</Link>
                  <Link className={styles.primaryButton} href={`/app/classic/vaults/${vault.id}`}>Save</Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <div><span className={styles.eyebrow}>PRIZE ENTRIES</span><h2>Prize entries.</h2></div>
            <Link href="/app/classic/prizes">All prizes</Link>
          </div>
          {enteredVaults.length ? enteredVaults.map((vault) => (
            <div className={styles.listRow} key={vault.id}>
              <div><strong>{vault.name}</strong><span>{vault.round.label} · Round {vault.round.id?.toString() ?? "—"}</span></div>
              <span>Entered</span>
            </div>
          )) : (
            <div className={styles.empty}>
              <span>◇</span><h3>No prize entries yet</h3><p>Enter an open Classic Vault round and it will appear here.</p>
              <Link href="/app/classic/vaults">Choose a vault</Link>
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <div><span className={styles.eyebrow}>RECENT ACTIVITY</span><h2>Recent activity.</h2></div>
            <Link href="/app/classic/activity">All activity</Link>
          </div>
          {controller.transactions.history.length ? controller.transactions.history.slice(0, 4).map((item) => (
            <div className={styles.listRow} key={item.id}>
              <div><strong>{item.label}</strong><span>{item.hash ? `${item.hash.slice(0, 10)}…${item.hash.slice(-6)}` : "No public hash yet"}</span></div>
              <span>{item.state.replaceAll("-", " ")}</span>
            </div>
          )) : (
            <div className={styles.empty}>
              <span>◇</span><h3>No recent activity</h3><p>Your Classic Vault transactions will appear here after you use the app.</p>
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
