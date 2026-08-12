import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">L</span>Leopold
        </Link>
        <div className="landing-links">
          <a href="#how">How it works</a>
          <Link href="/transparency">Transparency</Link>
          <Link className="button small" href="/app">
            Start Saving
          </Link>
        </div>
      </nav>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Private prize savings</span>
          <h1>
            Save privately.
            <br />
            Win privately.
            <br />
            Withdraw anytime.
          </h1>
          <p className="lede">
            Turn stablecoins into private savings. Your money remains yours, while eligible savings can win prizes
            funded by generated yield.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/app">
              Start Saving
            </Link>
            <a className="button secondary" href="#how">
              How it works
            </a>
          </div>
          <div className="trust-row">
            <span>Your savings remain yours</span>
            <span>Private balances</span>
            <span>No lock-up</span>
          </div>
        </div>
        <div className="hero-card" aria-label="Leopold application preview">
          <div className="mini-top">
            <span className="brand">Leopold</span>
            <span className="badge">Private</span>
          </div>
          <div className="mini-window">
            <div className="mini-top">
              <span className="card-label">Your private savings</span>
              <span aria-hidden="true">◉</span>
            </div>
            <div className="mini-balance">•••••• USDC</div>
            <span className="subtle">Visible only when you choose to reveal</span>
            <div className="mini-vault">
              <div>
                <strong>Weekly Vault</strong>
                <div className="subtle">Recommended</div>
              </div>
              <span className="badge">Open</span>
            </div>
            <button className="button" style={{ width: "100%", marginTop: 16 }}>
              Reveal privately
            </button>
          </div>
        </div>
      </section>
      <section className="how" id="how">
        <div className="how-inner">
          <span className="eyebrow">A simpler way to save</span>
          <h2>Private from deposit to prize.</h2>
          <div className="how-grid">
            {[
              ["01", "Make it private", "Convert canonical USDC into Private USDC from your wallet."],
              ["02", "Choose a vault", "Save in Daily, Weekly, Monthly, or sponsor-enhanced Boost."],
              ["03", "Enter a round", "Opt into a prize round with a separate refundable settlement bond."],
              ["04", "Stay in control", "Reveal your own results privately or withdraw savings anytime."],
            ].map(([number, title, copy]) => (
              <article className="how-card" key={number}>
                <span className="how-number">{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
