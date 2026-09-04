"use client";

import Image from "next/image";
import { ThemeToggle } from "@/components/theme-toggle";
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

const navigationLinks = [
  ["Products", "#product"],
  ["Ways to Save", "#vaults"],
  ["Privacy", "#protocol"],
  ["How it Works", "#how-it-works"],
  ["Company", "#principle"],
  ["Open App", "/onboarding"],
] as const;

const featureCards = [
  { label: "PRIVATE BY DEFAULT", copy: "Your savings position stays encrypted, not displayed to the pool.", accentWords: ["private"], size: "feature-card--wide", image: "feature-card--photo-a", video: undefined, variant: undefined },
  { label: "PRIZE SAVINGS", copy: "Turn it on once and stay automatically entered in upcoming eligible draws while your savings remain available to you.", accentWords: ["savings"], size: "feature-card--tall", image: "feature-card--ink", video: undefined, variant: undefined },
  { label: "WITHDRAW ANYTIME", copy: "Leave the pool without waiting for a draw to finish.", accentWords: ["withdraw"], size: "feature-card--mid", image: "feature-card--photo-b", video: undefined, variant: undefined },
  { label: "ENCRYPTED DRAW", copy: "The accepted random ticket never becomes visible to an admin, keeper, or participant.", accentWords: ["encrypted"], size: "feature-card--tall", image: "feature-card--photo-c", video: undefined, variant: undefined },
  { label: "COMPOUND III", copy: "USDC is supplied directly to the protocol yield source.", accentWords: ["compound"], size: "feature-card--short", image: "feature-card--linework", video: undefined, variant: undefined },
  { label: "BUILT ON ZAMA", copy: "Encrypted state can still drive public, composable onchain outcomes.", accentWords: ["zama"], size: "feature-card--mid", image: "feature-card--photo-d", video: undefined, variant: undefined },
  { label: "AUTOMATIC PARTICIPATION", copy: "Turn Prize Savings on once and stay entered in future eligible draws.", accentWords: ["participation"], size: "feature-card--mid", image: "", video: `${assetRoot}/leopold-savings-coins.mp4`, variant: "feature-card--video-left" },
  { label: "SAVE, THEN STAY IN", copy: "Your savings remain yours while your participation continues.", accentWords: ["savings"], size: "feature-card--mid", image: "", video: `${assetRoot}/leopold-savings-cash.mp4`, variant: "feature-card--video-right" },
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

const prizeSavingsCadence = {
  label: "DEFAULT EXPERIENCE",
  title: "Prize Savings",
  copy: "Save once. Turn Prize Savings on. Stay automatically entered in future eligible draws without coming back to enter every round.",
  round: "Automatic participation",
  image: `${assetRoot}/leopold-savings-ledger.webp`,
  imageAlt: "A private savings ledger representing automatic prize participation",
  width: 1800,
  height: 2400,
} as const;

const savingSteps = [
  ["Get test USDC", "Get Sepolia USDC if you need it."],
  ["Add money", "Choose how much USDC you want to save."],
  ["Turn on Prize Savings", "Enable automatic participation once."],
  ["Stay entered", "Leopold keeps you entered in future eligible draws."],
  ["Check your result", "See what happened after each draw."],
  ["Keep saving or withdraw", "Your savings remain accessible."],
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

function FeatureCardVideo({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const setSlowMotion = () => {
      video.playbackRate = 0.55;
    };

    setSlowMotion();
    video.addEventListener("loadedmetadata", setSlowMotion);
    return () => video.removeEventListener("loadedmetadata", setSlowMotion);
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        className={styles["feature-card-video"]}
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
      />
      <span className={styles["feature-card-video-tint"]} aria-hidden="true" />
    </>
  );
}

type PixelTile = { blink: boolean; cell: number; delay: number };

function createPixelTiles(): PixelTile[] {
  const cells = Array.from({ length: 60 }, (_, index) => index);

  for (let index = cells.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cells[index], cells[swapIndex]] = [cells[swapIndex], cells[index]];
  }

  return cells.slice(0, 8).map((cell, index) => ({
    blink: index === 1 || index === 6,
    cell,
    delay: 30 + Math.floor(Math.random() * 552),
  }));
}

function PixelCutouts() {
  const [active, setActive] = useState(false);
  const [revision, setRevision] = useState(0);
  const [tiles, setTiles] = useState<PixelTile[]>([]);

  const enter = () => {
    setActive(true);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setTiles(createPixelTiles());
    setRevision((current) => current + 1);
  };

  return (
    <span className={classes("pixel-cutouts", ...(active ? ["is-active"] : []))} aria-hidden="true" onMouseEnter={enter} onMouseLeave={() => setActive(false)}>
      <span className={styles["pixel-cutouts__tint"]} />
      <span className={styles["pixel-cutouts__tiles"]}>
        {tiles.map((tile) => (
          <span
            className={classes("pixel-cutouts__tile", ...(tile.blink ? ["pixel-cutouts__tile--blink"] : []))}
            key={`${revision}-${tile.cell}`}
            style={{
              "--pixel-delay": `${tile.delay}ms`,
              left: `${(tile.cell % 10) * 10}%`,
              top: `${Math.floor(tile.cell / 10) * 16.6667}%`,
            } as CSSProperties}
          />
        ))}
      </span>
    </span>
  );
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
  const [hoverRevision, setHoverRevision] = useState(0);

  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const startDelay = hoverRevision > 0 ? 0 : delay;
    const timers = sequence.map((reading, index) => window.setTimeout(() => {
      setFrame({ reading, revision: hoverRevision * sequence.length + index + 1 });
    }, startDelay + index * 105));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [active, delay, hoverRevision, sequence, target]);

  return <span onMouseEnter={() => setHoverRevision((revision) => revision + 1)}><span className={styles["counter-tick"]} key={`${frame.revision}-${frame.reading}`}>{format(frame.reading)}</span></span>;
}

export function LeopoldMarketingHome() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [heroFrame, setHeroFrame] = useState({ previous: 0, current: 0, revision: 0 });
  const [principleHeadline, setPrincipleHeadline] = useState(0);
  const [protocolEntered, setProtocolEntered] = useState(false);
  const [savingProcessEntered, setSavingProcessEntered] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const heroTitleRef = useRef<HTMLHeadingElement>(null);
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

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hero = heroRef.current;
    const heroTitle = heroTitleRef.current;
    const heroCopy = hero?.querySelector<HTMLElement>(`.${styles["hero-copy"]}`);
    if (!hero || !heroTitle || !heroCopy) return;

    let animationFrame = 0;
    let currentCopyOffset = 0;
    let copyOffsetInitialized = false;

    const updateScrollEffects = () => {
      animationFrame = 0;
      const heroRect = hero.getBoundingClientRect();
      const heroProgress = Math.min(1, Math.max(0, -heroRect.top / Math.max(heroRect.height, 1)));
      const viewportHeight = window.innerHeight;
      const targetCopyOffset = -Math.max(0, heroRect.bottom - viewportHeight);
      if (!copyOffsetInitialized || reducedMotion.matches) {
        currentCopyOffset = targetCopyOffset;
        copyOffsetInitialized = true;
      } else {
        currentCopyOffset += (targetCopyOffset - currentCopyOffset) * 0.2;
      }
      heroCopy.style.setProperty("--hero-copy-pin", `${currentCopyOffset.toFixed(2)}px`);
      if (reducedMotion.matches) return;

      const growthCap = viewportHeight < 660 ? 0.22 : viewportHeight < 780 ? 0.34 : 0.55;
      heroTitle.style.setProperty("--hero-scroll-scale", (1 + heroProgress * growthCap).toFixed(3));
      heroTitle.style.setProperty("--hero-scroll-lift", `${(-heroProgress * 12).toFixed(1)}px`);
      if (Math.abs(targetCopyOffset - currentCopyOffset) > 0.1) {
        animationFrame = window.requestAnimationFrame(updateScrollEffects);
      }
    };

    const requestUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updateScrollEffects);
    };

    updateScrollEffects();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return (
    <div className={styles.marketing}>
      <a className={styles["skip-link"]} href="#marketing-main">Skip to content</a>

      <header className={styles["site-header"]}>
        <a className={styles.brand} href="#top" aria-label="Leopold home">
          <BrandMark />
          <span>Leop<span className={styles["brand-word-accent"]}>old</span></span>
        </a>
        <nav className={styles["desktop-nav"]} aria-label="Primary navigation">
          {navigationLinks.map(([label, href]) => <Link className={classes("nav-link", ...(label === "Open App" ? ["nav-link--open-app"] : []))} href={href} key={label}>{label}</Link>)}
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

        {mobileOpen && (
          <div className={styles["mobile-menu"]}>
            {navigationLinks.map(([label, href]) => <Link className={label === "Open App" ? styles["mobile-launch"] : undefined} key={label} href={href} onClick={() => setMobileOpen(false)}>{label}<Arrow /></Link>)}
          </div>
        )}
      </header>

      <main id="marketing-main">
        <section className={styles.hero} id="top" aria-label="Leopold introduction" ref={heroRef}>
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
            <h1 className={styles["hero-scroll-title"]} ref={heroTitleRef}>Private savings.<br /><StyledWords accentWords={["provable"]}>Publicly provable.</StyledWords></h1>
            <p>Save USDC and choose how you want to participate. Prize Savings keeps you automatically entered in future eligible draws, while Classic Vaults gives you direct control over Daily, Weekly, Monthly and Boost.</p>
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
              <a className={classes("feature-card", card.size, card.image, ...(card.variant ? [card.variant] : []), ...(card.video ? ["feature-card--video"] : []))} href="#protocol" key={card.label}>
                {card.video ? <FeatureCardVideo src={card.video} /> : null}
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
            <div className={classes("product-image", "product-image--vault")} role="img" aria-label="A secure glass savings vessel in archival monochrome"><PixelCutouts /></div>
            <div className={styles["product-copy"]}>
              <p className={styles["section-label"]}>CONFIDENTIAL SAVINGS</p>
              <h3><StyledWords accentWords={["deposit"]}>Deposit without publishing your position.</StyledWords></h3>
              <p>Leopold keeps a participant’s savings balance encrypted while preserving the onchain state needed for deposits, prize accounting, and withdrawals.</p>
              <Link href="/app">Explore savings <Arrow /></Link>
            </div>
          </article>
          <article className={classes("product-row", "product-row--image-right")}>
            <div className={styles["product-copy"]}>
              <p className={styles["section-label"]}>PRIZE SAVINGS</p>
              <h3>Prize Savings, without re-entering every round</h3>
              <p>Add money, turn Prize Savings on once, and Leopold keeps preparing your savings for upcoming eligible draws. Your principal remains yours, and you can turn Prize Savings off or withdraw when you choose.</p>
              <Link href="/app">Explore Prize Savings <Arrow /></Link>
            </div>
            <div className={classes("product-image", "product-image--draw")} role="img" aria-label="Encrypted lines converging on a private prize draw"><PixelCutouts /></div>
          </article>
          <article className={classes("product-row", "product-row--image-left")}>
            <div className={classes("product-image", "product-image--yield")} role="img" aria-label="Coins and a secure savings vessel rendered in cool monochrome"><PixelCutouts /></div>
            <div className={styles["product-copy"]}>
              <p className={styles["section-label"]}><StyledWords accentWords={["yield"]}>USDC YIELD</StyledWords></p>
              <h3><StyledWords accentWords={["yield"]}>Yield becomes the prize.</StyledWords></h3>
              <p>Canonical Circle Sepolia USDC is supplied directly to Compound III. Genuine yield, sponsors, and rollover fund the prize reserve while participants retain withdrawal access to their principal.</p>
              <Link href="/transparency">Read the architecture <Arrow /></Link>
            </div>
          </article>
        </section>

        <section className={classes("built", "cadences")} id="vaults" aria-labelledby="cadences-title">
          <h2 id="cadences-title">Two ways to save with Leopold.</h2>
          <article className={classes("product-row", "cadence")}>
            <CadenceCopy cadence={prizeSavingsCadence} />
            <CadenceImage cadence={prizeSavingsCadence} />
          </article>
          <h2 className={styles["classic-vaults-heading"]}>Classic Vaults</h2>
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

        <section className={styles["saving-process"]} id="how-it-works" aria-labelledby="saving-process-title" ref={savingProcessRef}>
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
          <p className={styles["classic-note"]}><strong>Using Classic Vaults?</strong> Choose Daily, Weekly, Monthly or Boost and participate according to that vault&apos;s schedule.</p>
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
          <nav aria-label="Product links"><h3>PRODUCT</h3><Link href="/app">Dashboard</Link><Link href="/app">Prize Savings</Link><Link href="/app/vaults">Classic Vaults</Link><Link href="/app/prizes">Prizes</Link><Link href="/app/rewards">Rewards</Link></nav>
          <nav aria-label="Account links"><h3>ACCOUNT</h3><Link href="/login">Sign in</Link><Link href="/onboarding">Onboarding</Link><Link href="/app/profile">Profile</Link></nav>
          <nav aria-label="Trust links"><h3>TRUST</h3><Link href="/transparency">Transparency</Link><Link href="/ops">Status</Link><Link href="/app/help">Help</Link></nav>
          <div className={styles["footer-privacy"]}><h3>PRIVACY</h3><p>Confidential, not anonymous.</p><p>Private values reveal only on explicit user action.</p></div>
          <a className={styles["footer-monogram"]} href="#top" aria-label="Leopold home"><span aria-hidden="true" /></a>
        </div>
        <div className={styles["footer-legal"]}><span>© 2026 LEOPOLD</span><ThemeToggle className={styles["footer-theme-toggle"]} /><span>SEPOLIA PROTOTYPE · NOT AN OFFER OF FINANCIAL SERVICES</span></div>
      </footer>
    </div>
  );
}

type Cadence = {
  label: string;
  title: string;
  copy: string;
  round: string;
  image: string;
  imageAlt: string;
  width: number;
  height: number;
};

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
      <PixelCutouts />
    </figure>
  );
}
