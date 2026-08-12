import { ConfigurationStatus, FixtureStatus } from "@/components/configuration-status";
import { VaultCards } from "@/components/vault-cards";

export default function VaultsPage() {
  return (
    <div className="content">
      <FixtureStatus />
      <ConfigurationStatus />
      <div className="page-heading">
        <div>
          <h1>Vaults</h1>
          <p>Four isolated ways to save. Weekly is the recommended first experience.</p>
        </div>
      </div>
      <VaultCards />
      <section className="section card">
        <h2>Saving and prizes are separate</h2>
        <p className="privacy-callout">
          Saving privately creates your principal position. To participate in a prize, enter that vault’s current round
          separately. Your prize chances start at registration and grow while your savings remain in the vault.
        </p>
      </section>
    </div>
  );
}
