"use client";

import Link from "next/link";
import { useState } from "react";

const vaults = [
  { name: "Daily", detail: "A quick, flexible cycle", duration: "1 day" },
  { name: "Weekly", detail: "The balanced default", duration: "7 days" },
  { name: "Monthly", detail: "More time to grow", duration: "30 days" },
  { name: "Boost", detail: "Sponsor-enhanced prizes", duration: "7 days" },
];

export default function HomePage() {
  const [selectedVault, setSelectedVault] = useState(1);
  const [revealed, setRevealed] = useState(false);
  const vault = vaults[selectedVault];

  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="Leopold home"><span className="brand-mark">L</span>Leopold</Link>
        <div className="landing-links"><a href="#how">How it works</a><Link href="/transparency">Transparency</Link><Link className="button small" href="/app">Open app <span aria-hidden="true">↗</span></Link></div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="signal" /> Private prize savings</div>
          <h1>Make saving feel<br /><em>worth it.</em></h1>
          <p className="lede">Save privately in stablecoins. Keep your principal. Get a chance at prizes funded by yield — and withdraw whenever you want.</p>
          <div className="hero-actions"><Link className="button" href="/app">Start saving <span aria-hidden="true">→</span></Link><a className="text-link" href="#how">See how it works <span aria-hidden="true">↓</span></a></div>
          <div className="trust-row"><span>Private by design</span><span>Principal stays yours</span><span>No lock-up</span></div>
        </div>
        <div className="hero-card" aria-label="Interactive Leopold savings preview">
          <div className="preview-top"><span className="preview-kicker">LEOPOLD / PERSONAL VIEW</span><span className="live-pill"><span className="signal" /> Live</span></div>
          <div className="preview-heading"><span>Your private savings</span><button className="reveal-button" onClick={() => setRevealed(!revealed)} aria-pressed={revealed}>{revealed ? "Hide" : "Reveal"}</button></div>
          <div className="preview-balance">{revealed ? "2,480.00" : "••••••••"}<small> USDC</small></div>
          <div className="preview-note">{revealed ? "Visible only in this browser session" : "Protected until you choose to reveal"}</div>
          <div className="preview-rule" />
          <div className="preview-heading"><span>Choose a vault</span><span className="preview-muted">{vault.duration} cycle</span></div>
          <div className="vault-tabs" role="tablist" aria-label="Choose a vault">
            {vaults.map((item, index) => <button key={item.name} role="tab" aria-selected={selectedVault === index} className={selectedVault === index ? "selected" : ""} onClick={() => setSelectedVault(index)}>{item.name}</button>)}
          </div>
          <div className="selected-vault"><div><strong>{vault.name}</strong><span>{vault.detail}</span></div><span className="vault-arrow" aria-hidden="true">↗</span></div>
          <div className="preview-footer"><span><i /> Round open</span><span>Prize reserve · Public</span></div>
        </div>
      </section>

      <section className="proof-strip" aria-label="Leopold principles"><div><strong>01</strong><span>Private balances</span></div><div><strong>02</strong><span>Yield-funded prizes</span></div><div><strong>03</strong><span>Anytime withdrawals</span></div><div><strong>04</strong><span>Publicly verifiable</span></div></section>

      <section className="how" id="how"><div className="section-intro"><div><span className="eyebrow">Simple by design</span><h2>Save first.<br />Let the upside follow.</h2></div><p>Leopold separates what is yours from what is public, so you always know what is happening with your money.</p></div><div className="how-grid">{[["01", "Make it private", "Convert canonical USDC into Private USDC from your wallet."],["02", "Pick your pace", "Choose Daily, Weekly, Monthly, or Boost — every vault is yours to use."],["03", "Enter for prizes", "Opt into a round separately. Your savings principal is never the wager."],["04", "Stay in control", "Reveal your own values privately, or withdraw your savings anytime."]].map(([number, title, copy]) => <article className="how-card" key={number}><span className="how-number">{number}</span><h3>{title}</h3><p>{copy}</p><span className="card-arrow" aria-hidden="true">↗</span></article>)}</div></section>
      <section className="closing"><span className="eyebrow">Your money. Your choice.</span><h2>A calmer way to<br /><em>save for more.</em></h2><Link className="button" href="/app">Open Leopold <span aria-hidden="true">→</span></Link></section>
      <footer className="landing-footer"><Link className="brand" href="/"><span className="brand-mark">L</span>Leopold</Link><span>Private Prize Savings</span><div><Link href="/transparency">Transparency</Link><Link href="/app/help">Help &amp; support</Link></div></footer>
    </main>
  );
}
