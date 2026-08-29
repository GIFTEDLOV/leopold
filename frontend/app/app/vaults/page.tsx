"use client";

import { useState } from "react";
import { ConfigurationStatus, FixtureStatus } from "@/components/configuration-status";
import { VaultCards, type VaultFilter } from "@/components/vault-cards";
import styles from "@/components/full-site/leopold-app-ui.module.css";

export default function VaultsPage() {
  const [filter, setFilter] = useState<VaultFilter>("all");
  const filters: readonly [VaultFilter, string][] = [
    ["all", "All"],
    ["open", "Open"],
    ["entered", "Entered"],
  ];

  return (
    <div className={styles.content}>
      <FixtureStatus />
      <ConfigurationStatus />
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Vault directory</p>
          <h1>Save by your own <em>cadence.</em></h1>
          <p>Compare Leopold’s four official private prize-saving vaults. Weekly is the recommended first experience.</p>
        </div>
      </div>
      <section className={styles.filterBar}>
        <span>4 official vaults</span>
        <div>
          {filters.map(([value, label]) => (
            <button
              className={filter === value ? styles.selected : undefined}
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      <VaultCards filter={filter} />
      <section className={styles.privacyBand}>
        <p className={styles.eyebrow}>What remains private</p>
        <h2>Saving and prizes are separate.</h2>
        <p>
          Saving privately creates your principal position. To participate in a prize, enter that vault’s current round
          separately. Your prize chances start at registration and grow while your savings remain in the vault.
        </p>
      </section>
    </div>
  );
}
