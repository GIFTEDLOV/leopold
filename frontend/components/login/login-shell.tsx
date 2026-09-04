"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import styles from "@/components/full-site/login-shell.module.css";

const loginImages = [
  "/marketing/leopold/leopold-hero.webp",
  "/marketing/leopold/leopold-savings-ledger.webp",
  "/marketing/leopold/leopold-secure-savings.webp",
  "/marketing/leopold/leopold-investment-growth.webp",
  "/marketing/leopold/leopold-investment-review.webp",
  "/marketing/leopold/leopold-fair-draw.webp",
] as const;

function MosaicPanel() {
  const [frame, setFrame] = useState({ previous: 0, current: 0, revision: 0 });

  useEffect(() => {
    loginImages.forEach((source) => {
      const image = new window.Image();
      image.src = source;
    });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const interval = window.setInterval(() => {
      setFrame((currentFrame) => ({
        previous: currentFrame.current,
        current: (currentFrame.current + 1) % loginImages.length,
        revision: currentFrame.revision + 1,
      }));
    }, 5_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className={styles.mosaic} role="img" aria-label="A changing mosaic of private savings imagery">
      {Array.from({ length: 64 }).map((_, index) => {
        const column = index % 8;
        const row = Math.floor(index / 8);
        const backgroundPosition = `${(column / 7) * 100}% ${(row / 7) * 100}%`;
        return (
          <span className={styles.tile} key={index} style={{ backgroundImage: `url(${loginImages[frame.previous]})`, backgroundPosition }}>
            <i
              key={`${frame.revision}-${index}`}
              style={{
                backgroundImage: `url(${loginImages[frame.current]})`,
                backgroundPosition,
                "--stagger": (index * 37) % 64,
              } as CSSProperties}
            />
          </span>
        );
      })}
      <span className={styles["mosaic-screen"]} aria-hidden="true" />
      <p><span>PRIVATE BY DEFAULT</span><strong>Save privately.<br />Stay in control.</strong></p>
    </div>
  );
}

type LoginShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title?: ReactNode;
  profileLayout?: boolean;
};

export function LoginShell({
  children,
  eyebrow = "PRIVATE PRIZE SAVINGS",
  title = <>Sign Up/Sign In<br />to <span>Leopold</span></>,
  profileLayout = false,
}: LoginShellProps) {
  return (
    <main className={styles.login}>
      <section className={styles.board} aria-labelledby="login-title">
        <div className={styles.formPanel}>
          <Link className={styles.brand} href="/" aria-label="Leopold home">
            <img src="/marketing/leopold/leopold-monogram.png" width="512" height="512" alt="" aria-hidden="true" />
            <span>Leop<span>old</span></span>
          </Link>
          <div className={`${styles.formContent} ${profileLayout ? styles.profileLayout : ""}`} aria-live="polite">
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 id="login-title">{title}</h1>
            {children}
          </div>
          <nav className={styles.footer} aria-label="Login navigation"><Link href="/">Home</Link></nav>
        </div>
        <MosaicPanel />
      </section>
    </main>
  );
}
