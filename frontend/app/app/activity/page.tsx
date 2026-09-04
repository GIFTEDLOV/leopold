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
          <p className={styles.eyebrow}>ACTIVITY</p>
          <h1>Activity</h1>
          <p>Review your Classic Vault actions and public transaction references without reconstructing private values.</p>
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
            <h3>No recent activity</h3>
            <p>Your Classic Vault deposits, withdrawals, prize entries, reveals, and claims will appear here.</p>
          </div>
        )}
      </article>
    </div>
  );
}
