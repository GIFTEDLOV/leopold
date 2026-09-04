"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import { OnboardingClient } from "@/components/auth-flow";
import { useAuth } from "@/components/auth-provider";
import styles from "./leopold-onboarding.module.css";

const assetRoot = "/marketing/leopold";

const onboardingSlides = [
  { label: "ACCOUNT ACCESS", title: "Sign in", copy: "Create or access Leopold with email or a wallet. Your account identity and savings wallet stay separate.", note: "Signing in never moves funds or connects a financial wallet automatically.", accentWords: ["Sign"], image: `${assetRoot}/leopold-daily.webp`, position: "center 38%", alt: "A saver reviewing an account on a phone" },
  { label: "EXTERNAL CONTROL", title: "Verify your wallet", copy: "Explicitly connect and verify the external wallet that will control your savings.", note: "Leopold never creates, auto-connects, or takes custody of your wallet.", accentWords: ["wallet"], image: `${assetRoot}/leopold-boost.webp`, position: "center 42%", alt: "A person verifying a financial action on a phone" },
  { label: "FUNDING ASSET", title: "Get USDC", copy: "Have USDC in your verified wallet before entering a savings vault.", note: "The current implementation uses canonical Circle USDC on Sepolia.", accentWords: ["USDC"], image: `${assetRoot}/leopold-savings-ledger.webp`, position: "center 55%", alt: "Coins arranged beside a private savings ledger" },
  { label: "ADD MONEY", title: "Add money", copy: "Choose how much USDC you want to save. Leopold handles the privacy preparation underneath the guided saving flow.", note: "Privacy preparation stays underneath the guided saving flow.", accentWords: ["money"], image: `${assetRoot}/leopold-secure-savings.webp`, position: "center 48%", alt: "Hands placing coins into a secured savings box" },
  { label: "WAYS TO SAVE", title: "Choose how you save", copy: "Prize Savings — automatic future participation. Classic Vaults — Daily, Weekly, Monthly, or Boost.", note: "Choose automatic participation or direct vault-by-vault control.", accentWords: ["save"], image: `${assetRoot}/leopold-weekly.webp`, position: "center 48%", alt: "A wall of secure deposit boxes representing savings vaults" },
  { label: "PRIZE SAVINGS", title: "Turn on Prize Savings", copy: "With Prize Savings, you turn it on once and Leopold keeps you entered in future eligible draws. Classic Vault users retain direct vault-by-vault control.", note: "Classic Vault users retain direct vault-by-vault control.", accentWords: ["Prize"], image: `${assetRoot}/leopold-investment-growth.webp`, position: "center 48%", alt: "A saver reviewing the growth of a financial position" },
  { label: "ENCRYPTED SELECTION", title: "Prize draw", copy: "Encrypted onchain randomness selects a winner without exposing private savings positions.", note: "The accepted ticket remains encrypted throughout selection.", accentWords: ["Prize"], image: `${assetRoot}/leopold-fair-draw.webp`, position: "57% center", alt: "A mechanical prize draw filled with tokens" },
  { label: "PRIVATE REVEAL", title: "Check your result", copy: "Privately reveal your own result while the public outcome remains verifiable.", note: "Only explicit user action reveals a private result.", accentWords: ["result"], image: `${assetRoot}/leopold-investment-review.webp`, position: "center 48%", alt: "A secure archival wall representing a privately revealed result" },
  { label: "KEEP OWNERSHIP", title: "Win or keep saving", copy: "If selected, receive the prize. Otherwise, your principal can keep participating.", note: "Prizes come from genuine yield, sponsors, and rollover—not principal.", accentWords: ["Win"], image: `${assetRoot}/leopold-monthly.webp`, position: "center 44%", alt: "Two savers standing beside a secure vault mechanism" },
  { label: "INDEPENDENT EXIT", title: "Withdraw anytime", copy: "Withdraw your principal independently of whether you win a prize.", note: "A prize outcome never takes ownership of your principal.", accentWords: ["Withdraw"], image: `${assetRoot}/leopold-hero.webp`, position: "center 52%", alt: "Hands managing a private savings position" },
  { label: "ORIENTATION COMPLETE", title: "You’re ready for Leopold.", copy: "Private savings. Verifiable prizes. Your principal remains yours.", note: "Continue to create or access your Leopold account.", accentWords: ["ready"], image: `${assetRoot}/leopold-principle.webp`, position: "center 48%", alt: "A secure financial archive representing readiness to save privately", complete: true },
] as const;

function AccentTitle({ accentWords, children }: { accentWords: readonly string[]; children: string }) {
  const accents = new Set(accentWords.map((word) => word.toLowerCase()));
  return children.split(/(\b[\p{L}’]+\b)/gu).map((part, index) =>
    accents.has(part.toLowerCase()) ? <span className={styles.accent} key={`${part}-${index}`}>{part}</span> : part,
  );
}

function Brand() {
  return (
    <Link className={styles.brand} href="/" aria-label="Leopold home">
      <Image className={styles["brand-mark"]} src={`${assetRoot}/leopold-monogram.png`} width={512} height={512} alt="" aria-hidden="true" />
      <span>Leop<span className={styles["brand-accent"]}>old</span></span>
    </Link>
  );
}

function OnboardingWalkthrough() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const goTo = useCallback((nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(onboardingSlides.length - 1, nextIndex));
    const track = trackRef.current;
    const slide = track?.children.item(boundedIndex) as HTMLElement | null;
    if (!track || !slide) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: reducedMotion ? "auto" : "smooth" });
    setActiveIndex(boundedIndex);
  }, []);

  const syncActiveSlide = (event: UIEvent<HTMLDivElement>) => {
    const track = event.currentTarget;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    Array.from(track.children).forEach((child, index) => {
      const distance = Math.abs((child as HTMLElement).offsetLeft - track.offsetLeft - track.scrollLeft);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActiveIndex(nearestIndex);
  };

  const handleKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") { event.preventDefault(); goTo(activeIndex + 1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); goTo(activeIndex - 1); }
    else if (event.key === "Home") { event.preventDefault(); goTo(0); }
    else if (event.key === "End") { event.preventDefault(); goTo(onboardingSlides.length - 1); }
  };

  return (
    <div className={styles.onboarding}>
      <style jsx global>{`
        .${styles.onboarding}::before,
        .${styles.onboarding}::after { inset: 0; }
        .${styles.onboarding} main { padding-top: 0; min-height: 100svh; }
        .${styles.carousel} { min-height: 100svh; }
        @media (max-width: 720px) {
          .${styles.onboarding}::before,
          .${styles.onboarding}::after { inset: 0; }
          .${styles.onboarding} main { padding-top: 0; }
          .${styles.carousel} { min-height: 100svh; }
        }
      `}</style>
      <a className={styles["skip-link"]} href="#onboarding-track">Skip to walkthrough</a>
      <main>
        <section className={styles.carousel} aria-label="How Leopold works">
          <div className={styles.track} id="onboarding-track" ref={trackRef} role="region" aria-roledescription="carousel" aria-label="Leopold onboarding steps" tabIndex={0} onKeyDown={handleKeys} onScroll={syncActiveSlide}>
            {onboardingSlides.map((slide, index) => (
              <article className={styles.slide} key={slide.label} aria-label={`Step ${index + 1} of ${onboardingSlides.length}: ${slide.title}`} aria-current={activeIndex === index ? "step" : undefined}>
                <div className={styles["slide-image"]}>
                  <Image src={slide.image} alt={slide.alt} fill sizes="(max-width: 720px) 100vw, 55vw" priority={index === 0} unoptimized style={{ objectPosition: slide.position }} />
                  <span className={styles["image-grid"]} aria-hidden="true" />
                  <span className={styles["image-index"]} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className={styles["slide-copy"]}>
                  <div className={styles["board-brand"]}><Brand /><span>ONBOARDING</span></div>
                  <div className={styles["board-intro"]}>
                    <p>LEOPOLD ORIENTATION</p>
                    <div><span>From sign in to <strong>private saving.</strong></span><small aria-live="polite">{String(index + 1).padStart(2, "0")} / {String(onboardingSlides.length).padStart(2, "0")}</small></div>
                  </div>
                  <p className={styles.label}>{slide.label}</p>
                  <h2><AccentTitle accentWords={slide.accentWords}>{slide.title}</AccentTitle></h2>
                  <p className={styles.copy}>{slide.copy}</p>
                  <p className={styles.note}>{slide.note}</p>
                  <div className={styles["slide-actions"]}>
                    {index > 0 ? <button className={styles["step-previous"]} type="button" onClick={() => goTo(index - 1)}><span aria-hidden="true">←</span> Previous step</button> : null}
                    {"complete" in slide && slide.complete ? (
                      <div className={styles["completion-actions"]}>
                        <Link className={styles.primary} href="/login">Continue to sign in <span aria-hidden="true">↗</span></Link>
                        <Link className={styles.secondary} href="/">Return to landing page</Link>
                      </div>
                    ) : (
                      <><button className={styles["step-next"]} type="button" onClick={() => goTo(index + 1)}>Next step <span aria-hidden="true">→</span></button><div className={styles["jump-row"]}><Link className={styles["jump-sign-in"]} href="/login">Jump to sign in <span aria-hidden="true">↗</span></Link></div></>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className={styles.progress} role="group" aria-label="Choose an onboarding step">
            {onboardingSlides.map((slide, index) => (
              <button className={index === activeIndex ? styles.active : undefined} type="button" onClick={() => goTo(index)} aria-label={`Go to step ${index + 1}: ${slide.title}`} aria-current={index === activeIndex ? "step" : undefined} key={slide.label}><span>{String(index + 1).padStart(2, "0")}</span></button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export function LeopoldOnboardingRoute() {
  const auth = useAuth();
  if (auth.authenticated) return <OnboardingClient />;
  return <OnboardingWalkthrough />;
}
