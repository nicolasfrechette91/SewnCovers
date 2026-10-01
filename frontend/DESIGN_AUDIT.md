# Design audit and direction: "The Cutting Table"

This document records the visual audit of the SewnCovers frontend. It also sets out the design direction chosen to replace the starter look.

The audit is based on:
- the static export served under `/SewnCovers/`, reviewed at 375, 768 and 1440 px on every route and configurator stage;
- the components, `app/globals.css`, and the unit and e2e suites that constrain markup.

## 1. Audit

### What felt generic or inconsistent

**Typography**
- Every build shipped Arial. `next/font/google` was mocked to empty CSS by `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` in CI, deploy and e2e, so Geist never loaded.
- Display type was the same sans as body text, so there was no typographic contrast.
- The site did not match its own social card (`public/social-preview.jpg`), which uses a serif wordmark, forest and terracotta on linen, and dashed measuring lines.
- Only two heading sizes were tokenized (page and section). Off-token `text-xl` and `sm:text-lg` appeared on the home page.
- `text-card-title` was used but never defined.
- Data values (prices, order references, project names) were styled at page-title size, which flattened the hierarchy.
- Eyebrows came in four styles: uppercase, tracked, plain, and `.landing-eyebrow`.

**Colour semantics**
- The palette itself was good; how it was applied was the problem.
- Prototype and sandbox disclaimers reused the error palette. For example, the cart's "Sandbox demonstration" banner read as a failure.
- Warning, error and accent all came from one terracotta family.
- Fabric artwork was drawn with UI tokens (`--color-brand`, `--color-accent-strong`), so any theme change would recolour the fabrics.
- `rgb()` literals appeared in the preview CSS, and hex values were duplicated in `site.webmanifest`.

**Spacing and layout**
- The semantic spacing scale was sound, but ad-hoc numeric utilities (`mt-2`, `mt-3`, `p-3`, `p-4`) dominated.
- Page widths (`6xl`, `4xl`, `3xl`) changed with no rule.
- On mobile, the configurator's step indicator stacked six cards (about 300 px) before any content.
- On mobile, the five shape cards were one per row, about 1,800 px of scrolling.
- In Cover details, the closure and edge-finish groups were squeezed side by side, so "Open-ended slip-on" wrapped to four lines at 1440 px.

**Hierarchy**
- Configurator heading levels drifted: three stages used a `legend` as their only heading, with h3/h4 jumps below.
- The Back/Continue stage bar outweighed the stage content.
- The disabled primary button (beige) looked like the secondary button.

**Buttons and links**
- There was no link-button primitive. More than ten hand-written link-button class strings existed, many without hover, active or transition states.
- One text-link string was repeated 15 times.
- There was no quiet (ghost) button variant.

**Cards**
- There were 44 hand-rolled panels and 61 hand-rolled insets, and emphasis used ad-hoc `border-2` variants.
- Cards nested inside cards (panel, then inset, then card) felt boxy; the Pattern stage was the worst case.
- The "Available" status pill looked like a button, a false affordance.
- Selected states were weak. Pattern cards only gained a 1 px border change; shape cards changed little beyond the radio.

**Forms**
- `NumberInput` and `UnitSelector` were used once each.
- 34 raw inputs used three different hand-written field styles.
- Measurement inputs had no unit adornment.

**Empty and loading states**
- Loading states were plain spinner lines.
- Empty states were generic centred cards.
- "Loading this configuration stage…" appeared as bare text.

**Bugs found along the way**
- In `components/projects/configuration-readonly.tsx`, built-in swatches used `pattern-${id}` class names, which don't exist for `prototype-*` ids, and omitted the base `.prototype-pattern` class.
- `ErrorMessage title=` rendered only as a tooltip.
- The starter SVGs in `public/` are unused. This is noted but out of scope.

### What already worked, and stays
- The linen, forest and terracotta palette with its documented AA contrast, and the CSS-first tokens in Tailwind v4 `@theme`.
- The accessibility foundation: skip link, focus-ring token, forced-colours rules, reduced-motion handling, 44 px targets, labelled landmarks, live-region stage announcements, and a print stylesheet.
- CSS-only illustrations and pattern artwork scaled by `--pattern-scale`, which cost no image weight.
- Inline-SVG shape icons and measurement diagrams, which are already on-theme.
- Honest disclaimer copy everywhere.
- The configurator's structure: lazily loaded stages, gating with explanatory help text, and edit-back links.

**Scope note:** the app has no fabric grain or orientation control. "Fabric direction" appears only in home-page copy. In the configurator it corresponds to the **Cover details** stage ("Material direction") and the **Pattern** stage (colour or pattern, plus scale). The redesign improves those stages without adding controls.

## 2. Direction: "The Cutting Table"

The direction is a tailor's workroom, laid out like a clean editorial spread.

### Principles
1. **Soft objects, precise frames.** Cushions and fabric stay soft and rounded. The UI chrome is crisp: small radii, hairlines and mono measurements.
2. **Measure, then make.** Numbers read like a tape measure: mono, tabular figures, ruler ticks and dimension lines.
3. **Stitch, don't box.** Dashed stitch lines and hairline seams separate content instead of cards nested inside cards.
4. **Labels tell the truth.** Prototype and sandbox notices look like woven care labels in a brass "tag" tone. They are calm, distinct and always visible. Red is reserved for real errors.
5. **Texture as seasoning.** Linen crosshatch and cutting-mat grids appear only in the hero, the preview stage, the measurement guide and the call-to-action band, at 3–6 % opacity.

### Type
All three families are self-hosted woff2 files in `app/fonts/`, loaded with `next/font/local`. They are licensed under OFL 1.1; see `app/fonts/OFL.txt`.

| Role | Face | Use |
|---|---|---|
| Display | Fraunces (variable weight and optical size, latin subset) | h1, h2, card titles, prices, wordmark |
| UI and body | Geist (variable, latin) | Everything else |
| Measure | Geist Mono (variable, latin, not preloaded) | Measurement readouts, units, eyebrows, step numbers, hex values; tabular figures |

| Token | Size / line height |
|---|---|
| `display` | clamp(2.5rem, 1.6rem + 3.6vw, 4.5rem) / 1.02 |
| `page-title` | clamp(2.125rem, 1.6rem + 2vw, 3.25rem) / 1.05 |
| `section-title` | clamp(1.5rem, 1.25rem + 0.9vw, 2.125rem) / 1.15 |
| `card-title` | 1.25rem / 1.3 |
| `subhead` | 1.0625rem / 1.4 |
| `lede` | 1.125rem / 1.6 |
| `body` | 1rem / 1.6 |
| `supporting` | 0.875rem / 1.5 |
| `label` | 0.875rem / 1.25 |
| `button` | 0.9375rem / 1.25 |
| `eyebrow` | 0.75rem mono, uppercase, 0.08em tracking |
| `readout` | 1.0625rem mono, tabular |

Form inputs always stay at 16 px or larger.

### Colour (light, shipped)
Semantic tokens stay as 6-digit hex because `e2e/accessibility-validation.spec.ts` parses them. The ratios below use that test's WCAG formula.

| Token | Hex | Contrast |
|---|---|---|
| page | `#F6F1E7` | ink 13.49:1 |
| surface | `#FFFCF6` | ink 14.83:1 |
| surface-subtle | `#EDE4D3` | ink 12.03:1 |
| text-primary (ink) | `#1E2823` | — |
| text-muted | `#555E57` | page 5.97, surface 6.56, subtle 5.32 |
| brand (loden forest) | `#24513B` | surface 8.86; on-brand `#FFFCF6` 8.86 |
| brand-hover / active | `#1D432F` / `#173626` | — |
| accent (thread terracotta) | `#B4583A` | surface 4.66 |
| accent-strong | `#94432D` | surface 6.62, page 6.02 |
| measure (tape brass, decorative) | `#B8872B` | surface 3.14 |
| border / border-strong | `#DCCFBA` / `#8C7D67` | border-strong: surface 3.91, page 3.56 |
| focus | `#B4472A` | surface 5.29, page 4.81 |
| notice surface / border / text | `#F3E6C8` / `#A87B22` / `#6B4E12` | text 6.23, border 3.07 |
| error surface / border / text | `#FAE8E4` / `#A63A32` / `#86261F` | text 7.67, border 5.42 |

**Fabric "dye" tokens** (`--dye-*`) colour the pattern artwork independently of the UI theme. A future theme cannot recolour a fabric preview.

### Colour (dark, deferred)
Dark mode is token-ready but not shipped. The layered tokens mean a future `prefers-color-scheme: dark` block only needs to override the semantic colour tokens below. For now `:root` declares `color-scheme: light`.

| Token | Hex | Contrast |
|---|---|---|
| page / surface / surface-subtle | `#121815` / `#1A221E` / `#232D28` | ink 14.62 / 13.22 / 11.55 |
| text-primary / text-muted | `#EEE7D9` / `#B2AB9C` | muted: surface 7.12, subtle 6.23 |
| brand / on-brand | `#8CC4A4` / `#0E2218` | brand on surface 8.17; on-brand 8.37 |
| accent-strong | `#E9A085` | surface 7.61 |
| border-strong / focus | `#7A867E` / `#F0A07F` | 4.29 / 7.77 |
| notice surface / border / text | `#352B17` / `#C99B45` / `#EACB8A` | text 8.88, border 5.47 |
| error surface / border / text | `#3A1C1A` / `#E57A6E` / `#F6BDB3` | text 9.44, border 5.39 |

### Spacing, containers, radius, shadow
- **Spacing:** the semantic tokens are kept (`icon`, `control-x/y`, `component`, `card`, `gutter`, `layout`, `section`) on a 4 px "tape" ladder of 4, 8, 12, 16, 24, 32, 48, 64 and 96.
- **Containers:** `page` (72rem) for workspaces, `content` (56rem) for forms and account screens, `reading` (48rem) for legal copy.
- **Radius:** `control-small` 4 px, `control` 6 px, `card` 8 px, `panel` 12 px, and `pill`. Fabric illustrations keep their soft corners.
- **Shadows:** flat, like pressed paper:
  - `hairline`;
  - `card`;
  - `raised`, for hover and selected lift only;
  - `overlay`;
  - `focus`, a 2 px surface gap plus a 3 px ring;
  - `selected`, an inset 2 px brand ring, so selection never shifts layout.

### Textile details, used sparingly
- A stitch divider: a dashed 6/4 line.
- A dashed "basting stitch" inner outline on selected option cards.
- Ruler ticks under page-header eyebrows and along the stage progress track.
- A pinked (zig-zag) edge on pattern swatch media.
- A cutting-mat grid behind the measurement guide and the preview stage.
- Dimension lines around the hero illustration.

### Motion
- **Timing:**
  - `--duration-fast` (120 ms) for colour and hover changes;
  - `--duration-base` (180 ms) for selection and borders;
  - `--duration-slow` (280 ms) for reveals;
  - `--ease-standard` is `cubic-bezier(0.2, 0, 0, 1)`.
- **What animates:** only colour, opacity, transform, border and shadow, never layout. Buttons press to a darker fill with a flatter shadow (no movement, so adjacent actions never misalign). Selections fade in their stitch outline. A new configurator stage fades up 6 px.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, a global guard removes all transitions and animations.

## 3. Constraints honoured
- Routes, copy, headings, accessible names and landmark labels are unchanged. So are the class hooks and `data-*` attributes the tests use: `.landing-*`, `.shape-option-*`, `.cover-option-*`, `.pattern-card-*`, `.pattern-filter-*`, `.unit-selector-*`, `.cushion-preview-*`, `.prototype-notice`, `.print-hidden`, and `#site-navigation-menu`, which still toggles `hidden`/`block`.
- The cushion preview SVG internals are frozen by tests and are not restyled.
- Targets are at least 44 px, input text at least 16 px, and adjacent buttons at least 8 px apart. There is no horizontal overflow from 320 px up. Every new visual state has a forced-colours equivalent.
- Fonts are self-hosted and served under the `/SewnCovers` base path. There are no new runtime dependencies.

## 4. Changes after the redesign

### Interactive 3D preview removed
- The optional WebGL "Approximate interactive 3D preview" is gone: `components/configurator/advanced-preview.tsx`, its lazy loader, the "Load approximate 3D preview" and "Expanded controls" entry points, and their unit and e2e tests. The 2D cushion preview is now the only preview on the Preview and Review stages. A photo-based mockup is planned as a separate follow-up; no placeholder ships for it.
- The design-token guard (`tests/design-tokens.test.ts`) never needed an allowlist entry for `advanced-preview.tsx`, because its colours were WebGL float triples rather than hex literals. The allowlist is unchanged: `cushion-model.tsx` and `pattern-step.tsx`.
- The Preview stage layout was rebalanced for the single preview:
  - The visual and its spec list share one column. From a 48rem container up it sits beside the pattern-size control, the notes and the edit actions, and it is sticky.
  - From a 64rem container the split is 7:5, which gives the cushion more room.
  - The spec list shows two columns on phones, and three once its column is 36rem wide.
  - The edit actions stack at full width on phones.
  - The "Illustrative preview only" care label is now the figure caption, spanning the full width below both columns.
  - DOM order, and so tab order, is unchanged.
- The Legal accessibility statement no longer describes a WebGL canvas or GPU testing.

### A silhouette for each cushion shape
- The live preview drew one rectangular pillow for every shape. Each of the five shapes now has its own outline, based on its shape-card icon and drawn in the same soft style: highlight, edge shading, contact shadow, dotted inset seam, and piping when Piped edge is selected.
- Proportions follow the entered measurements within clamps that keep extreme values legible. Box / bench cushions and thick round cushions show a side band, darkened with the new `--shade-band-front` and `--shade-band-side` tokens. The crease where the face meets the band uses `--shade-crease`. All three have forced-colours equivalents.
- The Tapered / trapezoid icon and measurement diagram were flipped, so the icon, diagram and preview all put the wider front edge at the bottom.

### Guest-first sign-in
The whole design journey (home, every Configure stage, preview, review, public links, print and download) works as a guest with no sign-in prompt. An account is asked for only at an account-only action, in place, and never at the cost of the design.

- **Where sign-in is asked for.** Only at *Save to a private project*, *Save and add to cart*, *Upload your own pattern* and a private project version link. Each opens an inline step (`components/account/inline-sign-in.tsx`) that explains why the action needs an account, offers Sign in or Create account with the same form as `/account` (`components/account/auth-form.tsx`), and has a way to continue as a guest. Nothing navigates, so nothing on screen can be lost. After sign-in the pending action resumes exactly once; the pending record is removed as it is read.
- **What stays account-only.** The API requires an account for projects, uploads, quotes, the cart, checkout and orders, and has no guest cart or guest checkout. The cart, orders and quote workspace show a calm guest empty state (`components/account/guest-empty-state.tsx`) instead of a sign-in wall. The checkout return page and Administration keep their sign-in prompts, because they are reached only with an account.
- **Header.** Guests see a quiet *Sign in* link, styled like the other items, that returns to the current page through the allowlisted `returnTo` targets. A stored or verified session shows *Account*. `/account` returns with a client-side navigation, so an in-memory design survives even without storage. The configurator then restores the same stage, focuses it and announces it.
- **Draft in the browser.** `services/configurator-draft.ts` keeps the design, stage and furthest stage in local storage (`sewncovers.configurator-draft`). Every access is guarded: blocked, full or empty storage falls back to memory for the page session. The draft never holds a sign-in token; the token stays in session storage. A draft saved to a project is linked to it, so further edits save as a new version and saving again never creates a duplicate project. The cart never gets the same saved version twice. Signing out removes linked drafts, pending actions and private custom patterns; a never-saved guest draft stays.
- **Links never destroy a draft.** A shared or project link that would overwrite an unsaved design asks first (*Keep your unsaved design?*). An untouched copy of a link, a design saved to a project, or the design's own public link opens straight away.
- **Performance.** Restoring, link comparison, validation of stored drafts and the related notices load from `components/configurator/draft-session.tsx`, which is requested when the configurator module loads and is outside the first-load chunks.
- **Privacy copy.** The Legal privacy notice and retention table describe the browser-stored draft.
