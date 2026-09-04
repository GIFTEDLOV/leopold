"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import styles from "../../app/login/auth-page.module.css";

const loginImages = [
  "/marketing/leopold/leopold-hero.webp",
  "/marketing/leopold/leopold-savings-ledger.webp",
  "/marketing/leopold/leopold-secure-savings.webp",
  "/marketing/leopold/leopold-investment-growth.webp",
  "/marketing/leopold/leopold-investment-review.webp",
  "/marketing/leopold/leopold-fair-draw.webp",
] as const;

const tileCount = 64;

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
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className={styles.mosaic} role="img" aria-label="A changing mosaic of private savings imagery">
      {Array.from({ length: tileCount }).map((_, index) => {
        const column = index % 8;
        const row = Math.floor(index / 8);
        const backgroundPosition = `${(column / 7) * 100}% ${(row / 7) * 100}%`;

        return (
          <span
            className={styles.tile}
            key={index}
            style={{ backgroundImage: `url(${loginImages[frame.previous]})`, backgroundPosition }}
          >
            <i
              key={`${frame.revision}-${index}`}
              style={
                {
                  backgroundImage: `url(${loginImages[frame.current]})`,
                  backgroundPosition,
                  "--stagger": (index * 37) % tileCount,
                } as CSSProperties
              }
            />
          </span>
        );
      })}
      <span className={styles.mosaicScreen} aria-hidden="true" />
      <p className={styles.mosaicCopy}>
        <span>PRIVATE BY DEFAULT</span>
        <strong>
          Save privately.
          <br />
          Stay in control.
        </strong>
      </p>
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
  profileLayout = false,
  title = (
    <>
      Sign Up/Sign In
      <br />
      to <span>Leopold</span>
    </>
  ),
}: LoginShellProps) {
  return (
    <main className={styles.login}>
      <style jsx global>{`
        #login-title {
          line-height: 1.02 !important;
        }
        .profile-primary,
        .profile-primary:hover,
        .profile-primary:focus-visible {
          color: #fffef9 !important;
          font-size: 11px !important;
          font-weight: 800 !important;
        }

        .${styles.board} {
          width: min(1240px, calc(100vw - 72px));
          height: auto;
          max-height: calc(100svh - 72px);
          min-height: 0;
          aspect-ratio: 1.5 / 1;
          grid-template-columns: minmax(390px, 39fr) minmax(0, 61fr);
          gap: 4px;
          padding: 4px;
          border: 0;
          border-radius: 5px;
          background-color: rgba(255, 254, 249, .97);
          background-image: radial-gradient(rgba(16,37,64,.035) .55px, transparent .55px);
          background-size: 4px 4px;
          box-shadow: none;
        }
        .${styles.formPanel} {
          border-radius: 1px 0 0 1px;
          background-color: rgba(255, 254, 249, .97);
          background-image: radial-gradient(rgba(16,37,64,.035) .55px, transparent .55px);
          background-size: 4px 4px;
        }
        .${styles.mosaic} {
          border-radius: 0 5px 5px 0;
        }
        .${styles.formContent} .profile-actions .button {
          height: 46px !important;
          min-height: 46px !important;
        }

        html[data-leopold-theme="dark"] .${styles.board},
        html[data-leopold-theme="dark"] .${styles.formPanel} {
          background-color: rgba(7,16,29,.97);
          background-image: radial-gradient(rgba(255,255,255,.035) .55px, transparent .55px);
        }

        @media (max-width: 1000px) and (min-width: 761px) {
          .${styles.board} {
            aspect-ratio: 1.42 / 1;
            grid-template-columns: minmax(360px, 43fr) minmax(0, 57fr);
          }
        }

        @media (max-width: 760px) {
          .${styles.login} {
            padding: 14px;
          }
          .${styles.board} {
            width: 100%;
            height: calc(100svh - 28px);
            max-height: none;
            min-height: 0;
            aspect-ratio: auto;
            grid-template-columns: 1fr;
            grid-template-rows: minmax(0, 1fr) minmax(180px, 38%);
            gap: 0;
            padding: 0;
            border-radius: 0;
          }
          .${styles.formPanel},
          .${styles.mosaic} {
            border-radius: 0;
          }
          .${styles.formContent} .profile-actions .button {
            height: 39px !important;
            min-height: 39px !important;
          }
        }
      `}</style>
      <section className={styles.board} aria-labelledby="login-title">
        <div className={styles.formPanel}>
          <Link className={styles.brand} href="/" aria-label="Leopold home">
            <Image
              src="/marketing/leopold/leopold-monogram.png"
              width={512}
              height={512}
              alt=""
              aria-hidden="true"
            />
            <span>
              Leop<span>old</span>
            </span>
          </Link>

          <div className={`${styles.formContent} ${profileLayout ? styles.profileContent : ""}`}>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 id="login-title">{title}</h1>
            {children}
          </div>

          <nav className={styles.footer} aria-label="Login navigation">
            <Link href="/">Home</Link>
          </nav>
        </div>
        <MosaicPanel />
      </section>
    </main>
  );
}
