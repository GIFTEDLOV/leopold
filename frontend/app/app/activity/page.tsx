"use client";

import { FixtureStatus } from "@/components/configuration-status";
import { useFinancial } from "@/components/financial-provider";
import styles from "@/components/full-site/leopold-app-ui.module.css";

export default function ActivityPage() {
  const financial = useFinancial();
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
      <section className={styles.filterBar}><span>Browser session</span><div><button className={styles.selected}>All</button><button>Deposits</button><button>Withdrawals</button><button>Prizes</button></div></section>
      <article className={styles.panel}>
        <div className={styles.tableHead}>
          <span>Action</span><span>Vault / network</span><span>Status</span><span>Transaction</span>
        </div>
        {financial.activity.length ? (
          financial.activity.map((item) => (
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
            <h3>No recent Leopold activity</h3>
            <p>Deposits, withdrawals, entries, reveals and claims will appear after the existing actions report them.</p>
          </div>
        )}
      </article>
    </div>
  );
}
