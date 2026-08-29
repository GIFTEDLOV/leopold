"use client";

import Link from "next/link";
import Image from "next/image";
import { leopoldConfig, type VaultId } from "@/lib/leopold/config";
import { getEffectiveVaultPublicPrize, getEffectiveVaultRoundStatus } from "@/lib/leopold/reads";
import { useFinancial } from "./financial-provider";
import styles from "@/components/full-site/leopold-app-ui.module.css";

const descriptions: Record<VaultId, string> = {
  daily: "Fast rhythm",
  weekly: "Recommended",
  monthly: "Long horizon",
  boost: "Sponsor enhanced",
};
const durations: Record<VaultId, string> = { daily: "1 day", weekly: "7 days", monthly: "30 days", boost: "7 days" };
const images: Record<VaultId, string> = {
  daily: "/marketing/leopold/leopold-daily.webp",
  weekly: "/marketing/leopold/leopold-weekly.webp",
  monthly: "/marketing/leopold/leopold-monthly.webp",
  boost: "/marketing/leopold/leopold-boost.webp",
};

export type VaultFilter = "all" | "open" | "entered";

export function VaultCards({ filter = "all" }: { filter?: VaultFilter }) {
  const financial = useFinancial();
  const entries = leopoldConfig.vaults.map((vault) => ({
    vault,
    status: getEffectiveVaultRoundStatus(financial.publicVaultState[vault.slug], financial.latestBlockTimestamp),
    entered: financial.enteredVaults.has(vault.slug),
  }));
  const visibleEntries = entries.filter(({ status, entered }) => {
    if (filter === "open") return status.depositOpen;
    if (filter === "entered") return entered;
    return true;
  });
  const allRoundsKnown =
    leopoldConfig.vaults.every((vault) => financial.publicVaultState[vault.slug]) &&
    financial.latestBlockTimestamp !== null;
  return (
    <>
      {allRoundsKnown && !entries.some(({ status }) => status.depositOpen) ? (
        <div className={styles.alert} role="status" data-testid="no-open-vaults">
          No vault round is currently open for deposits.
        </div>
      ) : null}
      <div className={`${styles.vaultGrid} ${styles.vaultGridLarge}`}>
        {visibleEntries.map(({ vault, status, entered }, index) => {
          const state = financial.publicVaultState[vault.slug];
          const publicPrize = getEffectiveVaultPublicPrize(state, financial.latestBlockTimestamp);
          const saveEnabled = financial.fixture || (financial.financialActionsEnabled && status.depositOpen);
          return (
            <article
              className={`${styles.vaultCard} ${vault.slug === "weekly" ? styles.recommended : ""}`}
              key={vault.slug}
              data-testid={`vault-${vault.slug}`}
            >
              <figure>
                <Image src={images[vault.slug]} alt={`${vault.name} prize-saving vault`} fill sizes="(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 25vw" />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </figure>
              <div>
              <div className={styles.vaultTitleRow}>
                <div>
                  <h3>{vault.name}</h3>
                  <span>{descriptions[vault.slug]}</span>
                </div>
                {vault.slug === "weekly" ? (
                  <span className={styles.status}>Recommended</span>
                ) : entered ? (
                  <span className={styles.status}>Entered</span>
                ) : null}
              </div>
              <dl>
                <div><dt>Cadence</dt><dd>{durations[vault.slug]}</dd></div>
                <div><dt>Prize</dt><dd>{publicPrize !== null ? `${Number(publicPrize) / 1_000_000} USDC` : "Unavailable"}</dd></div>
                <div><dt>Status</dt><dd>{financial.fixture && !state ? "Open" : status.label}</dd></div>
              </dl>
              <div className={styles.buttonRow}>
                <Link className={styles.outlineButton} href={`/app/vaults/${vault.slug}`}>
                  View
                </Link>
                {saveEnabled ? (
                  <Link className={styles.primaryButton} href={`/app/vaults/${vault.slug}#save`}>
                    Save
                  </Link>
                ) : (
                  <button className={styles.primaryButton} disabled type="button">
                    Save
                  </button>
                )}
              </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
