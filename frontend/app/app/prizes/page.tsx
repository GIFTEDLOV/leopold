"use client";

import { formatUsdcAmount } from "@/lib/leopold/amounts";
import { leopoldConfig } from "@/lib/leopold/config";
import { getEffectiveVaultRoundStatus } from "@/lib/leopold/reads";
import { ConfigurationStatus, FixtureStatus } from "@/components/configuration-status";
import { useFinancial } from "@/components/financial-provider";
import { useWalletIdentity } from "@/components/wallet-identity-provider";

export default function PrizesPage() {
  const financial = useFinancial();
  const walletIdentity = useWalletIdentity();
  const walletMismatch = walletIdentity.identity.state === "WALLET_MISMATCH";
  return (
    <div className="content">
      <FixtureStatus />
      <ConfigurationStatus />
      <div className="page-heading">
        <div>
          <h1>Prizes</h1>
          <p>Prize entry is public. Your exact chances, result, and winnings stay private.</p>
        </div>
      </div>
      <div className="grid two">
        {leopoldConfig.vaults.map((vault) => {
          const entered = financial.enteredVaults.has(vault.slug);
          const state = financial.publicVaultState[vault.slug];
          const roundStatus = getEffectiveVaultRoundStatus(state, financial.latestBlockTimestamp);
          const resultReady = financial.fixture ? entered : entered && state?.state === 14;
          const revealed = financial.revealedResults.has(vault.slug);
          const result = financial.privateResults[vault.slug];
          return (
            <article className="card" key={vault.slug}>
              <div className="vault-head">
                <div>
                  <span className="subtle">
                    {vault.name} Vault · Round {state?.roundId.toString() ?? "—"}
                  </span>
                  <h2>
                    {financial.fixture && !state ? (entered ? "Result ready" : "Round active") : roundStatus.label}
                  </h2>
                </div>
                <span className={`badge ${entered ? "" : "neutral"}`}>{entered ? "Entered" : "Not entered"}</span>
              </div>
              <div className="list-row">
                <div className="list-main">
                  <strong>Prize</strong>
                  <span>Public round reserve</span>
                </div>
                <strong>{state ? `${formatUsdcAmount(state.publicPrize)} USDC` : "Unavailable"}</strong>
              </div>
              <div className="list-row">
                <div className="list-main">
                  <strong>Private result</strong>
                  <span>
                    {!entered
                      ? "Enter an open round first"
                      : revealed
                        ? "Revealed only in this browser session"
                        : resultReady
                          ? "Your private result is ready"
                          : "Available after private draw finalization"}
                  </span>
                </div>
                <strong>
                  {revealed
                    ? result === 0n
                      ? "No prize this round"
                      : `Won · ${formatUsdcAmount(result ?? 0n)} USDC`
                    : "Hidden"}
                </strong>
              </div>
              <button
                className="button secondary"
                data-testid={`reveal-result-${vault.slug}`}
                disabled={(!financial.financialActionsEnabled && !walletMismatch) || (!resultReady && !walletMismatch)}
                onClick={() => {
                  if (walletMismatch) void walletIdentity.switchToVerifiedWallet();
                  else void financial.revealResult(vault.slug).catch(() => undefined);
                }}
              >
                {walletMismatch ? "Switch to verified wallet" : "Reveal Private Result"}
              </button>
            </article>
          );
        })}
      </div>
      <section className="section card">
        <h2>Why a draw can take time</h2>
        <p className="privacy-callout">
          When a round closes, Leopold may show “Finalizing private draw.” Permissionless participants complete the
          private draw in bounded steps. Progress never reveals the winner, accepted ticket, or participant balances.
        </p>
      </section>
    </div>
  );
}
