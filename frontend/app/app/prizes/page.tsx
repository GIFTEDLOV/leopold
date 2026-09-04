"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatUsdcAmount } from "@/lib/leopold/amounts";
import { leopoldConfig } from "@/lib/leopold/config";
import { getEffectiveVaultRoundStatus } from "@/lib/leopold/reads";
import { ConfigurationStatus, FixtureStatus } from "@/components/configuration-status";
import { useFinancial } from "@/components/financial-provider";
import styles from "@/components/full-site/leopold-app-ui.module.css";

export default function PrizesPage() {
  const financial = useFinancial();
  const [showRevealStates, setShowRevealStates] = useState(false);

  const featured = useMemo(() => {
    return leopoldConfig.vaults.find((vault) => financial.enteredVaults.has(vault.slug))
      ?? leopoldConfig.vaults.find((vault) => getEffectiveVaultRoundStatus(financial.publicVaultState[vault.slug], financial.latestBlockTimestamp).depositOpen)
      ?? leopoldConfig.vaults.find((vault) => vault.slug === "weekly")
      ?? leopoldConfig.vaults[0];
  }, [financial.enteredVaults, financial.latestBlockTimestamp, financial.publicVaultState]);

  if (!featured) return null;

  const state = financial.publicVaultState[featured.slug];
  const roundStatus = getEffectiveVaultRoundStatus(state, financial.latestBlockTimestamp);
  const entered = financial.enteredVaults.has(featured.slug);
  const resultReady = financial.fixture ? entered : entered && state?.state === 14;
  const revealed = financial.revealedResults.has(featured.slug);
  const result = financial.privateResults[featured.slug];
  const revealLabel = !entered
    ? "Not ready"
    : revealed
      ? "Result"
      : resultReady
        ? "Reveal available"
        : "Not ready";

  return (
    <div className={styles.content}>
      <FixtureStatus />
      <ConfigurationStatus />
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>PRIZES</p>
          <h1>Prizes</h1>
          <p>See the current Classic Vault round, then reveal your own result only when you choose.</p>
        </div>
      </div>

      <section className={styles.prizeHero}>
        <div>
          <p className={styles.eyebrow}>CURRENT ROUND</p>
          <h2>{featured.name} prize round</h2>
          <p>
            {financial.fixture && !state ? "Open" : roundStatus.label} · Round {state?.roundId.toString() ?? "—"} · {state ? `${formatUsdcAmount(state.publicPrize)} USDC prize reserve` : "Prize reserve unavailable"}.
            Your exact chance and result remain private.
          </p>
          <Link href={`/app/classic/vaults/${featured.slug}`}>Open {featured.name} Vault</Link>
        </div>
        <div className={styles.orbit} aria-label="64 encrypted random bits">
          <i /><i /><i />
          <span>64</span>
          <small>ENCRYPTED BITS</small>
        </div>
      </section>

      <section className={styles.tabRow} aria-label="Prize round filter">
        <button className={styles.selected}>Current</button><button>Upcoming</button><button>Completed</button>
      </section>

      <section className={styles.stateRail} aria-label="Private reveal states">
        <div className={!resultReady && !revealed ? styles.currentState : undefined}><b>01</b><span>Not ready</span></div>
        <div className={resultReady && !revealed ? styles.currentState : undefined}><b>02</b><span>Reveal available</span></div>
        <div><b>03</b><span>Decrypting</span></div>
        <div className={revealed ? styles.currentState : undefined}><b>04</b><span>Result</span></div>
      </section>

      <div className={styles.prizeGrid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <div><span className={styles.eyebrow}>YOUR RESULT</span><h2>{featured.name} · {revealLabel}</h2></div>
            <span className={styles.status}>{entered ? "Entered" : "Not entered"}</span>
          </div>
          <div className={styles.privateValue}>
            {revealed ? (result === 0n ? "No prize" : `${formatUsdcAmount(result ?? 0n)} USDC`) : "••••••"}
          </div>
          <p className={styles.fine}>
            {!entered
              ? "Enter an open Classic round first."
              : revealed
                ? "This result is revealed only in this browser session."
                : resultReady
                  ? "Your private result is ready to reveal."
                  : "Your result becomes available after the draw finalizes."}
          </p>
          <div className={styles.buttonRow}>
            <button
              className={styles.primaryButton}
              data-testid={`reveal-result-${featured.slug}`}
              disabled={!financial.financialActionsEnabled || !resultReady || revealed}
              onClick={() => void financial.revealResult(featured.slug).catch(() => undefined)}
            >
              Reveal Private Result
            </button>
            <button className={styles.outlineButton} type="button" onClick={() => setShowRevealStates(true)}>See reveal states</button>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}><div><span className={styles.eyebrow}>ROUND HISTORY</span><h2>Classic rounds.</h2></div></div>
          {leopoldConfig.vaults.map((vault) => {
            const vaultState = financial.publicVaultState[vault.slug];
            const status = getEffectiveVaultRoundStatus(vaultState, financial.latestBlockTimestamp);
            const vaultEntered = financial.enteredVaults.has(vault.slug);
            return (
              <div className={styles.listRow} key={vault.slug}>
                <div>
                  <strong>{vault.name}</strong>
                  <span>Round {vaultState?.roundId.toString() ?? "—"} · {financial.fixture && !vaultState ? "Open" : status.label}</span>
                </div>
                <span>{vaultEntered ? "Entered" : "Not entered"}</span>
              </div>
            );
          })}
        </article>
      </div>

      <section className={styles.privacyBand}>
        <p className={styles.eyebrow}>ENCRYPTED DRAW</p>
        <h2>Private result. Publicly verifiable round.</h2>
        <p>Round progress can remain public without exposing your balance, exact chance, accepted ticket, or private result.</p>
      </section>

      {showRevealStates ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setShowRevealStates(false); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="reveal-states-title">
            <button className={styles.close} type="button" aria-label="Close" onClick={() => setShowRevealStates(false)}>×</button>
            <p className={styles.eyebrow}>PRIVATE RESULT</p>
            <h2 id="reveal-states-title">Reveal states.</h2>
            <div className={styles.stateRail}>
              <div><b>01</b><span>Not ready</span></div>
              <div><b>02</b><span>Reveal available</span></div>
              <div><b>03</b><span>Decrypting</span></div>
              <div><b>04</b><span>Result</span></div>
            </div>
            <p className={styles.fine}>Only your explicit reveal action requests your private result. The public round does not expose it automatically.</p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
