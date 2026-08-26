"use client";

import { formatUsdcAmount } from "@/lib/leopold/amounts";
import { leopoldConfig } from "@/lib/leopold/config";
import { getEffectiveVaultRoundStatus } from "@/lib/leopold/reads";
import { ConfigurationStatus, FixtureStatus } from "@/components/configuration-status";
import { useFinancial } from "@/components/financial-provider";
import styles from "@/components/full-site/leopold-app-ui.module.css";

export default function PrizesPage() {
  const financial = useFinancial();
  return (
    <div className={styles.content}>
      <FixtureStatus />
      <ConfigurationStatus />
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Private prize center</p>
          <h1>Every round, in one <em>place.</em></h1>
          <p>Prize entry is public. Your exact chances, result, and winnings stay private.</p>
        </div>
      </div>
      <section className={styles.tabRow}><button className={styles.selected}>Current</button><button>Upcoming</button><button>Completed</button></section>
      <div className={styles.prizeGrid}>
        {leopoldConfig.vaults.map((vault) => {
          const entered = financial.enteredVaults.has(vault.slug);
          const state = financial.publicVaultState[vault.slug];
          const roundStatus = getEffectiveVaultRoundStatus(state, financial.latestBlockTimestamp);
          const resultReady = financial.fixture ? entered : entered && state?.state === 14;
          const revealed = financial.revealedResults.has(vault.slug);
          const result = financial.privateResults[vault.slug];
          return (
            <article className={styles.panel} key={vault.slug}>
              <div className={styles.panelTitle}>
                <div>
                  <span className={styles.eyebrow}>
                    {vault.name} Vault · Round {state?.roundId.toString() ?? "—"}
                  </span>
                  <h2>
                    {financial.fixture && !state ? (entered ? "Result ready" : "Round active") : roundStatus.label}
                  </h2>
                </div>
                <span className={styles.status}>{entered ? "Entered" : "Not entered"}</span>
              </div>
              <div className={styles.listRow}>
                <div>
                  <strong>Prize</strong>
                  <span>Public round reserve</span>
                </div>
                <strong>{state ? `${formatUsdcAmount(state.publicPrize)} USDC` : "Unavailable"}</strong>
              </div>
              <div className={styles.listRow}>
                <div>
                  <strong>Private result</strong>
                  <span>
                    {!entered
                      ? "Enter an open round first"
                      : revealed
                        ? "Revealed only in this browser session"
                        : resultReady
                          ? "Your private result is ready"
                          : "Available after private draw finalization"}
                  </span>
                </div>
                <strong>
                  {revealed
                    ? result === 0n
                      ? "No prize this round"
                      : `Won · ${formatUsdcAmount(result ?? 0n)} USDC`
                    : "Hidden"}
                </strong>
              </div>
              <button
                className={styles.outlineButton}
                style={{ marginTop: "18px" }}
                data-testid={`reveal-result-${vault.slug}`}
                disabled={!financial.financialActionsEnabled || !resultReady}
                onClick={() => {
                  void financial.revealResult(vault.slug).catch(() => undefined);
                }}
              >
                Reveal Private Result
              </button>
            </article>
          );
        })}
      </div>
      <section className={styles.privacyBand}>
        <p className={styles.eyebrow}>Encrypted draw</p>
        <h2>Why a draw can take time</h2>
        <p>
          When a round closes, Leopold may show “Finalizing private draw.” Permissionless participants complete the
          private draw in bounded steps. Progress never reveals the winner, accepted ticket, or participant balances.
        </p>
      </section>
    </div>
  );
}
