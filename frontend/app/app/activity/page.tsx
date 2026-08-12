"use client";

import { FixtureStatus } from "@/components/configuration-status";
import { useFinancial } from "@/components/financial-provider";

export default function ActivityPage() {
  const financial = useFinancial();
  return (
    <div className="content">
      <FixtureStatus />
      <div className="page-heading">
        <div>
          <h1>Activity</h1>
          <p>Public transactions for this wallet. Confidential values are never reconstructed here.</p>
        </div>
      </div>
      <article className="card">
        {financial.activity.length ? (
          financial.activity.map((item) => (
            <div className="list-row" key={item.id}>
              <div className="list-main">
                <strong>{item.label}</strong>
                <span>{item.vault ? `${item.vault} Vault · ` : ""}Ethereum Sepolia</span>
              </div>
              <span className="badge neutral">{item.status}</span>
            </div>
          ))
        ) : (
          <div className="empty">No recent Leopold activity for this browser session</div>
        )}
      </article>
    </div>
  );
}
