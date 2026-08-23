"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
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
  { label: "PRIVATE BY DEFAULT", copy: "Your savings position stays encrypted, not displayed to the pool.", accentWords: ["private"], size: "feature-card--wide", image: "feature-card--photo-a" },
  { label: "PRIZE YIELD", copy: "One collective yield stream. One verifiable winner. Principal stays yours.", accentWords: ["yield"], size: "feature-card--tall", image: "feature-card--ink" },
  { label: "WITHDRAW ANYTIME", copy: "Leave the pool without waiting for a draw to finish.", accentWords: ["withdraw"], size: "feature-card--mid", image: "feature-card--photo-b" },
  { label: "ENCRYPTED DRAW", copy: "The accepted random ticket never becomes visible to an admin, keeper, or participant.", accentWords: ["encrypted"], size: "feature-card--tall", image: "feature-card--photo-c" },
  { label: "COMPOUND III", copy: "USDC is supplied directly to the protocol yield source.", accentWords: ["compound"], size: "feature-card--short", image: "feature-card--linework" },
  { label: "BUILT ON ZAMA", copy: "Encrypted state can still drive public, composable onchain outcomes.", accentWords: ["zama"], size: "feature-card--mid", image: "feature-card--photo-d" },
] as const;

const protocolFacts = [
  { target: 0, sequence: [8, 3, 7, 2, 9, 4, 6, 0], label: "privileged ticket decryptors" },
  { target: 1, sequence: [7, 0, 8, 4, 2, 9, 5, 1], label: "shared prize pool" },
  { target: 64, sequence: [18, 72, 46, 91, 27, 83, 55, 64], label: "encrypted random bits" },
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

const savingStepSequences = [
  [84, 27, 63, 19, 72, 45, 88, 1],
  [51, 96, 34, 78, 13, 67, 40, 2],
  [73, 18, 92, 46, 25, 81, 59, 3],
  [29, 65, 10, 87, 43, 76, 31, 4],
  [68, 24, 90, 37, 82, 16, 54, 5],
  [42, 85, 21, 69, 14, 93, 57, 6],
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

function StyledWords({ children, accentWords = [] }: { children: string; accentWords?: readonly string[] }) {
  const accents = new Set(accentWords.map((word) => word.toLowerCase()));

  return children.split(/(\b[\p{L}]+\b)/gu).map((part, index) => {
    const word = part.toLowerCase();

    if (word === "public" || word === "publicly") {
      return <span className={styles["public-word"]} key={`${part}-${index}`}>{part}</span>;
    }

    if (accents.has(word)) {
      return <span className={styles["accent-word"]} key={`${part}-${index}`}>{part}</span>;
    }

    return part;
  });
}

function AnimatedCounter({ active, delay, format = String, sequence, target }: { active: boolean; delay: number; format?: (value: number) => string; sequence: readonly number[]; target: number }) {
  const [frame, setFrame] = useState({ reading: target, revision: 0 });

  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timers = sequence.map((reading, index) => window.setTimeout(() => {
      setFrame({ reading, revision: index + 1 });
    }, delay + index * 105));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [active, delay, sequence, target]);

  return <span className={styles["counter-tick"]} key={`${frame.revision}-${frame.reading}`}>{format(frame.reading)}</span>;
}

export function LeopoldMarketingHome() {
  const [openMenu, setOpenMenu] = useState<keyof typeof menuGroups | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [heroFrame, setHeroFrame] = useState({ previous: 0, current: 0, revision: 0 });
  const [principleHeadline, setPrincipleHeadline] = useState(0);
  const [protocolEntered, setProtocolEntered] = useState(false);
  const [savingProcessEntered, setSavingProcessEntered] = useState(false);
  const protocolRef = useRef<HTMLElement>(null);
  const savingProcessRef = useRef<HTMLElement>(null);

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

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const protocol = protocolRef.current;
    if (!protocol) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setProtocolEntered(true);
      observer.disconnect();
    }, { threshold: 0.35 });

    observer.observe(protocol);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const savingProcess = savingProcessRef.current;
    if (!savingProcess) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setSavingProcessEntered(true);
      observer.disconnect();
    }, { threshold: 0.3 });

    observer.observe(savingProcess);
    return () => observer.disconnect();
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
                  <strong><StyledWords accentWords={["yield"]}>{title}</StyledWords></strong>
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
            <h1>Private savings.<br /><StyledWords accentWords={["provable"]}>Publicly provable.</StyledWords></h1>
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
          <h2 id="gateway-title"><StyledWords accentWords={["private"]}>Leopold is building private, prize-linked savings for the onchain economy.</StyledWords></h2>
          <div className={styles["feature-masonry"]} id="product">
            {featureCards.map((card) => (
              <a className={classes("feature-card", card.size, card.image)} href="#protocol" key={card.label}>
                <span className={styles["card-label"]}><StyledWords accentWords={card.accentWords}>{card.label}</StyledWords></span>
                <p><StyledWords accentWords={card.accentWords}>{card.copy}</StyledWords></p>
                <Arrow />
              </a>
            ))}
          </div>
        </section>

        <section className={styles.stats} id="protocol" aria-labelledby="stats-title" ref={protocolRef}>
          <div className={styles["protocol-map"]} aria-hidden="true">
            <div className={styles["map-scan"]} />
            <div className={classes("map-ring", "map-ring--one")} />
            <div className={classes("map-ring", "map-ring--two")} />
            <div className={classes("map-axis", "map-axis--x")} />
            <div className={classes("map-axis", "map-axis--y")} />
            {Array.from({ length: 12 }).map((_, index) => <i key={index} style={{ "--point": index } as CSSProperties} />)}
            <span className={classes("map-note", "map-note--a")}><StyledWords accentWords={["deposit"]}>ENCRYPTED DEPOSIT</StyledWords></span>
            <span className={classes("map-note", "map-note--b")}>FHE TICKET</span>
            <span className={classes("map-note", "map-note--c")}>COMPOUND III</span>
            <span className={classes("map-note", "map-note--d")}><StyledWords>PUBLIC SETTLEMENT</StyledWords></span>
          </div>
          <div className={styles["stats-copy"]}>
            <p className={styles["section-label"]}>THE LEOPOLD PROTOCOL</p>
            <h2 id="stats-title"><StyledWords accentWords={["private", "verifiable"]}>A private savings pool with a publicly verifiable outcome.</StyledWords></h2>
            <div className={styles["number-stack"]} aria-label="Leopold protocol facts">
              {protocolFacts.map((fact, index) => (
                <div key={fact.label} role="group" aria-label={`${fact.target} ${fact.label}`}>
                  <strong className={styles["protocol-counter"]} aria-hidden="true"><AnimatedCounter active={protocolEntered} delay={index * 160} sequence={fact.sequence} target={fact.target} /></strong>
                  <span aria-hidden="true">{fact.label}</span>
                </div>
              ))}
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
              <h3><StyledWords accentWords={["deposit"]}>Deposit without publishing your position.</StyledWords></h3>
              <p>Leopold keeps a participant’s savings balance encrypted while preserving the onchain state needed for deposits, prize accounting, and withdrawals.</p>
              <Link href="/app">Explore savings <Arrow /></Link>
            </div>
          </article>
          <article className={classes("product-row", "product-row--image-right")}>
            <div className={styles["product-copy"]}>
              <p className={styles["section-label"]}>VERIFIABLE PRIZE DRAW</p>
              <h3><StyledWords accentWords={["winner"]}>A winner without a visible ticket.</StyledWords></h3>
              <p>Zama-native encrypted randomness selects the draw outcome. The accepted ticket remains encrypted throughout selection and is never authorized for administrative decryption.</p>
              <Link href="/transparency">See the draw model <Arrow /></Link>
            </div>
            <div className={classes("product-image", "product-image--draw")} role="img" aria-label="Encrypted lines converging on a private prize draw" />
          </article>
          <article className={classes("product-row", "product-row--image-left")}>
            <div className={classes("product-image", "product-image--yield")} role="img" aria-label="Coins and a secure savings vessel rendered in cool monochrome" />
            <div className={styles["product-copy"]}>
              <p className={styles["section-label"]}><StyledWords accentWords={["yield"]}>USDC YIELD</StyledWords></p>
              <h3><StyledWords accentWords={["yield"]}>Yield becomes the prize.</StyledWords></h3>
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

        <section className={styles["saving-process"]} aria-labelledby="saving-process-title" ref={savingProcessRef}>
          <div className={styles["saving-process-heading"]}>
            <p className={styles["section-label"]}>HOW LEOPOLD WORKS</p>
            <h2 id="saving-process-title"><StyledWords accentWords={["private"]}>From public money to private saving.</StyledWords></h2>
          </div>
          <ol className={styles["saving-steps"]}>
            {savingSteps.map(([title, copy], index) => (
              <li key={title}>
                <span className={styles["saving-step-number"]} aria-hidden="true"><AnimatedCounter active={savingProcessEntered} delay={index * 110} format={(value) => String(value).padStart(2, "0")} sequence={savingStepSequences[index] ?? [index + 1]} target={index + 1} /></span>
                <div><span className={styles["sr-only"]}>Step {index + 1}. </span><h3><StyledWords accentWords={["private"]}>{title}</StyledWords></h3><p><StyledWords>{copy}</StyledWords></p></div>
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
                  <StyledWords accentWords={["private", "provable", "yield", "yours"]}>{headline}</StyledWords>
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
          <nav aria-label="Product links"><h3>PRODUCT</h3><a href="#product">Prize Savings</a><a href="#protocol">Encrypted Draws</a><a href="#product"><StyledWords accentWords={["yield"]}>Yield Engine</StyledWords></a></nav>
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
