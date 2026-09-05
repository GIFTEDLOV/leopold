"use client";

import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

const heroImages = [
  "/marketing/leopold/leopold-hero.webp",
  "/marketing/leopold/leopold-savings-ledger.webp",
  "/marketing/leopold/leopold-secure-savings.webp",
  "/marketing/leopold/leopold-investment-growth.webp",
  "/marketing/leopold/leopold-investment-review.webp",
  "/marketing/leopold/leopold-fair-draw.webp",
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
  { label: "PRIVATE BY DEFAULT", copy: "Your savings position stays encrypted, not displayed to the pool.", accentWords: ["private"], className: "feature-card feature-card--wide feature-card--photo-a" },
  { label: "PRIZE SAVINGS", copy: "Turn it on once and stay automatically entered in upcoming eligible draws while your savings remain available to you.", accentWords: ["savings"], className: "feature-card feature-card--tall feature-card--ink" },
  { label: "WITHDRAW ANYTIME", copy: "Leave the pool without waiting for a draw to finish.", accentWords: ["withdraw"], className: "feature-card feature-card--mid feature-card--photo-b" },
  { label: "ENCRYPTED DRAW", copy: "The accepted random ticket never becomes visible to an admin, keeper, or participant.", accentWords: ["encrypted"], className: "feature-card feature-card--tall feature-card--photo-c" },
  { label: "COMPOUND III", copy: "USDC is supplied directly to the protocol yield source.", accentWords: ["compound"], className: "feature-card feature-card--short feature-card--linework" },
  { label: "BUILT ON ZAMA", copy: "Encrypted state can still drive public, composable onchain outcomes.", accentWords: ["zama"], className: "feature-card feature-card--mid feature-card--photo-d" },
  { label: "AUTOMATIC PARTICIPATION", copy: "Turn Prize Savings on once and stay entered in future eligible draws.", accentWords: ["participation"], className: "feature-card feature-card--mid feature-card--video feature-card--video-left", video: "/marketing/leopold/leopold-savings-coins.mp4" },
  { label: "SAVE, THEN STAY IN", copy: "Your savings remain yours while your participation continues.", accentWords: ["savings"], className: "feature-card feature-card--mid feature-card--video feature-card--video-right", video: "/marketing/leopold/leopold-savings-cash.mp4" },
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
    image: "/marketing/leopold/leopold-daily.webp",
    imageAlt: "A saver using a phone and payment card",
  },
  {
    label: "RECOMMENDED",
    title: "Weekly",
    copy: "Leopold’s default balance between time in savings and a prize cycle that still feels close.",
    round: "7 days",
    image: "/marketing/leopold/leopold-weekly.webp",
    imageAlt: "A wall of secure vintage deposit boxes",
  },
  {
    label: "LONG HORIZON",
    title: "Monthly",
    copy: "A slower round for people who prefer to save, step away, and check in less often.",
    round: "30 days",
    image: "/marketing/leopold/leopold-monthly.webp",
    imageAlt: "Two people planning their savings together",
  },
  {
    label: "SPONSOR ENHANCED",
    title: "Boost",
    copy: "Sponsor contributions can strengthen prize reserve without turning saver principal into the prize.",
    round: "7 days",
    image: "/marketing/leopold/leopold-boost.webp",
    imageAlt: "A saver reviewing a transaction on a phone",
  },
] as const;

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

function BrandMark() {
  return <img className="brand-mark" src="/marketing/leopold/leopold-monogram.png" alt="" aria-hidden="true" />;
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

  return <><video ref={videoRef} className="feature-card-video" src={src} autoPlay muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1} /><span className="feature-card-video-tint" aria-hidden="true" /></>;
}

type PixelTile = { blink: boolean; cell: number; delay: number };

type HeroImageStatus = "pending" | "loaded" | "failed";

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
    <span className={active ? "pixel-cutouts is-active" : "pixel-cutouts"} aria-hidden="true" onMouseEnter={enter} onMouseLeave={() => setActive(false)}>
      <span className="pixel-cutouts__tint" />
      <span className="pixel-cutouts__tiles">
        {tiles.map((tile) => (
          <span
            className={tile.blink ? "pixel-cutouts__tile pixel-cutouts__tile--blink" : "pixel-cutouts__tile"}
            key={`${revision}-${tile.cell}`}
            style={{
              "--pixel-delay": `${tile.delay}ms`,
              left: `${(tile.cell % 10) * 10}%`,
              top: `${Math.floor(tile.cell / 10) * 16.6667}%`,
            } as React.CSSProperties}
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
      return <span className="public-word" key={`${part}-${index}`}>{part}</span>;
    }

    if (accents.has(word)) {
      return <span className="accent-word" key={`${part}-${index}`}>{part}</span>;
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

  return <span onMouseEnter={() => setHoverRevision((revision) => revision + 1)}><span className="counter-tick" key={`${frame.revision}-${frame.reading}`}>{format(frame.reading)}</span></span>;
}

export function MarketingHome() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [heroFrame, setHeroFrame] = useState({ previous: 0, current: 0, revision: 0 });
  const [heroImageStatus, setHeroImageStatus] = useState<HeroImageStatus[]>(() => heroImages.map(() => "pending"));
  const [principleHeadline, setPrincipleHeadline] = useState(0);
  const [protocolEntered, setProtocolEntered] = useState(false);
  const [savingProcessEntered, setSavingProcessEntered] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const heroTitleRef = useRef<HTMLHeadingElement>(null);
  const protocolRef = useRef<HTMLElement>(null);
  const savingProcessRef = useRef<HTMLElement>(null);
  const heroImageStatusRef = useRef(heroImageStatus);

  useEffect(() => {
    const markImageStatus = (index: number, status: HeroImageStatus) => {
      const nextStatus = heroImageStatusRef.current.map((currentStatus, currentIndex) => currentIndex === index ? status : currentStatus);
      heroImageStatusRef.current = nextStatus;
      setHeroImageStatus(nextStatus);
    };

    const preloadedImages = heroImages.map((source, index) => {
      const image = new window.Image();
      image.onload = () => markImageStatus(index, "loaded");
      image.onerror = () => markImageStatus(index, "failed");
      image.src = source;
      return image;
    });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => preloadedImages.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
    }

    const interval = window.setInterval(() => {
      setHeroFrame((frame) => {
        const nextFrame = (frame.current + 1) % heroImages.length;
        if (heroImageStatusRef.current[nextFrame] !== "loaded") return frame;
        return {
          previous: frame.current,
          current: nextFrame,
          revision: frame.revision + 1,
        };
      });
    }, 5000);

    return () => {
      window.clearInterval(interval);
      preloadedImages.forEach((image) => {
        image.onload = null;
        image.onerror = null;
      });
    };
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
    const heroCopy = hero?.querySelector<HTMLElement>(".hero-copy");
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

  const firstLoadedHeroImage = heroImageStatus[0] === "loaded" ? heroImages[0] : undefined;
  const resolveHeroImage = (index: number) => heroImageStatus[index] === "loaded" ? heroImages[index] : firstLoadedHeroImage;
  const previousHeroImage = resolveHeroImage(heroFrame.previous);
  const currentHeroImage = resolveHeroImage(heroFrame.current);

  return (
    <div className="marketing-home">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Leopold home"><BrandMark /><span>Leop<span className="brand-word-accent">old</span></span></a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navigationLinks.map(([label, href]) => <a className={label === "Open App" ? "nav-link nav-link--open-app" : "nav-link"} href={href} key={label}>{label}</a>)}
        </nav>
        <button className="mobile-toggle" type="button" aria-label="Toggle navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}><span /><span /></button>
        {mobileOpen && (
          <div className="mobile-menu">
            {navigationLinks.map(([label, href]) => <a className={label === "Open App" ? "mobile-launch" : undefined} key={label} href={href} onClick={() => setMobileOpen(false)}>{label}<Arrow /></a>)}
          </div>
        )}
      </header>

      <main id="main">
        <section className="hero" id="top" aria-label="Leopold introduction" ref={heroRef}>
          <div className="hero-tiles" aria-hidden="true">
            {Array.from({ length: 96 }).map((_, index) => (
              <span
                className="hero-tile"
                key={index}
                style={previousHeroImage ? { backgroundImage: `url(${previousHeroImage})` } : undefined}
              >
                <i
                  className="hero-tile-image"
                  key={`${heroFrame.revision}-${index}`}
                  style={{
                    ...(currentHeroImage ? { backgroundImage: `url(${currentHeroImage})` } : {}),
                    "--stagger": (index * 37) % 96,
                  } as React.CSSProperties}
                />
              </span>
            ))}
          </div>
          <div className="hero-shade" />
          <div className="hero-copy">
            <p className="eyebrow">CONFIDENTIAL PRIZE SAVINGS</p>
            <h1 className="hero-scroll-title" ref={heroTitleRef}>Private savings.<br /><StyledWords accentWords={["provable"]}>Publicly provable.</StyledWords></h1>
            <p>Save USDC and choose how you want to participate. Prize Savings keeps you automatically entered in future eligible draws, while Classic Vaults gives you direct control over Daily, Weekly, Monthly and Boost.</p>
          </div>
          <button className="scroll-cue" type="button" onClick={() => document.getElementById("explore")?.scrollIntoView({ behavior: "smooth" })}><span>SCROLL</span><i /></button>
        </section>

        <section className="gateway" id="explore" aria-labelledby="gateway-title">
          <h2 id="gateway-title"><StyledWords accentWords={["private"]}>Leopold is building private, prize-linked savings for the onchain economy.</StyledWords></h2>
          <div className="feature-masonry" id="product">
            {featureCards.map((card) => <a className={card.className} href="#protocol" key={card.label}>{"video" in card ? <FeatureCardVideo src={card.video} /> : null}<span className="card-label"><StyledWords accentWords={card.accentWords}>{card.label}</StyledWords></span><p><StyledWords accentWords={card.accentWords}>{card.copy}</StyledWords></p><Arrow /></a>)}
          </div>
        </section>

        <section className="stats" id="protocol" aria-labelledby="stats-title" ref={protocolRef}>
          <div className="protocol-map" aria-hidden="true">
            <div className="map-scan" />
            <div className="map-ring map-ring--one" />
            <div className="map-ring map-ring--two" />
            <div className="map-axis map-axis--x" />
            <div className="map-axis map-axis--y" />
            {Array.from({ length: 12 }).map((_, index) => <i key={index} style={{ "--point": index } as React.CSSProperties} />)}
            <span className="map-note map-note--a"><StyledWords accentWords={["deposit"]}>ENCRYPTED DEPOSIT</StyledWords></span>
            <span className="map-note map-note--b">FHE TICKET</span>
            <span className="map-note map-note--c">COMPOUND III</span>
            <span className="map-note map-note--d"><StyledWords>PUBLIC SETTLEMENT</StyledWords></span>
          </div>
          <div className="stats-copy">
            <p className="section-label">THE LEOPOLD PROTOCOL</p>
            <h2 id="stats-title"><StyledWords accentWords={["private", "verifiable"]}>A private savings pool with a publicly verifiable outcome.</StyledWords></h2>
            <div className="number-stack" aria-label="Leopold protocol facts">
              {protocolFacts.map((fact, index) => (
                <div key={fact.label} role="group" aria-label={`${fact.target} ${fact.label}`}>
                  <strong className="protocol-counter" aria-hidden="true"><AnimatedCounter active={protocolEntered} delay={index * 160} sequence={fact.sequence} target={fact.target} /></strong>
                  <span aria-hidden="true">{fact.label}</span>
                </div>
              ))}
            </div>
            <p className="fine-print">PROTOCOL PARAMETERS SHOWN FOR THE CURRENT SEPOLIA IMPLEMENTATION. ONCHAIN STATE REMAINS THE SOURCE OF TRUTH.</p>
          </div>
        </section>

        <section className="built" aria-labelledby="built-title">
          <h2 id="built-title">Built by Leopold.</h2>

          <article className="product-row product-row--image-left">
            <div className="product-image product-image--vault" role="img" aria-label="A secure glass savings vessel in archival monochrome"><PixelCutouts /></div>
            <div className="product-copy">
              <p className="section-label">CONFIDENTIAL SAVINGS</p>
              <h3><StyledWords accentWords={["deposit"]}>Deposit without publishing your position.</StyledWords></h3>
              <p>Leopold keeps a participant’s savings balance encrypted while preserving the onchain state needed for deposits, prize accounting, and withdrawals.</p>
              <a href="#launch">Explore savings <Arrow /></a>
            </div>
          </article>

          <article className="product-row product-row--image-right">
            <div className="product-copy">
              <p className="section-label">PRIZE SAVINGS</p>
              <h3>Prize Savings, without re-entering every round</h3>
              <p>Add money, turn Prize Savings on once, and Leopold keeps preparing your savings for upcoming eligible draws. Your principal remains yours, and you can turn Prize Savings off or withdraw when you choose.</p>
              <a href="#launch">Explore Prize Savings <Arrow /></a>
            </div>
            <div className="product-image product-image--draw" role="img" aria-label="Encrypted lines converging on a private prize draw"><PixelCutouts /></div>
          </article>

          <article className="product-row product-row--image-left">
            <div className="product-image product-image--yield" role="img" aria-label="Coins and a secure savings vessel rendered in cool monochrome"><PixelCutouts /></div>
            <div className="product-copy">
              <p className="section-label"><StyledWords accentWords={["yield"]}>USDC YIELD</StyledWords></p>
              <h3><StyledWords accentWords={["yield"]}>Yield becomes the prize.</StyledWords></h3>
              <p>Canonical Circle Sepolia USDC is supplied directly to Compound III. The pool’s generated yield funds the prize while participants retain withdrawal access to their savings.</p>
              <a href="#launch">Read the architecture <Arrow /></a>
            </div>
          </article>
        </section>

        <section className="built cadences" id="vaults" aria-labelledby="cadences-title">
          <h2 id="cadences-title">Two ways to save with Leopold.</h2>
          <article className="product-row cadence">
            <div className="product-copy cadence-copy">
              <p className="section-label">DEFAULT EXPERIENCE</p>
              <h3>Prize Savings</h3>
              <p><strong>Automatic participation</strong></p>
              <p>Save once. Turn Prize Savings on. Stay automatically entered in future eligible draws without coming back to enter every round.</p>
              <a href="#launch">Explore Prize Savings <Arrow /></a>
            </div>
            <figure className="product-image cadence-image"><img src="/marketing/leopold/leopold-savings-ledger.webp" alt="A private savings ledger representing automatic prize participation" /><PixelCutouts /></figure>
          </article>
          <h2 className="classic-vaults-heading">Classic Vaults</h2>
          <div className="cadence-list">
            {savingCadences.map((cadence, index) => (
              <article className="product-row cadence" key={cadence.title}>
                {index % 2 === 0 ? (
                  <>
                    <div className="product-copy cadence-copy">
                      <p className="section-label">{cadence.label}</p>
                      <h3>{cadence.title}</h3>
                      <p>{cadence.copy}</p>
                      <dl><dt>ROUND</dt><dd>{cadence.round}</dd></dl>
                      <a href="#launch">Explore vault <Arrow /></a>
                    </div>
                    <figure className="product-image cadence-image"><img src={cadence.image} alt={cadence.imageAlt} /><PixelCutouts /></figure>
                  </>
                ) : (
                  <>
                    <figure className="product-image cadence-image"><img src={cadence.image} alt={cadence.imageAlt} /><PixelCutouts /></figure>
                    <div className="product-copy cadence-copy">
                      <p className="section-label">{cadence.label}</p>
                      <h3>{cadence.title}</h3>
                      <p>{cadence.copy}</p>
                      <dl><dt>ROUND</dt><dd>{cadence.round}</dd></dl>
                      <a href="#launch">Explore vault <Arrow /></a>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="saving-process" id="how-it-works" aria-labelledby="saving-process-title" ref={savingProcessRef}>
          <div className="saving-process-heading">
            <p className="section-label">HOW LEOPOLD WORKS</p>
            <h2 id="saving-process-title"><StyledWords accentWords={["private"]}>From public money to private saving.</StyledWords></h2>
          </div>
          <ol className="saving-steps">
            {savingSteps.map(([title, copy], index) => (
              <li key={title}>
                <span className="saving-step-number" aria-hidden="true"><AnimatedCounter active={savingProcessEntered} delay={index * 110} format={(value) => String(value).padStart(2, "0")} sequence={savingStepSequences[index]} target={index + 1} /></span>
                <div><span className="sr-only">Step {index + 1}. </span><h3><StyledWords accentWords={["private"]}>{title}</StyledWords></h3><p><StyledWords>{copy}</StyledWords></p></div>
              </li>
            ))}
          </ol>
          <p><strong>Using Classic Vaults?</strong> Choose Daily, Weekly, Monthly or Boost and participate according to that vault&apos;s schedule.</p>
        </section>

        <section className="principle" id="principle" aria-labelledby="principle-title">
          <div className="principle-content">
            <p className="section-label">OUR PRINCIPLE</p>
            <h2 className="principle-headline" id="principle-title" aria-live="polite">
              <span className="sr-only">{principleHeadlines[principleHeadline].replaceAll("\n", " ")}</span>
              {principleHeadlines.map((headline, index) => (
                <span className={index === principleHeadline ? "principle-headline-copy is-active" : "principle-headline-copy"} aria-hidden="true" key={headline}><StyledWords accentWords={["private", "provable", "yield", "yours"]}>{headline}</StyledWords></span>
              ))}
            </h2>
            <p>Prize savings should preserve ownership, protect sensitive financial state, and keep the rules inspectable.</p>
            <div>
              <a id="launch" href="#product">START SAVING <Arrow /></a>
              <a href="#protocol">TRANSPARENCY <Arrow /></a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brandline">
          <a className="brand brand--large" href="#top"><BrandMark /><span>Leop<span className="brand-word-accent">old</span></span></a>
          <h2>Private prize savings, built to be verified.</h2>
        </div>
        <div className="footer-grid">
          <nav aria-label="Product links"><h3>PRODUCT</h3><a href="#launch">Dashboard</a><a href="#vaults">Prize Savings</a><a href="#vaults">Classic Vaults</a><a href="#protocol">Prizes</a><a href="#product">Rewards</a></nav>
          <nav aria-label="Account links"><h3>ACCOUNT</h3><a href="#launch">Sign in</a><a href="#how-it-works">Onboarding</a><a href="#launch">Profile</a></nav>
          <nav aria-label="Trust links"><h3>TRUST</h3><a href="#protocol">Transparency</a><a href="#protocol">Status</a><a href="#how-it-works">Help</a></nav>
          <div className="footer-privacy"><h3>PRIVACY</h3><p>Confidential, not anonymous.</p><p>Private values reveal only on explicit user action.</p></div>
          <a className="footer-monogram" href="#top" aria-label="Leopold home">
            <span aria-hidden="true" />
          </a>
        </div>
        <div className="footer-legal"><span>© 2026 LEOPOLD</span><ThemeToggle className="footer-theme-toggle" /><span>SEPOLIA PROTOTYPE · NOT AN OFFER OF FINANCIAL SERVICES</span></div>
      </footer>
    </div>
  );
}
