import { ConfigurationStatus, FixtureStatus } from "@/components/configuration-status";
import { VaultCards } from "@/components/vault-cards";
import styles from "@/components/full-site/leopold-app-ui.module.css";

export default function VaultsPage() {
  return (
    <div className={styles.content}>
      <FixtureStatus />
      <ConfigurationStatus />
      <div className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>CLASSIC VAULTS</p>
          <h1>Vaults</h1>
          <p>Choose Daily, Weekly, Monthly, or Boost and enter each draw yourself.</p>
        </div>
      </div>
      <section className={styles.filterBar}><span>4 official vaults</span><div><button className={styles.selected}>All</button><button>Open</button><button>Entered</button></div></section>
      <VaultCards />
      <section className={styles.privacyBand}>
        <p className={styles.eyebrow}>WHAT REMAINS PRIVATE</p>
        <h2>Saving and prizes stay separate.</h2>
        <p>
          Your savings position stays private. Classic Vault prize entry remains a separate action for the current round,
          and your private result stays hidden until you deliberately reveal it.
        </p>
      </section>
    </div>
  );
}
