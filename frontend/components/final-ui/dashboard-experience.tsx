"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";

import { useLeopoldUiController, type UiPrivateValue, type UiVaultSummary } from "@/components/leopold-ui-controller";
import styles from "@/components/full-site/leopold-app-ui.module.css";

const USDC_DECIMALS = 6n;
const USDC_SCALE = 10n ** USDC_DECIMALS;

const vaultPresentation = {
  daily: { note: "Fast rhythm", image: "/marketing/leopold/leopold-daily.webp" },
  weekly: { note: "Recommended", image: "/marketing/leopold/leopold-weekly.webp" },
  monthly: { note: "Long horizon", image: "/marketing/leopold/leopold-monthly.webp" },
  boost: { note: "Sponsor enhanced", image: "/marketing/leopold/leopold-boost.webp" },
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

function shortAddress(address: string | null): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";
}

function durationLabel(seconds: number): string {
  if (seconds === 86_400) return "Daily";
  if (seconds === 604_800) return "Weekly";
  if (seconds === 2_592_000) return "30 days";
  const days = Math.max(1, Math.round(seconds / 86_400));
  return `${days} days`;
}

function vaultStatus(vault: UiVaultSummary): string {
  if (vault.round.entered) return "Entered";
  if (vault.state === "open") return "Open";
  if (vault.state === "closed") return "Closed";
  if (vault.state === "settling") return "Settling";
  if (vault.state === "settled") return "Settled";
  return "Unavailable";
}

export function DashboardExperience() {
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
          <span className={styles.eyebrow}>Private savings overview</span>
          <h1>{controller.account.username ? `Welcome back, ${controller.account.username}.` : "Your private savings."}</h1>
          <p>One place for savings, prize rounds and wallet activity — with private values hidden until you choose to reveal them.</p>
        </div>
        <div className={styles.outlineButton}>
          <span>Financial wallet</span>
          <strong>{shortAddress(controller.wallet.address)}</strong>
          <small>{controller.wallet.state === "connected" ? "Ethereum Sepolia" : controller.wallet.state.replaceAll("-", " ")}</small>
        </div>
      </section>

      {controller.transactions.current.state !== "idle" ? (
        <section className={styles.alert} aria-live="polite">
          <span>LIVE</span>
          <div>
            <strong>{controller.transactions.current.label || "Transaction in progress"}</strong>
            <p>{controller.transactions.current.error?.message ?? "Leopold is tracking this action. A new write will never be retried automatically."}</p>
          </div>
          <span>
            {controller.transactions.current.state.replaceAll("-", " ")}
          </span>
        </section>
      ) : null}

      <section className={styles.metrics}>
        <article className={styles.metricHero}>
          <div>
            <span>Total private savings</span>
            <span>{revealedSavings.count}/{controller.vaults.length} vaults revealed</span>
          </div>
          <strong>{totalSavingsLabel}</strong>
          <p>Calculated only from vault values you have explicitly revealed in this browser session.</p>
          <Link href="/app/vaults">Review vault savings <span>↗</span></Link>
        </article>

        <article>
          <div>
            <span>Private USDC available</span>
            <span>{privateUsdc.state.replaceAll("-", " ")}</span>
          </div>
          <strong>{protectedAmount(privateUsdc)}</strong>
          <button
            className={styles.outlineButton}
            type="button"
            disabled={!controller.wallet.canUseFinancialActions || privateUsdc.state === "revealing"}
            onClick={() => void revealPrivate().catch(() => undefined)}
          >
            {privateUsdc.state === "revealed" ? "Hide balance" : privateUsdc.state === "revealing" ? "Revealing…" : "Reveal Private USDC"}
          </button>
          {privateUsdc.state === "reveal-failed" ? <p>The value stayed private. You can try revealing it again.</p> : null}
        </article>

        <article>
          <div>
            <span>Next prize opportunity</span>
            <span>{nextOpportunity ? vaultStatus(nextOpportunity) : "Checking"}</span>
          </div>
          <strong className={styles.metricName}>{nextOpportunity?.name ?? "No open round"}</strong>
          <p>{nextOpportunity ? `${durationLabel(nextOpportunity.durationSeconds)} cadence · ${nextOpportunity.round.participantCount?.toString() ?? "—"} public participants` : "Leopold will show the next open round here when current state is available."}</p>
          <Link href="/app/prizes">View prize rounds <span>↗</span></Link>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Four official vaults</span>
            <h2>Choose your saving rhythm.</h2>
          </div>
          <Link href="/app/vaults">View all vaults <span>→</span></Link>
        </div>

        <div className={styles.vaultGrid}>
          {controller.vaults.map((vault, index) => (
            <Link className={`${styles.vaultCard} ${vault.recommended ? styles.recommended : ""}`} href={`/app/vaults/${vault.id}`} key={vault.id}>
              <figure>
                <Image src={vaultPresentation[vault.id].image} alt={`${vault.name} prize-saving vault`} fill sizes="(max-width: 760px) 100vw, (max-width: 1200px) 50vw, 25vw" />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </figure>
              <div>
                <div className={styles.vaultTitleRow}>
                  <h3>{vault.name}</h3>
                  <span>{vaultPresentation[vault.id].note}</span>
                </div>
                <div className={styles.vaultMeta}>
                  <span>{vaultStatus(vault)}</span>
                  {vault.round.label !== vaultStatus(vault) ? <span>{vault.round.label}</span> : null}
                </div>
                <dl>
                  <div><dt>Cadence</dt><dd>{durationLabel(vault.durationSeconds)}</dd></div>
                  <div><dt>Round</dt><dd>{vault.round.id?.toString() ?? "—"}</dd></div>
                  <div><dt>Prize reserve</dt><dd>{vault.round.publicPrizeReserve !== null ? `${formatUsdc(vault.round.publicPrizeReserve)} USDC` : "—"}</dd></div>
                </dl>
                <p>
                  <span>Your savings</span>
                  <strong>{protectedAmount(vault.privateSavings)}</strong>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.twoColumns}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <div><span className={styles.eyebrow}>Prize status</span><h2>Your entered rounds.</h2></div>
            <Link href="/app/prizes">All prizes ↗</Link>
          </div>
          {enteredVaults.length ? enteredVaults.map((vault) => (
            <div className={styles.listRow} key={vault.id}>
              <div>
                <strong>{vault.name}</strong>
                <span>{vault.round.label} · Round {vault.round.id?.toString() ?? "—"}</span>
              </div>
              <span>Entered</span>
            </div>
          )) : (
            <div className={styles.empty}>
              <span>◇</span>
              <h3>No entered rounds yet</h3>
              <p>Open prize entries will appear after a successful vault entry transaction.</p>
              <Link href="/app/vaults">Choose a vault ↗</Link>
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <div><span className={styles.eyebrow}>Privacy-safe history</span><h2>Recent activity.</h2></div>
            <Link href="/app/activity">All activity ↗</Link>
          </div>
          {controller.transactions.history.length ? controller.transactions.history.slice(0, 4).map((item) => (
            <div className={styles.listRow} key={item.id}>
              <div>
                <strong>{item.label}</strong>
                <span>{item.hash ? `${item.hash.slice(0, 10)}…${item.hash.slice(-6)}` : "No public hash yet"}</span>
              </div>
              <span>{item.state.replaceAll("-", " ")}</span>
            </div>
          )) : (
            <div className={styles.empty}>
              <span>◇</span>
              <h3>No recent activity</h3>
              <p>This browser session has no Leopold transaction history yet.</p>
            </div>
          )}
        </article>
      </section>

      <section className={styles.privacyBand}>
        <span>Private by default</span>
        <p>Leopold reveals private balances and outcomes only after your explicit authorization. Wallet activity and protocol state remain public by design.</p>
        <Link href="/transparency">What Leopold keeps private <span>↗</span></Link>
      </section>
    </div>
  );
}
