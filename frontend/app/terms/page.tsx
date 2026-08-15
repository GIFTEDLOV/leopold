import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">L</span>Leopold
        </Link>
        <Link className="button secondary small" href="/app">
          Open app
        </Link>
      </nav>
      <section className="how" style={{ borderTop: 0 }}>
        <div className="how-inner">
          <span className="eyebrow">Terms of service</span>
          <h1>Using Leopold.</h1>
          <article className="card section">
            <p>
              This deployment currently operates on Ethereum Sepolia, a testnet. Test assets have no guaranteed monetary
              value and may be changed, unavailable, or removed as the testnet evolves.
            </p>
            <p>
              You control your external wallet. Leopold does not custody wallet private keys, seed phrases, or other
              wallet credentials. You are responsible for wallet security, transaction approvals, and protecting your
              access credentials.
            </p>
            <p>
              Protocol, blockchain-network, relayer, authentication-provider, and other infrastructure availability may
              affect operations. Leopold makes no guarantee of prize winnings, yield, uninterrupted access, or
              successful transaction completion.
            </p>
            <p>
              Leopold is a testnet software application and its information is not investment advice. Use only assets
              and wallets you are prepared to use for testing, and review each transaction before signing.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
