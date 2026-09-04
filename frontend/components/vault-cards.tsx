"use client";

import Link from "next/link";
import Image from "next/image";
import { leopoldConfig, type VaultId } from "@/lib/leopold/config";
import { getEffectiveVaultRoundStatus } from "@/lib/leopold/reads";
import { useFinancial } from "./financial-provider";
import styles from "@/components/full-site/leopold-app-ui.module.css";

const descriptions: Record<VaultId, string> = {
  daily: "Fast cycle",
  weekly: "Recommended",
  monthly: "Longer cycle",
  boost: "Sponsor-enhanced prizes",
};
const durations: Record<VaultId, string> = { daily: "1 day", weekly: "7 days", monthly: "30 days", boost: "7 days" };
const images: Record<VaultId, string> = {
  daily: "/marketing/leopold/leopold-daily.webp",
  weekly: "/marketing/leopold/leopold-weekly.webp",
  monthly: "/marketing/leopold/leopold-monthly.webp",
  boost: "/marketing/leopold/leopold-boost.webp",
};

export function VaultCards() {
  const financial = useFinancial();
  const statuses = leopoldConfig.vaults.map((vault) =>
    getEffectiveVaultRoundStatus(financial.publicVaultState[vault.slug], financial.latestBlockTimestamp),
  );
  const allRoundsKnown =
    leopoldConfig.vaults.every((vault) => financial.publicVaultState[vault.slug]) &&
    financial.latestBlockTimestamp !== null;
  return (
    <>
      {allRoundsKnown && !statuses.some((status) => status.depositOpen) ? (
        <div className={styles.alert} role="status" data-testid="no-open-vaults">
          No vault round is currently open for deposits.
        </div>
      ) : null}
      <div className={`${styles.vaultGrid} ${styles.vaultGridLarge}`}>
        {leopoldConfig.vaults.map((vault, index) => {
          const entered = financial.enteredVaults.has(vault.slug);
          const state = financial.publicVaultState[vault.slug];
          const status = statuses[index];
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
                  <div><dt>Round duration</dt><dd>{durations[vault.slug]}</dd></div>
                  <div><dt>Prize</dt><dd>{state ? `${Number(state.publicPrize) / 1_000_000} USDC` : "Unavailable"}</dd></div>
                  <div><dt>Round status</dt><dd>{financial.fixture && !state ? "Open" : status.label}</dd></div>
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
