"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./landing-experience.module.css";

const vaults = [
  {
    index: "01",
    name: "Daily",
    cadence: "24H",
    descriptor: "A faster saving rhythm for people who want prize opportunities to turn over every day.",
    signal: "Frequent cadence",
  },
  {
    index: "02",
    name: "Weekly",
    cadence: "7D",
    descriptor: "Leopold's recommended balance: enough time for savings to build weight without feeling distant.",
    signal: "Recommended",
    featured: true,
  },
  {
    index: "03",
    name: "Monthly",
    cadence: "30D",
    descriptor: "A slower horizon for savers who prefer longer rounds and fewer moments of attention.",
    signal: "Long horizon",
  },
  {
    index: "04",
    name: "Boost",
    cadence: "7D",
    descriptor: "Sponsor-enhanced prize windows. Extra reserve comes from sponsors, never from your principal.",
    signal: "Sponsor enhanced",
  },
] as const;

const steps = [
  ["01", "Add USDC", "Bring test USDC into Leopold from the public side."],
  ["02", "Make it private", "Cross the privacy boundary once. Your resulting Private USDC is confidential."],
  ["03", "Save", "Choose Daily, Weekly, Monthly, or Boost. Your principal remains yours."],
  ["04", "Earn chances", "Prize weight builds over time while exact savings and weight remain private."],
  ["05", "Reveal privately", "Your result is yours to reveal. Leopold does not publish a winner address."],
  ["06", "Withdraw anytime", "Move principal out independently of prize outcomes or public attention."],
] as const;

const privateFacts = [
  "Private USDC balance",
  "Private vault savings",
  "Exact prize weight",
  "Accepted random ticket",
  "Winner identity",
  "Prize winnings",
] as const;

const publicFacts = [
  "Wallet transactions and timing",
  "Make Private boundary amount",
  "Prize entry and settlement bond",
  "Round metadata and state",
  "Aggregate settlement progress",
  "Official deployed contracts",
] as const;

export function LandingExperience() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const navItems = useMemo(
    () => [
      ["Product", "#product"],
      ["Vaults", "#vaults"],
      ["How it works", "#how"],
      ["Privacy", "#privacy"],
      ["Transparency", "/transparency"],
    ],
    [],
  );

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealNodes = Array.from(document.querySelectorAll<HTMLElement>("[data-leopold-reveal]"));

    if (reduced) {
      revealNodes.forEach((node) => node.dataset.visible = "true");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).dataset.visible = "true";
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    revealNodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <div className={styles.page}>
      <div className={styles.progressRail} aria-hidden="true">
        <span style={{ transform: `scaleY(${scrollProgress})` }} />
      </div>

      <header className={styles.header}>
        <Link href="/" className={styles.wordmark} aria-label="Leopold home">
          <span>LEOPOLD</span>
          <i aria-hidden="true" />
        </Link>
        <nav className={styles.desktopNav} aria-label="Landing navigation">
          {navItems.map(([label, href]) =>
            href.startsWith("#") ? (
              <a key={label} href={href}>{label}</a>
            ) : (
              <Link key={label} href={href}>{label}</Link>
            ),
          )}
        </nav>
        <div className={styles.headerActions}>
          <Link className={styles.openApp} href="/app">
            Open Leopold <span aria-hidden="true">↗</span>
          </Link>
          <button
            className={styles.menuButton}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="leopold-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
      </header>

      <div
        id="leopold-mobile-menu"
        className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ""}`}
        aria-hidden={!menuOpen}
      >
        <nav aria-label="Mobile landing navigation">
          {navItems.map(([label, href], index) =>
            href.startsWith("#") ? (
              <a key={label} href={href} onClick={() => setMenuOpen(false)}>
                <span>{String(index + 1).padStart(2, "0")}</span>{label}
              </a>
            ) : (
              <Link key={label} href={href} onClick={() => setMenuOpen(false)}>
                <span>{String(index + 1).padStart(2, "0")}</span>{label}
              </Link>
            ),
          )}
          <Link className={styles.mobileCta} href="/app" onClick={() => setMenuOpen(false)}>
            Start saving privately
          </Link>
        </nav>
      </div>

      <main>
        <section className={styles.hero} id="product">
          <div className={styles.heroMeta} data-leopold-reveal>
            <span className={styles.kicker}>01 — Private Prize Savings</span>
            <p>
              A savings experience where your balance, exact savings, prize result and winnings do not need to become
              public information.
            </p>
          </div>

          <div className={styles.heroTitle} data-leopold-reveal>
            <span>PRIVATE</span>
            <span>PRIZE</span>
            <span className={styles.heroItalic}>SAVINGS.</span>
          </div>

          <div className={styles.heroRule} aria-hidden="true" />

          <div className={styles.heroBottom} data-leopold-reveal>
            <p className={styles.heroPromise}>Save privately. Win privately. Withdraw anytime.</p>
            <dl className={styles.heroFacts}>
              <div><dt>Asset</dt><dd>USDC</dd></div>
              <div><dt>Principal</dt><dd>Never the prize</dd></div>
              <div><dt>Privacy</dt><dd>Confidential, not anonymous</dd></div>
            </dl>
            <a className={styles.scrollCue} href="#thesis">
              <span>Scroll</span>
              <i aria-hidden="true" />
            </a>
          </div>

          <div className={styles.heroVisual} aria-label="Abstract Leopold privacy visualization">
            <div className={styles.visualGrid} aria-hidden="true" />
            <div className={styles.visualIndex}>L/01</div>
            <div className={styles.visualStatement}>
              <span>THE VALUE</span>
              <strong>STAYS YOURS.</strong>
            </div>
            <div className={styles.visualOrb} aria-hidden="true">
              <span />
            </div>
            <div className={styles.visualFooter}>
              <span>PUBLIC BOUNDARY</span>
              <span className={styles.visualLine} aria-hidden="true" />
              <span>PRIVATE STATE</span>
            </div>
          </div>
        </section>

        <section className={styles.thesis} id="thesis">
          <div className={styles.sectionLabel} data-leopold-reveal>02 — The thesis</div>
          <div className={styles.thesisStatement} data-leopold-reveal>
            Leopold is building a private savings experience where your principal stays <em>yours</em> and your prize
            outcome stays <em>yours to reveal.</em>
          </div>
          <div className={styles.thesisGrid}>
            {[
              ["I", "Private savings", "Protect balances and exact savings amounts."],
              ["II", "Prize savings", "Earn chances over time without putting principal at risk."],
              ["III", "Withdraw anytime", "Keep principal available independently of prize outcomes."],
              ["IV", "Transparent rules", "Publish protocol facts without publishing private values."],
            ].map(([number, title, copy]) => (
              <article key={number} data-leopold-reveal>
                <span>{number}</span>
                <h2>{title}</h2>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.systemSection}>
          <div className={styles.systemIntro} data-leopold-reveal>
            <span className={styles.kicker}>03 — Protocol design</span>
            <h2>The private<br /><em>savings layer.</em></h2>
            <p>Structural facts, not performance claims.</p>
          </div>
          <div className={styles.systemFacts}>
            {[
              ["04", "Official vaults"],
              ["00", "Principal used for prizes"],
              ["24/7", "Withdrawal path"],
              ["01", "Owner of your private result"],
            ].map(([value, label]) => (
              <div key={label} data-leopold-reveal>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className={styles.systemNote} data-leopold-reveal>
            Prize reserve is funded by genuine yield, sponsor contributions and rollover. Savings principal is accounted
            for separately.
          </p>
        </section>

        <section className={styles.vaultSection} id="vaults">
          <div className={styles.vaultHeading} data-leopold-reveal>
            <span className={styles.sectionLabel}>04 — Built for savers</span>
            <h2>Four rhythms.<br />One rule: <em>principal stays yours.</em></h2>
          </div>

          <div className={styles.vaultList}>
            {vaults.map((vault, index) => (
              <article
                className={`${styles.vaultChapter} ${vault.featured ? styles.vaultFeatured : ""}`}
                key={vault.name}
                data-leopold-reveal
              >
                <div className={styles.vaultIndex}>{vault.index}</div>
                <div className={styles.vaultNameWrap}>
                  <span className={styles.vaultSignal}>{vault.signal}</span>
                  <h3>{vault.name}</h3>
                </div>
                <p>{vault.descriptor}</p>
                <div className={styles.vaultCadence}>{vault.cadence}</div>
                <div className={`${styles.vaultArtwork} ${styles[`vaultArtwork${index + 1}`]}`} aria-hidden="true">
                  <span />
                  <i />
                </div>
                <Link href="/app/vaults" className={styles.vaultLink}>Explore vault <span>↗</span></Link>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.howSection} id="how">
          <div className={styles.howSticky} data-leopold-reveal>
            <span className={styles.sectionLabel}>05 — How it works</span>
            <h2>Six movements.<br /><em>One saving habit.</em></h2>
          </div>
          <div className={styles.steps}>
            {steps.map(([number, title, copy]) => (
              <article key={number} data-leopold-reveal>
                <span className={styles.stepNumber}>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.privacySection} id="privacy">
          <div className={styles.privacyHeadline} data-leopold-reveal>
            <span className={styles.kicker}>06 — Privacy boundary</span>
            <h2>
              Your savings are private.<br />
              Your result is private.<br />
              Your principal is <em>still yours.</em>
            </h2>
          </div>

          <div className={styles.privacyVisual} aria-hidden="true">
            <div className={styles.privacyVoid} />
            <div className={styles.privacyBeam} />
            <span>PRIVATE</span>
            <i>PUBLIC</i>
          </div>

          <div className={styles.privacyColumns}>
            <div data-leopold-reveal>
              <h3><span className={styles.yellowDot} />Protected</h3>
              {privateFacts.map((fact) => <p key={fact}>{fact}<span>Hidden</span></p>)}
            </div>
            <div data-leopold-reveal>
              <h3><span className={styles.whiteDot} />Public by design</h3>
              {publicFacts.map((fact) => <p key={fact}>{fact}<span>Visible</span></p>)}
            </div>
          </div>

          <p className={styles.confidentiality} data-leopold-reveal>
            Leopold provides confidentiality, <em>not anonymity.</em>
          </p>
        </section>

        <section className={styles.safetySection}>
          <div data-leopold-reveal>
            <span className={styles.sectionLabel}>07 — Principal safety</span>
            <h2>Your savings<br />are not the<br /><em>prize pool.</em></h2>
          </div>
          <div className={styles.safetyCopy} data-leopold-reveal>
            <p className={styles.safetyLead}>
              Leopold separates what belongs to savers from what funds prizes. Deposits are not redistributed between
              participants.
            </p>
            {[
              ["01", "Genuine yield", "Yield generated by the savings strategy can be routed into prize reserve."],
              ["02", "Sponsor contributions", "Sponsors can add reserve without touching saver principal."],
              ["03", "Rollover", "Undistributed reserve can carry forward into future rounds."],
            ].map(([number, title, copy]) => (
              <div className={styles.safetyItem} key={number}>
                <span>{number}</span>
                <div><h3>{title}</h3><p>{copy}</p></div>
              </div>
            ))}
            <div className={styles.safetyCallout}>Principal can be withdrawn independently of any prize outcome.</div>
          </div>
        </section>

        <section className={styles.missionSection}>
          <div className={styles.missionGrid} aria-hidden="true" />
          <div className={styles.missionLabel}>08 — Design principle</div>
          <blockquote data-leopold-reveal>
            “Privacy should be a property of saving, not a feature you have to ask for.”
          </blockquote>
          <div className={styles.missionStamp} aria-hidden="true">L</div>
        </section>

        <section className={styles.finalSection}>
          <span className={styles.sectionLabel} data-leopold-reveal>09 — Begin</span>
          <h2 data-leopold-reveal>
            SAVE PRIVATELY.<br />
            WIN PRIVATELY.<br />
            <em>WITHDRAW ANYTIME.</em>
          </h2>
          <div className={styles.finalActions} data-leopold-reveal>
            <Link href="/app" className={styles.primaryCta}>Start saving privately <span>↗</span></Link>
            <Link href="/transparency" className={styles.textCta}>Read transparency <span>→</span></Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span>LEOPOLD</span>
          <p>Private Prize Savings.</p>
        </div>
        <div className={styles.footerLinks}>
          <div><strong>Product</strong><Link href="/app">Dashboard</Link><Link href="/app/vaults">Vaults</Link><Link href="/app/prizes">Prizes</Link></div>
          <div><strong>Trust</strong><Link href="/transparency">Transparency</Link><Link href="/ops">Status</Link><Link href="/app/help">Help</Link></div>
          <div><strong>Account</strong><Link href="/login">Sign in</Link><Link href="/onboarding">Onboarding</Link><Link href="/app/profile">Profile</Link></div>
        </div>
        <div className={styles.footerBottom}>
          <span>Save privately. Win privately. Withdraw anytime.</span>
          <span>Leopold provides confidentiality, not anonymity.</span>
        </div>
      </footer>
    </div>
  );
}
