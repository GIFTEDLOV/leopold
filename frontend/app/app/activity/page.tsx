"use client";

import { FixtureStatus } from "@/components/configuration-status";
import { useFinancial } from "@/components/financial-provider";
import styles from "@/components/full-site/leopold-app-ui.module.css";

export default function ActivityPage() {
  const financial = useFinancial();
  return (
    <div className={styles.content}>
      <style jsx global>{`
        .sites-activity-row {
          display: grid;
          grid-template-columns: 2fr 1.2fr .8fr .8fr;
          align-items: center;
          gap: 16px;
          padding: 15px 0;
          border-bottom: 1px solid var(--app-line);
        }
        .sites-activity-row strong { font: 15px Georgia, serif; }
        .sites-activity-row span { color: #718095; font-size: 10px; }
        .sites-activity-row .sites-activity-status { width: max-content; color: inherit; }
        @media (max-width: 760px) {
          .sites-activity-row { grid-template-columns: 1fr auto; gap: 8px 14px; }
          .sites-activity-row > :nth-child(4) { display: none; }
        }
      `}</style>
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
            <div className="sites-activity-row" key={item.id}>
              <strong>{item.label}</strong>
              <span>{item.vault ? `${item.vault} Vault` : "Ethereum Sepolia"}</span>
              <span className={`${styles.status} sites-activity-status`}>{item.status}</span>
              <span>Browser session</span>
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
