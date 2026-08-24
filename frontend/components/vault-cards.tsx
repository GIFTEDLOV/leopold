"use client";

import Link from "next/link";
import Image from "next/image";
import { leopoldConfig, type VaultId } from "@/lib/leopold/config";
import { getEffectiveVaultRoundStatus } from "@/lib/leopold/reads";
import { useFinancial } from "./financial-provider";

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
        <div className="inline-notice" role="status" data-testid="no-open-vaults">
          No vault round is currently open for deposits.
        </div>
      ) : null}
      <div className="vault-grid">
        {leopoldConfig.vaults.map((vault, index) => {
          const entered = financial.enteredVaults.has(vault.slug);
          const state = financial.publicVaultState[vault.slug];
          const status = statuses[index];
          const saveEnabled = financial.fixture || (financial.financialActionsEnabled && status.depositOpen);
          return (
            <article
              className={`vault-card ${vault.slug === "weekly" ? "recommended" : ""}`}
              key={vault.slug}
              data-testid={`vault-${vault.slug}`}
            >
              <figure className="vault-image">
                <Image src={images[vault.slug]} alt={`${vault.name} prize-saving vault`} fill sizes="(max-width: 760px) 100vw, (max-width: 1100px) 50vw, 25vw" />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </figure>
              <div className="vault-card-body">
              <div className="vault-head">
                <div>
                  <h3>{vault.name}</h3>
                  <span className="vault-note">{descriptions[vault.slug]}</span>
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
                <span>Status · {financial.fixture && !state ? "Open" : status.label}</span>
              </div>
              <div className="vault-actions">
                <Link className="button secondary" href={`/app/vaults/${vault.slug}`}>
                  View
                </Link>
                {saveEnabled ? (
                  <Link className="button" href={`/app/vaults/${vault.slug}#save`}>
                    Save
                  </Link>
                ) : (
                  <button className="button" disabled type="button">
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
