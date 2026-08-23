# Leopold Sites Design Handoff

## Purpose and integration boundary

This document describes the marketing homepage imported from the current Leopold Sites project into the production repository. It is intended to let another developer or AI agent continue editing the design without access to the original Sites workspace.

The import is intentionally limited to presentation code for `/`:

- `/` renders the Sites-designed marketing homepage.
- `/app` and every nested authenticated application route continue to use the existing application layouts, providers, wallet gate, financial providers, and UI-controller boundary.
- `/login`, `/onboarding`, `/transparency`, and `/ops` remain existing routes.
- No contract, deployment, environment, authentication, Dynamic, wallet-session, Zama/FHE, financial-operation, TWAB, randomness, settlement, prize, reveal, or withdrawal code is part of this implementation.
- Marketing styles are isolated in a CSS Module. They do not replace or redefine the authenticated application's global design system.

The implementation files are:

- `frontend/app/page.tsx` — route entry point for `/`.
- `frontend/components/marketing/leopold-marketing-home.tsx` — complete interactive marketing page.
- `frontend/components/marketing/leopold-marketing-home.module.css` — scoped visual system, responsive rules, and motion.
- `frontend/public/marketing/leopold/` — local imagery, monogram, and social image.
- `frontend/app/layout.tsx` — existing root layout with marketing icon and Open Graph metadata added; the existing `Providers` hierarchy is unchanged.
- `frontend/app/icon.png` — file-based Next.js app icon using the current interlocking monogram.

## Product and content guardrails

The implemented copy follows these product facts:

- Product name: **Leopold**.
- Category: **Private Prize Savings**.
- Promise: **Save privately. Win privately. Withdraw anytime.**
- Leopold has four vaults: Daily, Weekly, Monthly, and Boost.
- Weekly is recommended; all four remain available.
- Saver principal is not prize funding.
- Prize reserve can come from genuine yield, sponsors, and rollover.
- Leopold provides confidentiality, not anonymity.
- Private values include balances, exact savings, exact prize weight, accepted ticket, winner, and winnings.
- Do not add decorative TVL, APY, user counts, volume, historical winners, financial performance, or similar unsupported statistics.

The protocol-facts strip contains implementation facts, not performance claims: zero privileged ticket decryptors, one shared prize pool, and 64 encrypted random bits. Its fine print states that the current Sepolia implementation and onchain state are authoritative.

## Page section order

The DOM and visual order is fixed as follows:

1. Skip link.
2. Fixed compact header.
3. Hero mosaic.
4. Editorial gateway statement and six-card feature mosaic.
5. Dark protocol map and protocol-facts panel.
6. “Built by Leopold” with three alternating image/text rows.
7. “Built for saving” with four alternating vault-cadence rows.
8. “How Leopold works” six-step process grid.
9. Single merged principle panel with two interchanging headlines.
10. Dark footer with Product, Account, Trust, and Privacy columns, a large gold monogram, and legal line.

There is intentionally no separate closing-image panel after the principle section. Two earlier principle statements were combined into one panel and now rotate in place.

## Design philosophy and visual direction

The visual direction is an editorial financial-data publication rather than a conventional rounded-card fintech dashboard. It combines:

- archival black-and-white savings and finance photography;
- cool blue-gray grading;
- near-black navigation and deep navy protocol surfaces;
- warm white and ash editorial sections;
- dotted paper textures and technical line grids;
- high-contrast Georgia headlines;
- compact monospaced system labels;
- square corners, thin rules, generous whitespace, and oversized type;
- small, deliberate motion rather than continuous decorative animation.

The interlocking Leopold monogram is intentionally different from the striped American Spend mark. It is shown as a white mark on the black/navy header and footer through a CSS filter.

## Exact color palette

The marketing scope declares these tokens on `.marketing`:

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#0a0a0a` | Header, high-contrast black surfaces |
| `--navy` | `#102540` | Primary Leopold ink and dark protocol/footer surfaces |
| `--navy-soft` | `#30435f` | Blue-gray card fallback and image undertone |
| `--paper` | `#fffef9` | Warm white editorial surface and light-on-dark text |
| `--paper-deep` | `#f2f0e9` | Ash process section and labels |
| `--mist` | `#aeb5bd` | Reserved cool gray |
| `--line` | `rgba(16, 37, 64, 0.22)` | Dividers and process grid |

Additional literal colors and opacities:

- Mega-menu muted heading: `#8d96a3`.
- Mega-menu descriptive text: `#a8b0ba`.
- Body copy on light panels: `#5e6a7c`.
- Dark-surface rules generally use white between 9% and 24% opacity.
- Dark-surface secondary copy generally uses white between 38% and 80% opacity.
- Keyboard focus ring: `#9fc4e2`, 2px with a 3px offset inside the marketing scope.

## Typography

No remote font is required. The page uses a local system stack:

| Role | Stack | Typical use |
| --- | --- | --- |
| Serif | `Georgia, "Times New Roman", serif` | Display headings, card statements, navigation, numeric facts |
| Sans | `Arial, Helvetica, sans-serif` | Paragraphs, supporting copy, input text |
| Mono | `"Courier New", Courier, monospace` | Eyebrows, section labels, CTAs, protocol notes, legal copy |

Key type behavior:

- Hero title: `clamp(62px, 6vw, 88px)`, weight 400, line-height `.99`, letter spacing `-.035em`.
- Editorial section headings: generally 42–84px through `clamp()`, Georgia weight 400, tight negative letter spacing.
- Principle headline: `clamp(58px, 5.9vw, 92px)`, line-height `.97`.
- Labels: 9–11px Courier New with `.08em`–`.19em` tracking and uppercase content.
- Body copy: 14–17px Arial with approximately 1.55–1.65 line height.
- Mobile headings use explicit sizes where stable wrapping is important: hero 48–68px, gateway 40px, protocol 43px, product 42px, process 48px, principle 50px.

## Spacing and grid system

The layout uses fluid viewport gutters plus two primary content widths:

- Standard horizontal gutter: `4.2vw` desktop.
- Wide process gutter: `8.9vw` desktop.
- Standard editorial content maximum: `1245px`.
- Wide process content maximum: `1553px`.
- Mobile horizontal gutter: `20px`.
- Fixed desktop header height: `50px`.
- Fixed mobile header height: `48px`.

Major vertical spacing:

| Section | Desktop padding/minimum | Mobile padding/minimum |
| --- | --- | --- |
| Hero | `min(100svh, 940px)`, min 720px | 760px fixed visual height |
| Gateway | 118px top / 138px bottom | 80px top / 92px bottom |
| Protocol | min 790px; 140px vertical | 92px vertical |
| Built sections | 104px top / 150px bottom | 78px top / 92px bottom |
| Process | 126px top / 68px bottom | 78px top / 62px bottom |
| Principle | min 650px; 72px vertical | min 600px; 64px vertical |
| Footer | 78px top / 30px bottom | 58px top / 26px bottom |

Grid definitions:

- Feature mosaic: three equal columns, 18px gaps, 125px implicit rows. Cards span two to four implicit rows and one or two columns.
- Protocol section: `1.15fr .9fr` with an `8vw` gap.
- Product/cadence rows: two equal columns and 470px minimum/explicit height.
- Saving process: six equal columns with vertical dividers.
- Footer: `.85fr .85fr .85fr 1.5fr`.

Square corners are intentional. Do not introduce rounded cards or pill-heavy navigation unless the design direction is explicitly changed.

## Component hierarchy

```text
HomePage
└─ LeopoldMarketingHome (client component)
   ├─ fixed site header
   │  ├─ BrandMark
   │  ├─ desktop navigation and mega menu
   │  └─ mobile toggle and mobile menu
   ├─ main
   │  ├─ hero mosaic
   │  ├─ gateway / feature cards
   │  ├─ protocol map / facts
   │  ├─ built product rows
   │  ├─ vault cadence rows
   │  │  ├─ CadenceCopy
   │  │  └─ CadenceImage
   │  ├─ saving process
   │  └─ rotating principle panel
   └─ footer / route directory / gold monogram
```

Reusable code elements:

- `BrandMark` keeps header/footer logo rendering consistent.
- `Arrow` is the shared northeast-arrow affordance.
- `CadenceCopy` and `CadenceImage` build the four vault rows.
- `heroImages`, `menuGroups`, `featureCards`, `savingCadences`, `savingSteps`, and `principleHeadlines` are data-driven editing points.
- `classes()` maps semantic class names to the CSS Module without leaking global selectors.

If the marketing page grows, extract whole sections into the same `frontend/components/marketing/` directory. Do not move marketing styling into `frontend/app/globals.css`.

## Navigation and CTA behavior

The header is fixed and always 50px/48px tall. Desktop navigation is a direct-link row containing Products, Vaults, Privacy, How it Works, Company, and Open App. The first five links target their corresponding marketing sections; Open App routes to `/app`.

At `820px` and below, desktop navigation is hidden and a two-line menu button reveals a stacked menu below the header.

Implemented route mapping:

| UI | Destination |
| --- | --- |
| Launch app | `/app` |
| Open App | `/app` |
| Start saving | `/app` |
| Explore savings | `/app` |
| Explore vault (all four vault rows) | `/app` |
| Transparency | `/transparency` |
| See the draw model | `/transparency` |
| Read the architecture | `/transparency` |
| Architecture / Security / Contracts footer links | `/transparency` |
| Editorial feature cards | In-page `#protocol` |
| Product/mission navigation | In-page section anchors |

Any future CTA whose intent is to begin using Leopold—especially “Launch App,” “Start Saving,” or “Open Leopold”—must link to `/app`, not to an in-page placeholder.

The SCROLL control uses `scrollIntoView({ behavior: "smooth" })` and moves to `#explore`. Under reduced motion the CSS animation is disabled; future changes should also avoid forcing smooth programmatic scrolling for reduced-motion users.

## Hero mosaic implementation

The hero reconstructs a single full-bleed image from **96 tiles**:

- Dimensions: **12 columns × 8 rows**.
- Desktop gap: 5px.
- Mobile gap: 4px.
- Each tile uses `background-size: 1200% 800%`.
- Column background positions advance from 0% to 100% in 9.09% increments.
- Row background positions advance from 0% to 100% in 14.28% increments.
- The same image URL and corresponding position are applied to the old image on the tile and the new image on an absolutely positioned child.

Slideshow behavior:

- Image interval: **5000ms**.
- Six images are preloaded on mount with `window.Image`.
- State keeps `previous`, `current`, and `revision` indices.
- `revision` is included in each incoming tile key so every slide change starts a fresh CSS animation.
- Images advance sequentially and wrap from the sixth image back to the first.

Tile staggering/reconstruction algorithm:

```ts
stagger = (tileIndex * 37) % 96;
delay = stagger * 7ms;
```

Because 37 and 96 are coprime, this creates a deterministic pseudo-random permutation of all 96 delay slots without duplicates. It looks randomized while remaining stable across renders and tests. Delays range from 0ms to 665ms.

Each incoming tile animates for 680ms with `cubic-bezier(.22, .61, .36, 1)`. One-based even tiles enter from `-104%` vertically and odd tiles enter from `104%`. The longest complete reconstruction is approximately 1.345 seconds after a slideshow tick.

The visual hero grading is applied per tile:

```css
grayscale(1)
sepia(.15)
hue-rotate(165deg)
saturate(.6)
brightness(.74)
contrast(1.15)
```

A bottom shade overlays the mosaic: transparent through 45%, fading to `rgba(3, 8, 14, .88)`.

## Other animation and interaction timing

| Interaction | Timing/easing |
| --- | --- |
| Hero slideshow | 5000ms interval |
| Tile entry | 680ms, `cubic-bezier(.22, .61, .36, 1)` |
| Tile delay | `(index * 37 % 96) * 7ms` |
| Principle headline change | 5000ms interval |
| Principle fade/rise | 800ms opacity ease and transform `cubic-bezier(.22, .61, .36, 1)` |
| Principle vertical offset | 28px to 0 |
| SCROLL cue pulse | 1700ms ease-in-out, infinite |
| Header underline | 180ms ease |
| Feature-card hover | 180ms ease |
| “Public” / “Publicly” strike-through | 220ms, `cubic-bezier(.22, .61, .36, 1)` |
| Protocol map scan | 7600ms ease-in-out, infinite |
| Protocol ring breathing | 7000ms and 5400ms ease-in-out, infinite |
| Protocol point drift | 4800ms ease-in-out, staggered by `index * -310ms` |
| Protocol counter tick | 105ms per reading; columns begin 160ms apart |
| Saving-step counter tick | 105ms per reading; steps begin 110ms apart |
| Editorial image tint | 200ms ease on enter and leave |
| Pixel cutout entry | 300ms ease; two cells blink for 750ms |
| Pixel cutout exit | 250ms ease |

Feature cards move upward 4px and increase contrast slightly on hover/focus. Principle actions invert from transparent/light-on-dark to warm-white/navy. Footer links brighten from muted white to warm white.

## Editorial image hover treatment

All seven image panels in “Built by Leopold” and “Built for saving” use the reusable `PixelCutouts` overlay. Fine-pointer hover applies a slightly cooler, darker grade and generates eight unique cells from a 10-column × 6-row grid. Every cell is 10% wide and 16.6667% high; a Fisher–Yates shuffle selects the cells without duplicates on each entry. Delays are randomized from 30ms through 581ms. Six cells fade in over 300ms, two use a 750ms blink sequence, and all cells fade out over 250ms when the pointer leaves.

The cutouts reveal the page's warm paper and dotted texture, creating the large disappearing-pixel effect without altering the source image. The tint layer uses Leopold navy with `mix-blend-mode: color` at `.28` opacity. Reduced-motion users retain the static hover tint but do not generate transient cutout tiles.

## Protocol panel motion

The left protocol diagram stays visually quiet but alive: a low-opacity blue-gray scan passes across the plotting area every 7600ms, the two rings breathe at different periods, and the twelve plotted points drift and brighten on staggered phases. The geometry and labels do not change position, so the diagram remains legible while moving.

The facts strip animates once when 35% of the protocol section enters the viewport. Each column runs through an authored eight-reading sequence at 105ms per reading, with 160ms between column starts, then settles permanently at the truthful values `0`, `1`, and `64`. The transient readings are hidden from assistive technology; the strip retains its stable descriptive label. The effect does not replay when the user scrolls away and back.

Reduced-motion users receive the final values immediately. The IntersectionObserver is not started and the global motion override suppresses all map animation.

## Saving-process counter motion

The six process numbers are large Georgia numerals (`clamp(38px, 3.2vw, 52px)`, 46px on mobile) with tabular figures. When 30% of the saving-process section enters the viewport, each number runs once through an authored eight-reading, two-digit sequence at 105ms per reading. Step starts are staggered by 110ms and settle permanently at `01` through `06`. The shared `AnimatedCounter` component also drives the protocol facts, so both effects use the same blur/fade/rise tick treatment.

The transient process readings are hidden from assistive technology. Each item includes a stable visually hidden “Step N” label, and reduced-motion users receive the final zero-padded values immediately without an observer or transient updates.

## Editorial word effects

`StyledWords` is the reusable inline-text renderer for the marketing page. It preserves the original sentence for assistive technology while wrapping only authored keywords:

- Every case-insensitive whole-word occurrence of `public` or `publicly` receives the `public-word` class. Hovering the word draws a muted-gold line from left to right across its center in 220ms. The line is implemented with a pseudo-element, so the word is not semantically presented as deleted text when it is idle.
- Selected product-truth words receive `accent-word`: Private, Deposit, Winner, Yield, Encrypted, Withdraw, Compound, Zama, Verifiable, Provable, and Yours where explicitly passed by the surrounding section.
- The accent token is `--accent-yellow: #c0a464`. It is intentionally a desaturated parchment gold rather than a saturated brand yellow, so it remains compatible with the blue-gray photographic grade.
- Body paragraphs are not highlighted by default. Keyword lists are authored per heading or feature card to keep emphasis selective.
- The strike animation inherits the global reduced-motion override and therefore resolves in `.01ms` for reduced-motion users.

## Principle headline transition

The principle section contains exactly one panel and two overlapping headline spans:

1. `Saving should be private by default.`
2. `Saving should be private. Winning should be provable. Yield should stay yours.`

The spans occupy the same CSS Grid cell. The active span fades to full opacity and translates to zero; the inactive span fades out and moves down 28px. State changes every 5000ms. A visually hidden live-region copy exposes only the current headline to assistive technology, avoiding two simultaneously announced visible strings.

## Image-to-section mapping and treatment

All runtime images are local. No image is loaded from the Sites host, Pexels, Unsplash, or any other remote origin.

| Asset | Dimensions | Implemented use |
| --- | ---: | --- |
| `leopold-hero.webp` | 1536×1024 | Hero slideshow frame 1 |
| `leopold-savings-ledger.webp` | 1536×1024 | Hero frame 2; Private by Default card; feature fallback |
| `leopold-secure-savings.webp` | 1536×1024 | Hero frame 3; Withdraw Anytime card; confidential-savings row |
| `leopold-investment-growth.webp` | 1536×1024 | Hero frame 4; Prize Yield and Built on Zama cards; yield row |
| `leopold-investment-review.webp` | 1536×1024 | Hero frame 5; Compound III card; rotating principle background |
| `leopold-fair-draw.webp` | 1536×1024 | Hero frame 6; Encrypted Draw card; verifiable-draw row |
| `leopold-daily.webp` | 1800×2400 | Daily vault row |
| `leopold-weekly.webp` | 1800×2397 | Weekly vault row |
| `leopold-monthly.webp` | 1800×2411 | Monthly vault row |
| `leopold-boost.webp` | 1800×1200 | Boost vault row |
| `leopold-monogram.png` | 512×512 | Header/footer brand mark and page icon |
| `leopold-og.png` | 1200×630 | Open Graph image |
| `leopold-principle.webp` | 2200×1650 | Preserved source asset from the current Sites project; intentionally not rendered in this snapshot |

`frontend/app/icon.png` is an exact copy of `frontend/public/marketing/leopold/leopold-monogram.png`. The duplicate is intentional: Next.js file-based metadata gives the app icon a stable route while the public copy remains available to header and footer components.

Feature-card treatment:

- A navy gradient overlay darkens images from top to bottom.
- Base photograph filter: `grayscale(1) sepia(.2) hue-rotate(166deg) saturate(.45) contrast(.95)`.
- Per-card background positions preserve the authored crops.
- Prize Yield is intentionally image-backed, not flat charcoal.
- Compound III adds 35px horizontal and vertical linework over the photograph.

Product-row treatment:

```css
grayscale(1)
sepia(.22)
hue-rotate(168deg)
saturate(.5)
contrast(.93)
```

The draw row also receives 6–7px horizontal scan lines. Cadence images inherit the row filter and use `object-fit: cover`; vertical crop positions are Daily 38%, Weekly 48%, Monthly 44%, and Boost 42%.

Principle treatment:

```css
grayscale(1)
sepia(.3)
hue-rotate(170deg)
saturate(.45)
contrast(1.1)
opacity(.82)
```

It also uses a navy gradient and a 4px dotted overlay.

## Asset provenance and replacement policy

The six 1536×1024 hero/feature photographs, monogram, and Open Graph image are project-local assets transferred directly from the user’s current Sites project. They have no runtime dependence on Sites. The original Sites checkout did not include separate third-party URLs for those project-generated assets.

The cadence and archived principle stock-photo sources recorded by the Sites project are:

- `leopold-daily.webp` — Mikhail Nilov, Pexels: <https://www.pexels.com/photo/person-holding-a-smartphone-and-a-credit-card-7534791/>
- `leopold-weekly.webp` — Fer ID, Pexels: <https://www.pexels.com/photo/vintage-security-deposit-boxes-with-keys-33588626/>
- `leopold-monthly.webp` — Mikhail Nilov, Pexels: <https://www.pexels.com/photo/a-couple-doing-computations-on-paper-7735718/>
- `leopold-boost.webp` — RDNE Stock project, Pexels: <https://www.pexels.com/photo/man-in-white-long-sleeve-shirt-holding-black-smartphone-and-credit-card-7821899/>
- `leopold-principle.webp` — Unsplash bank-vault search source recorded by Sites: <https://unsplash.com/s/photos/bank-vault>

If an image is replaced:

1. Store the optimized file in `frontend/public/marketing/leopold/`.
2. Prefer WebP for photography and PNG/SVG only when transparency or vector fidelity requires it.
3. Update the appropriate data array or CSS `url()`.
4. Preserve the image’s authored aspect/crop behavior.
5. Update this mapping and record source/license information.
6. Never hotlink an image when a repository-local asset can be used.

## Responsive behavior

The authored breakpoint is `max-width: 820px`.

At 820px and below:

- Header height reduces from 50px to 48px.
- Desktop navigation and mega menu are replaced by the two-line mobile menu button.
- Hero becomes 760px tall and retains the 12×8 tile grid with 4px gaps.
- Hero copy moves to 20px side gutters and the SCROLL cue is hidden.
- Gateway title becomes left aligned.
- Feature mosaic becomes a single column; every card is at least 370px tall.
- Protocol map and copy stack vertically.
- Protocol facts change from three columns to three divided rows.
- Alternating product and cadence rows become image-first vertical stacks.
- Right-image product rows are explicitly reordered so the image still appears before copy.
- Product image areas are at least 340px tall and copy areas at least 430px.
- The six-step process becomes six full-width divided rows.
- Principle buttons become a vertical stack.
- Footer becomes a two-column information grid; the gold monogram spans both columns; brand line and legal line stack.

The page has a 320px minimum width and uses fluid type between mobile and large desktop sizes.

## Hover, focus, and accessible interaction states

- A “Skip to content” link moves onscreen when focused and targets `#marketing-main`.
- All marketing links, buttons, and inputs receive the blue focus ring described in the palette section.
- Header menu buttons expose `aria-expanded`.
- Mobile menu button exposes its expanded state and a descriptive label.
- Decorative hero tiles, protocol map, and arrow glyphs are hidden from assistive technology.
- Photographic content uses either meaningful `alt` text or `role="img"` plus `aria-label`.
- The rotating principle uses a polite live region and hides the overlapping visual copies from accessibility APIs.
- Newsletter submission is deliberately local presentation state. It does not send or persist the entered email. Success copy is a status message.

## Reduced-motion behavior

Two layers enforce reduced motion:

1. Both JavaScript intervals check `prefers-reduced-motion: reduce` before starting. Reduced-motion users keep the initial hero image and initial principle statement.
2. The CSS media query reduces animation and transition duration to `.01ms` and limits animations to one iteration throughout the marketing scope.

Any new carousel, parallax, smooth-scroll, or autoplay behavior must use the same preference. Do not rely only on shortened CSS animation if JavaScript continues changing content.

## Intentional visual decisions that are easy to miss

- The header is deliberately compact; enlarging it changes every hero inset and should be updated consistently in `.hero-tiles` and `.hero-shade`.
- The hero is a real 96-tile reconstruction, not a single image with a grid overlay.
- Tile order looks random but is deterministic to prevent hydration differences and flaky tests.
- The hero shows the old frame behind each incoming tile, avoiding empty gaps during reconstruction.
- The warm white is `#fffef9`, not pure `#ffffff`.
- Dot textures use 4px repetition and very low-opacity navy; they are intended to read as printed paper at normal scale.
- Photo color is created with CSS filters. The repository assets remain reusable source images and are not pre-baked to the final navy grade.
- The Daily/Weekly/Monthly/Boost rows deliberately use the same 50/50 system as the three product rows.
- Weekly is identified as “RECOMMENDED” without hiding or disabling the other vaults.
- Prize Yield and Compound III cards deliberately retain image backgrounds after the later design correction.
- The principle section intentionally reuses `leopold-investment-review.webp`, which was the selected image from the removed neighboring panel.
- The two principle statements rotate inside one panel to avoid duplicate adjacent sections.
- The footer monogram is an exact `--accent-yellow` mask of the local Leopold mark; it intentionally contains no adjacent copy or form controls.
- The marketing component runs inside the existing root `Providers` wrapper. The provider hierarchy was not rewritten or bypassed.

## Safe editing checklist

Before changing this page:

1. Keep marketing code under `frontend/components/marketing/` and assets under `frontend/public/marketing/leopold/`.
2. Preserve `/app` and all authenticated route files unless a separate authenticated-UI task explicitly authorizes changes.
3. Do not import Dynamic, Wagmi, Zama, contract actions, raw contract reads, or financial providers into marketing components.
4. When authenticated presentation work is later authorized, consume `useLeopoldUiController()` from `frontend/components/leopold-ui-controller.tsx` rather than bypassing the facade.
5. Route all enter-the-product CTAs to `/app`.
6. Keep product claims within the guardrails above.
7. Add source/license notes for every new photograph.
8. Test pointer, keyboard, mobile menu, reduced motion, all internal anchors, `/app`, and `/transparency`.
9. Run from `frontend/`: `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` with the repository-pinned Node and pnpm versions.
10. Check that `/login`, `/onboarding`, `/app`, all `/app/*` pages, `/transparency`, and `/ops` still build and route.

## Current route inventory preserved by the integration

- `/`
- `/app`
- `/login`
- `/onboarding`
- `/app/vaults`
- `/app/vaults/[vault]`
- `/app/prizes`
- `/app/activity`
- `/app/rewards`
- `/app/profile`
- `/app/help`
- `/transparency`
- `/ops`

The repository also retains its existing privacy, terms, health, probe, and E2E support routes. This design import does not remove or redirect them.
