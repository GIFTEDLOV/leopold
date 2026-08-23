"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import styles from "./leopold-marketing-home.module.css";

const assetRoot = "/marketing/leopold";

const heroImages = [
  `${assetRoot}/leopold-hero.webp`,
  `${assetRoot}/leopold-savings-ledger.webp`,
  `${assetRoot}/leopold-secure-savings.webp`,
  `${assetRoot}/leopold-investment-growth.webp`,
  `${assetRoot}/leopold-investment-review.webp`,
  `${assetRoot}/leopold-fair-draw.webp`,
] as const;

const menuGroups = {
  Product: [
    ["Prize Savings", "Save privately. Keep your principal withdrawable.", "#product"],
    ["Encrypted Draws", "A winner selected without revealing the ticket.", "#protocol"],
    ["Yield Engine", "USDC yield funds one shared prize.", "#product"],
  ],
  Protocol: [
    ["Confidential balances", "Deposits and prize positions remain encrypted.", "#protocol"],
    ["Onchain randomness", "Zama-native FHE randomness, generated in the draw.", "/transparency"],
    ["Compound III", "Direct supply into the canonical Sepolia USDC market.", "/transparency"],
  ],
  Company: [
    ["Mission", "Make prize savings private, fair, and verifiable.", "#principle"],
    ["Security", "No privileged party can decrypt the accepted ticket.", "/transparency"],
    ["Documentation", "Explore the architecture and protocol lifecycle.", "/transparency"],
  ],
} as const;

const featureCards = [
  { label: "PRIVATE BY DEFAULT", copy: "Your savings position stays encrypted, not displayed to the pool.", size: "feature-card--wide", image: "feature-card--photo-a" },
  { label: "PRIZE YIELD", copy: "One collective yield stream. One verifiable winner. Principal stays yours.", size: "feature-card--tall", image: "feature-card--ink" },
  { label: "WITHDRAW ANYTIME", copy: "Leave the pool without waiting for a draw to finish.", size: "feature-card--mid", image: "feature-card--photo-b" },
  { label: "ENCRYPTED DRAW", copy: "The accepted random ticket never becomes visible to an admin, keeper, or participant.", size: "feature-card--tall", image: "feature-card--photo-c" },
  { label: "COMPOUND III", copy: "USDC is supplied directly to the protocol yield source.", size: "feature-card--short", image: "feature-card--linework" },
  { label: "BUILT ON ZAMA", copy: "Encrypted state can still drive public, composable onchain outcomes.", size: "feature-card--mid", image: "feature-card--photo-d" },
] as const;

const savingCadences = [
  {
    label: "FAST RHYTHM",
    title: "Daily",
    copy: "A shorter prize cadence for savers who want opportunities to turn over every day.",
    round: "24 hours",
    image: `${assetRoot}/leopold-daily.webp`,
    imageAlt: "A saver using a phone and payment card",
    width: 1800,
    height: 2400,
  },
  {
    label: "RECOMMENDED",
    title: "Weekly",
    copy: "Leopold’s default balance between time in savings and a prize cycle that still feels close.",
    round: "7 days",
    image: `${assetRoot}/leopold-weekly.webp`,
    imageAlt: "A wall of secure vintage deposit boxes",
    width: 1800,
    height: 2397,
  },
  {
    label: "LONG HORIZON",
    title: "Monthly",
    copy: "A slower round for people who prefer to save, step away, and check in less often.",
    round: "30 days",
    image: `${assetRoot}/leopold-monthly.webp`,
    imageAlt: "Two people planning their savings together",
    width: 1800,
    height: 2411,
  },
  {
    label: "SPONSOR ENHANCED",
    title: "Boost",
    copy: "Sponsor contributions can strengthen prize reserve without turning saver principal into the prize.",
    round: "7 days",
    image: `${assetRoot}/leopold-boost.webp`,
    imageAlt: "A saver reviewing a transaction on a phone",
    width: 1800,
    height: 1200,
  },
] as const;

const savingSteps = [
  ["Get USDC", "Start with test USDC on Sepolia."],
  ["Make Private", "Cross the public boundary and receive Private USDC."],
  ["Save", "Choose one or more official Leopold vaults."],
  ["Enter", "Join an open prize round with its separate public settlement bond."],
  ["Reveal Privately", "Reveal only your own result when it becomes available."],
  ["Withdraw", "Take principal out independently of the prize outcome."],
] as const;

const principleHeadlines = [
  "Saving should be\nprivate by default.",
  "Saving should be private.\nWinning should be provable.\nYield should stay yours.",
] as const;

function classes(...names: string[]) {
  return names.map((name) => styles[name]).join(" ");
}

function BrandMark() {
  return (
    <Image
      className={styles["brand-mark"]}
      src={`${assetRoot}/leopold-monogram.png`}
      width={512}
      height={512}
      alt=""
      aria-hidden="true"
    />
  );
}

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

export function LeopoldMarketingHome() {
  const [openMenu, setOpenMenu] = useState<keyof typeof menuGroups | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [heroFrame, setHeroFrame] = useState({ previous: 0, current: 0, revision: 0 });
  const [principleHeadline, setPrincipleHeadline] = useState(0);

  useEffect(() => {
    heroImages.forEach((source) => {
      const image = new window.Image();
      image.src = source;
    });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const interval = window.setInterval(() => {
      setHeroFrame((frame) => ({
        previous: frame.current,
        current: (frame.current + 1) % heroImages.length,
        revision: frame.revision + 1,
      }));
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const interval = window.setInterval(() => {
      setPrincipleHeadline((headline) => (headline + 1) % principleHeadlines.length);
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className={styles.marketing}>
      <a className={styles["skip-link"]} href="#marketing-main">Skip to content</a>

      <header className={styles["site-header"]}>
        <a className={styles.brand} href="#top" aria-label="Leopold home">
          <BrandMark />
          <span>Leopold</span>
        </a>
        <nav className={styles["desktop-nav"]} aria-label="Primary navigation">
          {(Object.keys(menuGroups) as Array<keyof typeof menuGroups>).map((group) => (
            <button
              key={group}
              type="button"
              className={classes("nav-link", ...(openMenu === group ? ["is-active"] : []))}
              onClick={() => setOpenMenu(openMenu === group ? null : group)}
              onMouseEnter={() => setOpenMenu(group)}
              aria-expanded={openMenu === group}
            >
              {group}
            </button>
          ))}
        </nav>
        <button
          className={styles["mobile-toggle"]}
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <span />
          <span />
        </button>

        {openMenu && (
          <div className={styles["mega-menu"]} onMouseLeave={() => setOpenMenu(null)}>
            <p className={styles["menu-kicker"]}>{openMenu}</p>
            <div className={styles["menu-grid"]}>
              {menuGroups[openMenu].map(([title, copy, href]) => (
                <Link key={title} href={href} onClick={() => setOpenMenu(null)}>
                  <strong>{title}</strong>
                  <span>{copy}</span>
                  <Arrow />
                </Link>
              ))}
            </div>
          </div>
        )}

        {mobileOpen && (
          <div className={styles["mobile-menu"]}>
            {(Object.keys(menuGroups) as Array<keyof typeof menuGroups>).map((group) => (
              <a key={group} href={group === "Protocol" ? "#protocol" : "#product"} onClick={() => setMobileOpen(false)}>
                {group}
                <Arrow />
              </a>
            ))}
            <Link className={styles["mobile-launch"]} href="/app" onClick={() => setMobileOpen(false)}>Launch app</Link>
          </div>
        )}
      </header>

      <main id="marketing-main">
        <section className={styles.hero} id="top" aria-label="Leopold introduction">
          <div className={styles["hero-tiles"]} aria-hidden="true">
            {Array.from({ length: 96 }).map((_, index) => (
              <span
                className={styles["hero-tile"]}
                key={index}
                style={{ backgroundImage: `url(${heroImages[heroFrame.previous]})` }}
              >
                <i
                  className={styles["hero-tile-image"]}
                  key={`${heroFrame.revision}-${index}`}
                  style={{
                    backgroundImage: `url(${heroImages[heroFrame.current]})`,
                    "--stagger": (index * 37) % 96,
                  } as CSSProperties}
                />
              </span>
            ))}
          </div>
          <div className={styles["hero-shade"]} />
          <div className={styles["hero-copy"]}>
            <p className={styles.eyebrow}>PRIVATE PRIZE SAVINGS</p>
            <h1>Private savings.<br />Publicly provable.</h1>
          </div>
          <button
            className={styles["scroll-cue"]}
            type="button"
            onClick={() => document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" })}
          >
            <span>SCROLL</span>
            <i />
          </button>
        </section>

        <section className={styles.gateway} id="explore" aria-labelledby="gateway-title">
          <h2 id="gateway-title">Leopold is building private, prize-linked savings for the onchain economy.</h2>
          <div className={styles["feature-masonry"]} id="product">
            {featureCards.map((card) => (
              <a className={classes("feature-card", card.size, card.image)} href="#protocol" key={card.label}>
                <span className={styles["card-label"]}>{card.label}</span>
                <p>{card.copy}</p>
                <Arrow />
              </a>
            ))}
          </div>
        </section>

        <section className={styles.stats} id="protocol" aria-labelledby="stats-title">
          <div className={styles["protocol-map"]} aria-hidden="true">
            <div className={classes("map-ring", "map-ring--one")} />
            <div className={classes("map-ring", "map-ring--two")} />
            <div className={classes("map-axis", "map-axis--x")} />
            <div className={classes("map-axis", "map-axis--y")} />
            {Array.from({ length: 12 }).map((_, index) => <i key={index} />)}
            <span className={classes("map-note", "map-note--a")}>ENCRYPTED DEPOSIT</span>
            <span className={classes("map-note", "map-note--b")}>FHE TICKET</span>
            <span className={classes("map-note", "map-note--c")}>COMPOUND III</span>
            <span className={classes("map-note", "map-note--d")}>PUBLIC SETTLEMENT</span>
          </div>
          <div className={styles["stats-copy"]}>
            <p className={styles["section-label"]}>THE LEOPOLD PROTOCOL</p>
            <h2 id="stats-title">A private savings pool with a publicly verifiable outcome.</h2>
            <div className={styles["number-stack"]} aria-label="Leopold protocol facts">
              <div><strong>0</strong><span>privileged ticket decryptors</span></div>
              <div><strong>1</strong><span>shared prize pool</span></div>
              <div><strong>64</strong><span>encrypted random bits</span></div>
            </div>
            <p className={styles["fine-print"]}>PROTOCOL PARAMETERS SHOWN FOR THE CURRENT SEPOLIA IMPLEMENTATION. ONCHAIN STATE REMAINS THE SOURCE OF TRUTH.</p>
          </div>
        </section>

        <section className={styles.built} aria-labelledby="built-title">
          <h2 id="built-title">Built by Leopold.</h2>
          <article className={classes("product-row", "product-row--image-left")}>
            <div className={classes("product-image", "product-image--vault")} role="img" aria-label="A secure glass savings vessel in archival monochrome" />
            <div className={styles["product-copy"]}>
              <p className={styles["section-label"]}>CONFIDENTIAL SAVINGS</p>
              <h3>Deposit without publishing your position.</h3>
              <p>Leopold keeps a participant’s savings balance encrypted while preserving the onchain state needed for deposits, prize accounting, and withdrawals.</p>
              <Link href="/app">Explore savings <Arrow /></Link>
            </div>
          </article>
          <article className={classes("product-row", "product-row--image-right")}>
            <div className={styles["product-copy"]}>
              <p className={styles["section-label"]}>VERIFIABLE PRIZE DRAW</p>
              <h3>A winner without a visible ticket.</h3>
              <p>Zama-native encrypted randomness selects the draw outcome. The accepted ticket remains encrypted throughout selection and is never authorized for administrative decryption.</p>
              <Link href="/transparency">See the draw model <Arrow /></Link>
            </div>
            <div className={classes("product-image", "product-image--draw")} role="img" aria-label="Encrypted lines converging on a private prize draw" />
          </article>
          <article className={classes("product-row", "product-row--image-left")}>
            <div className={classes("product-image", "product-image--yield")} role="img" aria-label="Coins and a secure savings vessel rendered in cool monochrome" />
            <div className={styles["product-copy"]}>
              <p className={styles["section-label"]}>USDC YIELD</p>
              <h3>Yield becomes the prize.</h3>
              <p>Canonical Circle Sepolia USDC is supplied directly to Compound III. Genuine yield, sponsors, and rollover fund the prize reserve while participants retain withdrawal access to their principal.</p>
              <Link href="/transparency">Read the architecture <Arrow /></Link>
            </div>
          </article>
        </section>

        <section className={classes("built", "cadences")} aria-labelledby="cadences-title">
          <h2 id="cadences-title">Built for saving.</h2>
          <div className={styles["cadence-list"]}>
            {savingCadences.map((cadence, index) => (
              <article className={classes("product-row", "cadence")} key={cadence.title}>
                {index % 2 === 0 ? (
                  <>
                    <CadenceCopy cadence={cadence} />
                    <CadenceImage cadence={cadence} />
                  </>
                ) : (
                  <>
                    <CadenceImage cadence={cadence} />
                    <CadenceCopy cadence={cadence} />
                  </>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className={styles["saving-process"]} aria-labelledby="saving-process-title">
          <div className={styles["saving-process-heading"]}>
            <p className={styles["section-label"]}>HOW LEOPOLD WORKS</p>
            <h2 id="saving-process-title">From public money to private saving.</h2>
          </div>
          <ol className={styles["saving-steps"]}>
            {savingSteps.map(([title, copy], index) => (
              <li key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><h3>{title}</h3><p>{copy}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.principle} id="principle" aria-labelledby="principle-title">
          <div className={styles["principle-content"]}>
            <p className={styles["section-label"]}>OUR PRINCIPLE</p>
            <h2 className={styles["principle-headline"]} id="principle-title" aria-live="polite">
              <span className={styles["sr-only"]}>{principleHeadlines[principleHeadline].replaceAll("\n", " ")}</span>
              {principleHeadlines.map((headline, index) => (
                <span
                  className={classes("principle-headline-copy", ...(index === principleHeadline ? ["is-active"] : []))}
                  aria-hidden="true"
                  key={headline}
                >
                  {headline}
                </span>
              ))}
            </h2>
            <p>Prize savings should preserve ownership, protect sensitive financial state, and keep the rules inspectable. Leopold provides confidentiality, not anonymity.</p>
            <div>
              <Link href="/app">START SAVING <Arrow /></Link>
              <Link href="/transparency">TRANSPARENCY <Arrow /></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles["site-footer"]}>
        <div className={styles["footer-brandline"]}>
          <a className={classes("brand", "brand--large")} href="#top"><BrandMark /><span>Leopold</span></a>
          <h2>Private prize savings, built to be verified.</h2>
        </div>
        <div className={styles["footer-grid"]}>
          <nav aria-label="Product links"><h3>PRODUCT</h3><a href="#product">Prize Savings</a><a href="#protocol">Encrypted Draws</a><a href="#product">Yield Engine</a></nav>
          <nav aria-label="Protocol links"><h3>PROTOCOL</h3><Link href="/transparency">Architecture</Link><Link href="/transparency">Security</Link><Link href="/transparency">Contracts</Link></nav>
          <nav aria-label="Company links"><h3>COMPANY</h3><a href="#principle">Mission</a><a href="#principle">About</a><a href="#notes">Contact</a></nav>
          <div className={styles.newsletter} id="notes">
            <h3>GET LEOPOLD NOTES</h3>
            {subscribed ? (
              <p className={styles["success-note"]} role="status">You’re on the private-beta list.</p>
            ) : (
              <form onSubmit={(event) => { event.preventDefault(); setSubscribed(true); }}>
                <label className={styles["sr-only"]} htmlFor="marketing-email">Email address</label>
                <input id="marketing-email" type="email" required placeholder="you@company.com" />
                <button type="submit" aria-label="Subscribe">↗</button>
              </form>
            )}
          </div>
        </div>
        <div className={styles["footer-legal"]}><span>© 2026 LEOPOLD</span><span>SEPOLIA PROTOTYPE · NOT AN OFFER OF FINANCIAL SERVICES</span></div>
      </footer>
    </div>
  );
}

type Cadence = (typeof savingCadences)[number];

function CadenceCopy({ cadence }: { cadence: Cadence }) {
  return (
    <div className={classes("product-copy", "cadence-copy")}>
      <p className={styles["section-label"]}>{cadence.label}</p>
      <h3>{cadence.title}</h3>
      <p>{cadence.copy}</p>
      <dl><dt>ROUND</dt><dd>{cadence.round}</dd></dl>
      <Link href="/app">Explore vault <Arrow /></Link>
    </div>
  );
}

function CadenceImage({ cadence }: { cadence: Cadence }) {
  return (
    <figure className={classes("product-image", "cadence-image")}>
      <Image
        src={cadence.image}
        alt={cadence.imageAlt}
        width={cadence.width}
        height={cadence.height}
        sizes="(max-width: 820px) 100vw, 50vw"
      />
    </figure>
  );
}
