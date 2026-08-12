import Link from "next/link";

export default function TransparencyPage() {
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
          <span className="eyebrow">Transparency</span>
          <h2>Privacy without overpromising.</h2>
          <div className="grid two">
            <article className="card">
              <h3>What remains confidential</h3>
              <div className="list">
                <div className="list-row">Individual private savings</div>
                <div className="list-row">Exact prize weight and odds</div>
                <div className="list-row">Encrypted random ticket</div>
                <div className="list-row">Winner and winnings</div>
              </div>
            </article>
            <article className="card">
              <h3>What is public</h3>
              <div className="list">
                <div className="list-row">Prize-round entry and public ETH bond</div>
                <div className="list-row">Initial USDC amount at the Make Private boundary</div>
                <div className="list-row">Aggregate vault strategy activity and Compound position</div>
                <div className="list-row">Round and finalization state</div>
              </div>
            </article>
          </div>
          <article className="card section">
            <h3>Known privacy limits</h3>
            <p className="privacy-callout">
              Leopold provides confidentiality, not anonymity. Wallet addresses, transaction timing, public prize entry,
              and the wrapper boundary are observable. Aggregate vault activity may be public, and low participation can
              enable aggregate inference. A user’s own browser environment can see values they choose to reveal.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
