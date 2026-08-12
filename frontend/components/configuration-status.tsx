import { leopoldConfig } from "@/lib/leopold/config";

export function ConfigurationStatus() {
  if (leopoldConfig.ready) return null;
  return (
    <div className="status-banner" role="status">
      <span aria-hidden="true">◇</span>
      <div>
        <strong>Official deployment pending</strong>
        <p>
          This browser is ready, but the official Leopold vault addresses are not configured. Financial actions fail
          closed; no historical deployment is substituted.
        </p>
      </div>
    </div>
  );
}

export function FixtureStatus() {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_LEOPOLD_DEV_FIXTURE === "1" ? (
    <div className="status-banner fixture" role="status" data-testid="fixture-banner">
      <span aria-hidden="true">i</span>
      <div>
        <strong>Development fixture — not Sepolia</strong>
        <p>
          Balances and transaction results on this page are an isolated browser-test simulation, never live chain state.
        </p>
      </div>
    </div>
  ) : null;
}
