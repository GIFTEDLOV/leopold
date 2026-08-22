"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import styles from "./landing-experience.module.css";

const HERO_IMAGES = [
  "https://images.unsplash.com/photo-1758524943857-de2839355a93?auto=format&fit=crop&fm=jpg&q=82&w=2200",
  "https://images.unsplash.com/photo-1462045504115-6c1d931f07d1?auto=format&fit=crop&fm=jpg&q=82&w=2200",
  "https://images.unsplash.com/photo-1775258856091-a276f8469a9d?auto=format&fit=crop&fm=jpg&q=82&w=2200",
] as const;

const MOSAIC_COLUMNS = 13;
const MOSAIC_ROWS = 7;

const vaults = [
  {
    number: "01",
    name: "Daily",
    cadence: "24 hours",
    label: "FAST RHYTHM",
    copy: "A shorter prize cadence for savers who want opportunities to turn over every day.",
    image: HERO_IMAGES[0],
  },
  {
    number: "02",
    name: "Weekly",
    cadence: "7 days",
    label: "RECOMMENDED",
    copy: "Leopold's default balance between time in savings and a prize cycle that still feels close.",
    image: HERO_IMAGES[1],
  },
  {
    number: "03",
    name: "Monthly",
    cadence: "30 days",
    label: "LONG HORIZON",
    copy: "A slower round for people who prefer to save, step away, and check in less often.",
    image: HERO_IMAGES[2],
  },
  {
    number: "04",
    name: "Boost",
    cadence: "7 days",
    label: "SPONSOR ENHANCED",
    copy: "Sponsor contributions can strengthen prize reserve without turning saver principal into the prize.",
    image: HERO_IMAGES[0],
  },
] as const;

const steps = [
  ["01", "Get USDC", "Start with test USDC on Sepolia."],
  ["02", "Make Private", "Cross the public boundary and receive Private USDC."],
  ["03", "Save", "Choose one or more official Leopold vaults."],
  ["04", "Enter", "Join an open prize round with its separate public settlement bond."],
  ["05", "Reveal Privately", "Reveal only your own result when it becomes available."],
  ["06", "Withdraw", "Take principal out independently of the prize outcome."],
] as const;

const protectedFacts = [
  "Private USDC balance",
  "Private vault savings",
  "Exact time-weighted prize weight",
  "Accepted random ticket",
  "Winner identity",
  "Prize winnings",
] as const;

const publicFacts = [
  "Wallet transactions and timing",
  "Make Private boundary amount",
  "Prize entry and settlement bond",
  "Round state and participant count",
  "Aggregate settlement progress",
  "Official deployment addresses",
] as const;

type TileStyle = CSSProperties & { "--tile-delay": string };

function tileStyle(image: string, index: number, cycle: number): TileStyle {
  const row = Math.floor(index / MOSAIC_COLUMNS);
  const column = index % MOSAIC_COLUMNS;
  const x = MOSAIC_COLUMNS === 1 ? 0 : (column / (MOSAIC_COLUMNS - 1)) * 100;
  const y = MOSAIC_ROWS === 1 ? 0 : (row / (MOSAIC_ROWS - 1)) * 100;
  const scramble = (index * 47 + cycle * 83 + (index % 5) * 19) % 760;

  return {
    "--tile-delay": `${scramble}ms`,
    backgroundImage: `url(${image})`,
    backgroundSize: `${MOSAIC_COLUMNS * 100}% ${MOSAIC_ROWS * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
  };
}

function MosaicHero() {
  const [imageIndex, setImageIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    HERO_IMAGES.forEach((src) => {
      const image = new Image();
      image.src = src;
    });

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const timer = window.setInterval(() => {
      setImageIndex((current) => {
        const next = (current + 1 + Math.floor(Math.random() * (HERO_IMAGES.length - 1))) % HERO_IMAGES.length;
        setPreviousIndex(current);
        setCycle((value) => value + 1);
        return next;
      });
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const tiles = Array.from({ length: MOSAIC_COLUMNS * MOSAIC_ROWS }, (_, index) => index);

  return (
    <div className={styles.mosaic} aria-label="Leopold private finance imagery">
      <div
        className={styles.mosaicBase}
        style={{ backgroundImage: `url(${HERO_IMAGES[previousIndex]})` }}
        aria-hidden="true"
      />
      <div className={styles.mosaicTiles} key={cycle} aria-hidden="true">
        {tiles.map((index) => (
          <span className={styles.mosaicTile} key={`${cycle}-${index}`} style={tileStyle(HERO_IMAGES[imageIndex], index, cycle)} />
        ))}
      </div>
      <div className={styles.mosaicTint} aria-hidden="true" />
      <div className={styles.mosaicGrain} aria-hidden="true" />
      <div className={styles.heroCopy}>
        <h1>The private layer of prize savings.</h1>
        <p>Save privately. Win privately. Withdraw anytime.</p>
      </div>
      <div className={styles.heroScroll}>SCROLL<span /></div>
    </div>
  );
}

function PhotoPanel({ image, className = "", children }: { image: string; className?: string; children?: React.ReactNode }) {
  return (
    <article className={`${styles.photoPanel} ${className}`} style={{ backgroundImage: `url(${image})` }}>
      <div className={styles.photoWash} aria-hidden="true" />
      {children}
    </article>
  );
}

export function LandingExperience() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = useMemo(
    () => [
      ["Product", "#product"],
      ["Vaults", "#vaults"],
      ["How it works", "#how"],
      ["Privacy", "#privacy"],
      ["Company", "#mission"],
    ],
    [],
  );

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-leopold-reveal]"));
    if (reduced) {
      nodes.forEach((node) => { node.dataset.visible = "true"; });
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
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Leopold home">
          <span className={styles.brandGlyph} aria-hidden="true">▤</span>
          Leopold
        </Link>
        <nav className={styles.desktopNav} aria-label="Landing navigation">
          {navItems.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
        </nav>
        <div className={styles.headerActions}>
          <Link className={styles.openApp} href="/app">Open app ↗</Link>
          <button className={styles.menuButton} type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}>
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>
      </header>

      <div className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ""}`} aria-hidden={!menuOpen}>
        {navItems.map(([label, href], index) => (
          <a key={label} href={href} onClick={() => setMenuOpen(false)}><span>{String(index + 1).padStart(2, "0")}</span>{label}</a>
        ))}
        <Link href="/app" onClick={() => setMenuOpen(false)}>Start saving privately ↗</Link>
      </div>

      <main>
        <section className={styles.heroSection} id="product">
          <MosaicHero />
        </section>

        <section className={styles.introSection}>
          <h2 data-leopold-reveal>Leopold is building a private savings layer for everyday money.</h2>
          <div className={styles.collage}>
            <PhotoPanel image={HERO_IMAGES[0]} className={styles.collageWide}>
              <span className={styles.label}>PRIVATE SAVINGS</span>
              <strong>Your balance does not need to become public.</strong>
            </PhotoPanel>
            <PhotoPanel image={HERO_IMAGES[2]} className={styles.collageTall}>
              <span className={styles.label}>PRINCIPAL SAFETY</span>
              <strong>Save for chances. Keep the money.</strong>
            </PhotoPanel>
            <PhotoPanel image={HERO_IMAGES[1]}>
              <span className={styles.label}>WITHDRAW ANYTIME</span>
              <strong>Your principal remains yours.</strong>
            </PhotoPanel>
            <PhotoPanel image={HERO_IMAGES[0]}>
              <span className={styles.label}>PRIVATE RESULTS</span>
              <strong>Reveal your outcome to yourself.</strong>
            </PhotoPanel>
            <PhotoPanel image={HERO_IMAGES[1]} className={styles.collageWideBottom}>
              <span className={styles.label}>TRANSPARENT RULES</span>
              <strong>Public protocol facts. Private user values.</strong>
            </PhotoPanel>
          </div>
        </section>

        <section className={styles.systemSection}>
          <div className={styles.systemVisual} data-leopold-reveal>
            <div className={styles.systemDiagram}>
              <span>PUBLIC USDC</span><i>→</i><span>PRIVATE USDC</span><i>→</i><span>VAULT</span><i>→</i><span>PRIVATE RESULT</span>
            </div>
            <div className={styles.systemGrid} aria-hidden="true" />
          </div>
          <div className={styles.systemCopy} data-leopold-reveal>
            <span className={styles.label}>THE LEOPOLD SYSTEM</span>
            <h2>The private operating layer for prize savings.</h2>
            <div className={styles.systemStats}>
              <div><strong>4</strong><span>Official vaults</span></div>
              <div><strong>0</strong><span>Principal used for prizes</span></div>
              <div><strong>1</strong><span>Owner of your private result</span></div>
            </div>
            <p>Prize reserve comes from genuine yield, sponsor contributions and rollover — never saver principal.</p>
          </div>
        </section>

        <section className={styles.vaultSection} id="vaults">
          <h2 data-leopold-reveal>Built for saving.</h2>
          <div className={styles.vaultStories}>
            {vaults.map((vault, index) => (
              <article className={`${styles.vaultStory} ${index % 2 ? styles.vaultReverse : ""}`} key={vault.name} data-leopold-reveal>
                <div className={styles.vaultCopy}>
                  <span className={styles.label}>{vault.label}</span>
                  <h3>{vault.name}</h3>
                  <p>{vault.copy}</p>
                  <dl><dt>ROUND</dt><dd>{vault.cadence}</dd></dl>
                  <Link href="/app/vaults">Explore vault ↗</Link>
                </div>
                <div className={styles.vaultImage} style={{ backgroundImage: `url(${vault.image})` }}>
                  <span className={styles.vaultNumber}>{vault.number}</span>
                  <div className={styles.photoWash} aria-hidden="true" />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.processSection} id="how">
          <div className={styles.processHeading} data-leopold-reveal>
            <span className={styles.label}>HOW LEOPOLD WORKS</span>
            <h2>From public money to private saving.</h2>
          </div>
          <div className={styles.processTrack}>
            {steps.map(([number, title, copy]) => (
              <article key={number} data-leopold-reveal>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.privacySection} id="privacy">
          <div className={styles.privacyImage} style={{ backgroundImage: `url(${HERO_IMAGES[2]})` }} aria-hidden="true">
            <div className={styles.privacyMask} />
          </div>
          <div className={styles.privacyHeadline} data-leopold-reveal>
            <span className={styles.label}>PRIVACY BOUNDARY</span>
            <h2>Private where it matters. Public where the protocol requires it.</h2>
          </div>
          <div className={styles.privacyLists}>
            <div data-leopold-reveal>
              <h3>Protected</h3>
              {protectedFacts.map((fact) => <p key={fact}>{fact}<span>PRIVATE</span></p>)}
            </div>
            <div data-leopold-reveal>
              <h3>Public by design</h3>
              {publicFacts.map((fact) => <p key={fact}>{fact}<span>PUBLIC</span></p>)}
            </div>
          </div>
          <p className={styles.privacyNote} data-leopold-reveal>Leopold provides confidentiality, not anonymity.</p>
        </section>

        <section className={styles.missionSection} id="mission" style={{ backgroundImage: `url(${HERO_IMAGES[1]})` }}>
          <div className={styles.missionOverlay} aria-hidden="true" />
          <div className={styles.missionContent} data-leopold-reveal>
            <span className={styles.label}>OUR PRINCIPLE</span>
            <h2>Saving should be private by default.</h2>
            <p>Prize savings should preserve ownership, protect sensitive financial state, and keep the rules inspectable.</p>
            <div>
              <Link href="/app">START SAVING ↗</Link>
              <Link href="/transparency">TRANSPARENCY ↗</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <Link href="/" className={styles.footerBrand}><span className={styles.brandGlyph}>▤</span>Leopold</Link>
          <h2>Making private prize savings usable.</h2>
        </div>
        <div className={styles.footerGrid}>
          <div><strong>PRODUCT</strong><Link href="/app">Dashboard</Link><Link href="/app/vaults">Vaults</Link><Link href="/app/prizes">Prizes</Link><Link href="/app/rewards">Rewards</Link></div>
          <div><strong>ACCOUNT</strong><Link href="/login">Sign in</Link><Link href="/onboarding">Onboarding</Link><Link href="/app/profile">Profile</Link></div>
          <div><strong>TRUST</strong><Link href="/transparency">Transparency</Link><Link href="/ops">Status</Link><Link href="/app/help">Help</Link></div>
          <div><strong>PRIVACY</strong><span>Confidential, not anonymous.</span><span>Private values reveal only on explicit user action.</span></div>
        </div>
        <div className={styles.footerBottom}><span>LEOPOLD · PRIVATE PRIZE SAVINGS</span><span>Save privately. Win privately. Withdraw anytime.</span></div>
      </footer>
    </div>
  );
}
