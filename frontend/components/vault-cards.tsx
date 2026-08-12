"use client";

import Link from "next/link";
import { leopoldConfig, type VaultId } from "@/lib/leopold/config";
import { useFinancial } from "./financial-provider";

const descriptions: Record<VaultId, string> = {
  daily: "Fast cycle",
  weekly: "Recommended",
  monthly: "Longer cycle",
  boost: "Sponsor-enhanced prizes",
};
const durations: Record<VaultId, string> = { daily: "1 day", weekly: "7 days", monthly: "30 days", boost: "7 days" };

export function VaultCards() {
  const financial = useFinancial();
  return (
    <div className="vault-grid">
      {leopoldConfig.vaults.map((vault) => {
        const entered = financial.enteredVaults.has(vault.slug);
        const state = financial.publicVaultState[vault.slug];
        return (
          <article
            className={`vault-card ${vault.slug === "weekly" ? "recommended" : ""}`}
            key={vault.slug}
            data-testid={`vault-${vault.slug}`}
          >
            <div className="vault-head">
              <div>
                <span className="subtle">{descriptions[vault.slug]}</span>
                <h3>{vault.name}</h3>
              </div>
              {vault.slug === "weekly" ? (
                <span className="badge">Recommended</span>
              ) : entered ? (
                <span className="badge">Entered</span>
              ) : null}
            </div>
            <div className="vault-meta">
              <span>Round duration · {durations[vault.slug]}</span>
              <span>Prize · {state ? `${Number(state.publicPrize) / 1_000_000} USDC` : "Unavailable"}</span>
              <span>Status · {state?.stateLabel ?? (financial.fixture ? "Open" : "Unavailable")}</span>
            </div>
            <div className="vault-actions">
              <Link className="button secondary" href={`/app/vaults/${vault.slug}`}>
                View
              </Link>
              <Link className="button" href={`/app/vaults/${vault.slug}#save`}>
                Save
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
