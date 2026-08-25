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
          <p>Public transactions for this wallet. Confidential values are never reconstructed here.</p>
        </div>
      </div>
      <section className={styles.filterBar}><span>Browser session</span><div><button className={styles.selected}>All</button><button>Deposits</button><button>Withdrawals</button><button>Prizes</button></div></section>
      <article className={styles.panel}>
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
          <div className={styles.empty}>No recent Leopold activity for this browser session</div>
        )}
      </article>
    </div>
  );
}
