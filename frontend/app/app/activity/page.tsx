"use client";

import { useState } from "react";
import { FixtureStatus } from "@/components/configuration-status";
import { useFinancial } from "@/components/financial-provider";
import type { ActivityCategory } from "@/lib/leopold/activity";
import styles from "@/components/full-site/leopold-app-ui.module.css";

type ActivityFilter = "all" | Exclude<ActivityCategory, "other">;

export default function ActivityPage() {
  const financial = useFinancial();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const filters: readonly [ActivityFilter, string][] = [
    ["all", "All"],
    ["deposit", "Deposits"],
    ["withdrawal", "Withdrawals"],
    ["prize", "Prizes"],
  ];
  const visibleActivity = financial.activity.filter((item) => filter === "all" || item.category === filter);
  const activeLabel = filters.find(([value]) => value === filter)?.[1] ?? "All";

  return (
    <div className={styles.content}>
      <FixtureStatus />
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Privacy-safe history</p>
          <h1>Activity without <em>exposure.</em></h1>
          <p>Public transaction references for this wallet. Confidential values are never reconstructed in this view.</p>
        </div>
      </div>
      <section className={styles.filterBar}>
        <span>Browser session</span>
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
      <article className={styles.panel}>
        <div className={styles.tableHead}>
          <span>Action</span><span>Vault / network</span><span>Status</span><span>Transaction</span>
        </div>
        {visibleActivity.length ? (
          visibleActivity.map((item) => (
            <div className={styles.listRow} key={item.id}>
              <div>
                <strong>{item.label}</strong>
                <span>{item.vault ? `${item.vault} Vault · ` : ""}Ethereum Sepolia</span>
              </div>
              <span className={styles.status}>{item.status}</span>
            </div>
          ))
        ) : (
          <div className={styles.empty}>
            <span>◇</span>
            <h3>{filter === "all" ? "No recent Leopold activity" : `No ${activeLabel.toLowerCase()} activity`}</h3>
            <p>Deposits, withdrawals, entries, reveals and claims will appear after the existing actions report them.</p>
          </div>
        )}
      </article>
    </div>
  );
}
