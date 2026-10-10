# Design system: "The Cutting Table"

The visual direction of the SewnCovers frontend: a tailor's workroom laid out like a clean editorial spread. This page records the audit that motivated it, the principles and tokens that came out of it, and how the system is applied and enforced in code.

- **Source of truth:** [`frontend/app/globals.css`](../frontend/app/globals.css) (tokens, textile details, accessibility rules, print rules).
- **Enforced by:** [`frontend/tests/design-tokens.test.ts`](../frontend/tests/design-tokens.test.ts), which fails when components use Tailwind's default scales, arbitrary colours or `rgb()` literals; [`frontend/tests/design-system-guard.test.ts`](../frontend/tests/design-system-guard.test.ts), which fails when a screen builds a form control, description list or panel by hand, uses a hex literal, an off-ladder spacing step or `max-w-3xl`; and [`frontend/e2e/accessibility-validation.spec.ts`](../frontend/e2e/accessibility-validation.spec.ts), which derives its contrast ratios from the computed CSS variables.

The audit was based on the static export reviewed at 375, 768 and 1440 px on every route and configurator stage, plus the components, `globals.css` and the unit and browser suites that constrain markup.

## 1. Audit (before the redesign)

### What felt generic or inconsistent

**Typography**
- Every build shipped Arial. `next/font/google` was mocked to empty CSS in CI, deploy and e2e builds, so Geist never loaded.
- Display type was the same sans as body text, so there was no typographic contrast.
- The site did not match its own social card (`frontend/public/social-preview.jpg`), which uses a serif wordmark, forest and terracotta on linen, and dashed measuring lines.
- Only two heading sizes were tokenised (page and section). Off-token `text-xl` and `sm:text-lg` appeared on the home page, and `text-card-title` was used but never defined.
- Data values (prices, order references, project names) were styled at page-title size, which flattened the hierarchy.
- Eyebrows came in four styles: uppercase, tracked, plain, and `.landing-eyebrow`.

**Colour semantics**
- The palette itself was good; how it was applied was the problem.
- Prototype and sandbox disclaimers reused the error palette, so the cart's "Sandbox demonstration" banner read as a failure.
- Warning, error and accent all came from one terracotta family.
- Fabric artwork was drawn with UI tokens (`--color-brand`, `--color-accent-strong`), so any theme change would have recoloured the fabrics.
- `rgb()` literals appeared in the preview CSS, and hex values were duplicated in `site.webmanifest`.

**Spacing and layout**
- The semantic spacing scale was sound, but ad-hoc numeric utilities (`mt-2`, `mt-3`, `p-3`, `p-4`) dominated.
- Page widths (`6xl`, `4xl`, `3xl`) changed with no rule.
- On mobile, the configurator's step indicator stacked six cards (about 300 px) before any content, and the five shape cards were one per row, about 1,800 px of scrolling.
- In Cover details, the closure and edge-finish groups were squeezed side by side, so "Open-ended slip-on" wrapped to four lines at 1440 px.

**Hierarchy**
- Configurator heading levels drifted: three stages used a `legend` as their only heading, with h3/h4 jumps below.
- The Back/Continue stage bar outweighed the stage content.
- The disabled primary button (beige) looked like the secondary button.

**Buttons, links and cards**
- There was no link-button primitive. More than ten hand-written link-button class strings existed, many without hover, active or transition states; one text-link string was repeated 15 times; there was no quiet (ghost) variant.
- There were 44 hand-rolled panels and 61 hand-rolled insets, and emphasis used ad-hoc `border-2` variants.
- Cards nested inside cards (panel, inset, card) felt boxy; the Pattern stage was the worst case.
- The "Available" status pill looked like a button, a false affordance.
- Selected states were weak: pattern cards only gained a 1 px border change.

**Forms, empty and loading states**
- `NumberInput` and `UnitSelector` were used once each; 34 raw inputs used three different hand-written field styles; measurement inputs had no unit adornment.
- Loading states were plain spinner lines, and empty states were generic centred cards.

**Bugs found along the way**
- In `components/projects/configuration-readonly.tsx`, built-in swatches used `pattern-${id}` class names, which don't exist for `prototype-*` ids, and omitted the base `.prototype-pattern` class.
- `ErrorMessage` accepts `heading`, not `title`; a `title=` prop only rendered as a tooltip.

### What already worked, and stayed

- The linen, forest and terracotta palette with its documented AA contrast, and CSS-first tokens in Tailwind v4 `@theme`.
- The accessibility foundation: skip link, focus-ring token, forced-colours rules, reduced-motion handling, 44 px targets, labelled landmarks, live-region stage announcements and a print stylesheet.
- CSS-only illustrations and pattern artwork scaled by `--pattern-scale`, which cost no image weight.
- Inline-SVG shape icons and measurement diagrams, already on-theme.
- Honest disclaimer copy everywhere.
- The configurator's structure: lazily loaded stages, gating with explanatory help text, and edit-back links.

The app has no fabric grain or orientation control. In the configurator, "fabric" corresponds to the **Cover details** stage (material, fit, closure, seam) and the **Pattern** stage (colour or pattern, plus scale).

## 2. Direction

### Principles

1. **Soft objects, precise frames.** Cushions and fabric stay soft and rounded. The UI chrome is crisp: small radii, hairlines and mono measurements.
2. **Measure, then make.** Numbers read like a tape measure: mono, tabular figures, ruler ticks and dimension lines.
3. **Stitch, don't box.** Dashed stitch lines and hairline seams separate content instead of cards nested inside cards.
4. **Labels tell the truth.** Prototype and sandbox notices look like woven care labels in a brass "tag" tone: calm, distinct and always visible. Red is reserved for real errors.
5. **Texture as seasoning.** Linen crosshatch and cutting-mat grids appear only in the hero, the preview stage, the measurement guide and the call-to-action band, at 3 to 6 percent opacity.

### Type

All three families are self-hosted variable woff2 files in `frontend/app/fonts/`, loaded with `next/font/local` and licensed under the SIL OFL 1.1 (licence texts sit beside the fonts). Builds need no network access for fonts, and the files are served from `/_next/static/media` behind the GitHub Pages base path.

| Role | Face | Use |
| --- | --- | --- |
| Display | Fraunces (variable weight and optical size, latin subset) | h1, h2, card titles, prices, wordmark |
| UI and body | Geist (variable, latin) | Everything else |
| Measure | Geist Mono (variable, latin, not preloaded) | Measurement readouts, units, eyebrows, step numbers, hex values; tabular figures |

| Token | Size / line height |
| --- | --- |
| `display` | clamp(2.375rem, 1.6rem + 2.4vw, 3.75rem) / 1.04 |
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

The scale is deliberately not coupled to heading level. Form inputs always stay at 16 px or larger.

### Colour (light, shipped)

Semantic tokens stay as 6-digit hex because `e2e/accessibility-validation.spec.ts` parses them. The ratios below use that test's WCAG formula.

| Token | Hex | Contrast |
| --- | --- | --- |
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
| success surface / border / text | `#E7EFE8` / `#24513B` / `#1D432F` | text 9.45, border 7.74 |

**Fabric "dye" tokens** (`--dye-*`) colour the pattern artwork independently of the UI theme, so a future theme cannot recolour a fabric preview. Cushion shading uses its own `--shade-*` tokens: the weave, fold, seam, edge, band and crease strokes, and the eight cloth, sheen and shadow colours (`--shade-cloth-*`, `--shade-sheen`, `--shade-glint`, `--shade-penumbra`, `--shade-umbra`, `--shade-cast`) that the preview's SVG gradients use. No hex literal remains in `cushion-model.tsx`.

### Colour (dark, deferred)

Dark mode is token-ready but not shipped; `:root` declares `color-scheme: light`. The layered tokens mean a future `prefers-color-scheme: dark` block only has to override the semantic colour tokens below.

| Token | Hex | Contrast |
| --- | --- | --- |
| page / surface / surface-subtle | `#121815` / `#1A221E` / `#232D28` | ink 14.62 / 13.22 / 11.55 |
| text-primary / text-muted | `#EEE7D9` / `#B2AB9C` | muted: surface 7.12, subtle 6.23 |
| brand / on-brand | `#8CC4A4` / `#0E2218` | brand on surface 8.17; on-brand 8.37 |
| accent-strong | `#E9A085` | surface 7.61 |
| border-strong / focus | `#7A867E` / `#F0A07F` | 4.29 / 7.77 |
| notice surface / border / text | `#352B17` / `#C99B45` / `#EACB8A` | text 8.88, border 5.47 |
| error surface / border / text | `#3A1C1A` / `#E57A6E` / `#F6BDB3` | text 9.44, border 5.39 |

### Spacing, containers, radius, shadow

- **Spacing:** Tailwind's 4 px base plus named steps (`nudge`, `icon`, `control-x/y`, `component`, `card`, `gutter`, `layout`, `section`) on a 4 px "tape" ladder of 4, 8, 12, 16, 20, 24, 32, 48, 64 and 96. For padding, margins and gaps that means the Tailwind steps 1, 2, 3, 4, 5, 6, 8, 12, 16 and 24 (and 0). `nudge` (2 px, `mt-nudge`) is the one sub-step: it lines a checkbox, radio or indicator up with the first line of text beside it. Half steps such as `mt-0.5` and `py-2.5` are not used.
- **Containers:** `page` (72rem) for workspaces, `content` (56rem) for forms and account screens, `reading` (48rem) for legal copy and for the measure of body copy, headings and ledes (`max-w-reading`, never `max-w-3xl`).
- **Radius:** `control-small` 4 px, `control` 6 px, `card` 8 px, `panel` 12 px, and `pill`. Fabric illustrations keep their soft corners.
- **Shadows:** flat, like pressed paper: `hairline`, `card`, `raised` (hover and selected lift only), `focus` (a 2 px surface gap plus a 3 px ring), `selected` (an inset 2 px brand ring, so selection never shifts layout) and `current`. There is no overlay shadow yet; add one with the first overlay that needs it.

### Textile details, used sparingly

- A stitch divider: a dashed 6/4 line (`stitch-rule`).
- A dashed "basting stitch" inner outline on selected option cards (`choice-card`).
- Ruler ticks under page-header eyebrows and along the stage progress track.
- A pinked (zig-zag) edge on pattern swatch media (`pinked-edge`).
- A cutting-mat grid behind the measurement guide and the preview stage (`cutting-mat`).
- Dimension lines around the hero illustration.
- Prototype and sandbox notices drawn as woven `care-label`s.

Every selected state has a forced-colours equivalent.

### Motion

- **Timing:** `--duration-fast` (120 ms) for colour and hover changes; `--duration-base` (180 ms) for selection and borders; `--duration-slow` (280 ms) for reveals; `--ease-standard` is `cubic-bezier(0.2, 0, 0, 1)`.
- **What animates:** only colour, opacity, transform, border and shadow, never layout. Buttons press to a darker fill with a flatter shadow, with no movement, so adjacent actions never misalign. Selections fade in their stitch outline. A new configurator stage fades up 6 px.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, a global guard removes all transitions and animations.

### Focus

The global `:focus-visible` fallback draws a two-colour ring (2 px surface gap plus 3 px terracotta) on standard interactive or explicitly focusable elements, with a system-colour outline in forced-colours mode. Elements that script focuses (stage and panel headings, status messages: `tabindex="-1"`) get the same ring; only `<main>`, the skip link's target, is left to the browser. Focusable controls start with `outline-color: transparent` (`Highlight` in forced colours), the colour the ring's outline has, so a control with `transition-colors` does not fade the outline in from its text colour: Tailwind's `transition-colors` animates `outline-color`.

When an inline question, panel or menu closes, focus returns to the control that opened it (or a sensible neighbour if that control is gone), never to `<body>`. Ending a session on the account page (sign out, sign out everywhere, revoking this session, deleting the account) replaces the whole signed-in view, so the sign-in heading takes focus; a production-work step button that is replaced by the next step hands focus to the work heading, unless the visitor has moved focus to another control while the step ran. `useDeferredFocus` in `components/ui/` does this once the render that mounts or removes the control has committed.

### Fabric swatches

Anything that paints the customer's own colour (the Plain colour card, the Current selections ticket, the Preview and Review rows, saved projects, the cart) carries `.fabric-swatch`. It sets `forced-color-adjust: none` so high-contrast mode keeps the colour, and outlines it in `CanvasText` there so it stays visible against any background. `tests/accessibility-contracts.test.tsx` fails if a component sets an inline `backgroundColor` without the class.

## 3. Constraints the tests freeze

- Routes, copy, headings, accessible names and landmark labels are covered by unit and browser tests, as are the class hooks and `data-*` attributes they use: `.landing-*`, `.shape-option-*`, `.cover-option-*`, `.pattern-card-*`, `.pattern-filter-*`, `.unit-selector-*`, `.cushion-preview-*`, `.prototype-notice`, `.print-hidden`, and `#site-navigation-menu`, which toggles `hidden`/`block`.
- The cushion preview SVG internals are frozen by tests and are not restyled. Its colours come from the `--shade-*` tokens.
- Screens compose the primitives: outside `components/ui/`, a hand-built form control, description list or panel, a hex literal, an off-ladder spacing step or `max-w-3xl` fails `design-system-guard.test.ts` unless it is one of the listed exceptions (see Composition guard below).
- Targets are at least 44 px, input text at least 16 px, and adjacent buttons at least 8 px apart. There is no horizontal overflow from 320 px up.
- Fonts are self-hosted and served under the `/SewnCovers` base path. The frontend has no third-party runtime dependencies.

## 4. How the system is built

`globals.css` is organised in three token layers plus component, accessibility and print sections:

1. **Primitive palette.** Raw values on `:root` (linen, ink, loden, terracotta, brass, madder), which generate no utilities.
2. **Semantic theme tokens.** CSS-first Tailwind v4 `@theme` variables that generate utilities such as `bg-page`, `text-text-muted`, `border-border-strong`, `rounded-card`, `shadow-raised` and `max-w-page`. Tailwind's default colour, type, radius and shadow scales are reset to `initial`, so every utility resolves to a SewnCovers token.
3. **Fabric dye tokens** (`--dye-*`).

Colour roles cover page and surfaces, primary and muted text, brand states and a brand tint, decorative and text-safe accents, tape-measure brass, borders and stitch lines, focus, and three feedback palettes: a brass "care label" `notice` palette for prototype and sandbox disclaimers, `success`, and a madder-red `error`. Disclaimers never reuse the error palette.

### UI primitives

Typed primitives live in `frontend/components/ui/` and are exported from the `@/components/ui` barrel.

| Group | Components | Notes |
| --- | --- | --- |
| Actions | `Button`, `ButtonLink`, `TextLink` | Share `buttonClasses()`; primary, secondary and ghost variants, default and compact sizes; disabled buttons use a dashed "unavailable" frame. `ButtonLink` wraps `next/link`. |
| Layout and headers | `PageShell`, `PageHeader`, `SectionHeader`, `Surface`, `StitchDivider` | `Surface` offers default, subtle, page, emphasis, strong, accent and danger tones, a card, compact, tight or no padding, and renders as `section`, `article`, `aside`, `div`, `figure`, `header` or `li`. `surfaceClasses()` gives the same recipe to an element `Surface` cannot render, such as a `fieldset`. `SectionHeader` takes a `size` (section, card or subhead) and a heading `level`. |
| Form controls | `NumberInput`, `UnitSelector`, `Field`, `TextInput`, `Select`, `Textarea`, `Checkbox` | One shared control frame at the 48 px control size; `Field` wires the label, help and error text to the control; `NumberInput` takes an optional unit suffix; `UnitSelector` is a segmented control for cm and in. Read-only styling applies to text fields only, because browsers also match `:read-only` on a `<select>`. |
| Status | `Badge`, `Notice`, `ErrorMessage`, `LoadingState`, `EmptyState`, `SpecList` | `Notice` covers prototype, sandbox, info and success tones; `ErrorMessage` keeps assertive alert semantics and takes an optional visible `heading`; its props are an allow-list (`children`, `heading`, `className`, `id`, `role`, `aria-live`), so a mistyped `title=` is a type error. `EmptyState` is centred and card-sized by default, or `align="start"` and `size="compact"` inside a panel; `LoadingState` can be `framed`. `SpecList` lays labelled values out in two, three or four columns, or by container width. |

**Heading size follows the heading's role, not its level.** A page-level section is `section`, a panel inside a section is `card`, and a sub-block inside a card is `subhead`. Sibling panels on one screen share a size. The level (`h2` to `h4`) only sets the document outline.

**Adoption is broad.** Screens build their buttons, text links, headers, panels, forms, banners, empty and loading states, and label-and-value lists from these primitives. The exceptions are the elements the composition guard lists below, each with a reason.

### Composition guard

[`frontend/tests/design-system-guard.test.ts`](../frontend/tests/design-system-guard.test.ts) reads every file under `app/` and `components/` with the TypeScript parser. Outside `components/ui/`, it flags a raw `<input>`, `<select>` or `<textarea>` (other than `type="hidden"`), a `<dl>`, a class string that pairs `rounded-panel` or `rounded-card` with a border width, and a hex colour. It also checks every class string in the app for spacing steps off the ladder and for `max-w-3xl`.

A legitimate exception is an entry in the test's `allowlist`: the file, a pattern that picks out that one element, an optional `count` (default 1) and a one-line reason. The test fails when something is flagged and not listed, and when an entry no longer matches exactly its `count` of elements, so exceptions cannot go stale or quietly widen. The current list is 27 entries: eight form controls with no primitive (five selection-card radios and chips, plus the colour, range and file inputs), four description lists whose rows are not `SpecList` rows, thirteen entries for fifteen boxes that are not `Surface` panels (dashed containers, a clickable card, swatch and image tiles, and frames on the cutting-mat backdrop), and two lines of copy that show the `#B8AFA3` colour-code format. Prefer a primitive; add an entry only when the element is genuinely a different kind of thing.

## 5. Current behaviour notes

### Configurator copy and headings

- **One introduction.** The page header (eyebrow, h1 and a one-sentence lede) appears on the Shape stage only, with the stage heading as an h2 inside its legend. From stage 2 the stage heading is the page's only h1, and the "Shared design", "Saved configuration" and "Keep your unsaved design?" panels, which sit above it, stop being headings so no h2 comes before the h1, and the tab title names the stage, for example "Measurements (stage 2 of 6) – Configure a cushion | SewnCovers". Focus targets and the live-region stage announcement are unchanged.
- **One disclaimer per screen.** The footer's "A portfolio prototype" line is the site-wide note. In the configurator only the Preview stage (its care-label caption) and Review (the prototype notice, which is also printed and downloaded) add one. Stage and option copy describes what a customer gets, never how the app stores or models it.
- **Help under Continue** appears only when something blocks it.
- **Data is not a heading.** Prices, subtotals, order references and the account email are text with a label (visible, or visually hidden where the eyebrow above already says it), at the size they had as headings. The order card is named by its reference through `aria-labelledby`; its detail sections are h2 on the orders page and h3 in the administrator view.
- **Landmarks.** Only real navigation is a `nav`: the primary and footer navigation, the legal contents list, the account links and the sign-in and create-account links. The header's guest "Sign in" link is left out on the account page, where the form's own tab is on screen; two links with that name and different return targets would be ambiguous. Groups of buttons (the stage progress, the stage actions, the preview's edit actions) are `role="group"` with a label.
- **Colour codes.** A solid colour is shown as a swatch and "Solid colour". The code appears only in the optional "Colour code" field and, as "Custom colour · #B8AFA3" beside the swatch, in the Review table, its printout and the .txt download. The staff-only production specification keeps the code, because it is what gets made.
- **Spelling** is Canadian in all customer-facing text (colour, centre, centimetre, harbour). Identifiers, CSS tokens, data keys, ids and API fields keep their existing spelling.

### Pattern stage

All fifteen patterns are shown at once; search and the style and colour filters narrow them, and one count line is both the visible total and the live status. From 360 px the cards sit two to a row, and below `sm` their colour list is kept for screen readers only (the swatch shows it). A live preview draws the chosen colour or pattern on the cushion's own silhouette at the current pattern size: below `lg` it sits under the stage intro, from `lg` in the sticky side column under Current selections, where the configurator loads it on demand so it stays out of the first-load chunk. "Your patterns" asks the API once whether uploads are enabled and fails closed: only a successful "enabled" answer shows the upload and its sign-in; while it is pending or if it fails, nothing is shown; a "disabled" answer shows a single line saying so.

### Preview

The 2D cushion preview is the configurator's only preview. Each of the five shapes has its own outline, based on its shape-card icon and drawn in the same soft style: highlight, edge shading, contact shadow, dotted inset seam, and piping when the Piped edge is selected. Proportions follow the entered measurements within clamps that keep extreme values legible. Box / bench and thick round cushions show a side band darkened with `--shade-band-front` and `--shade-band-side`; the crease where face meets band uses `--shade-crease`, and all three have forced-colours equivalents. The Tapered / trapezoid icon, measurement diagram and preview all put the wider front edge at the bottom. A photo-based mockup is a possible follow-up; no placeholder ships for it.

On the Preview stage the visual and its spec list share one column. From a 48rem container up it sits beside the pattern-size control and edit actions and is sticky; from 64rem the split is 7:5. The "Illustrative preview" care label is the figure caption and the stage's only disclaimer. DOM order, and so tab order, is unchanged across breakpoints. Review shows the same image, captioned with the fabric and shape, beside the specification table; the stage progress and "Back to Preview" are its ways back.

### Guest-first sign-in

The whole design journey (home, every Configure stage, preview, review, public links, print and download) works as a guest with no sign-in prompt. An account is asked for only at an account-only action, in place, and never at the cost of the design.

- **Where sign-in is asked for.** Only at *Save to My projects*, *Save and add to cart*, *Upload your own pattern* (when uploads are enabled) and a private project version link. The project name is suggested from the shape and fabric, so a guest goes straight to sign-in. Each opens an inline step ([`inline-sign-in.tsx`](../frontend/components/account/inline-sign-in.tsx)) that explains why the action needs an account, offers Sign in or Create account with the same form as `/account/` ([`auth-form.tsx`](../frontend/components/account/auth-form.tsx)), and has a way to continue as a guest. Nothing navigates, so nothing on screen can be lost. After sign-in the pending action resumes exactly once.
- **What stays account-only.** The API requires an account for projects, uploads, quotes, the cart, checkout and orders; there is no guest cart or guest checkout. The cart, orders and quote workspace show a calm guest empty state ([`guest-empty-state.tsx`](../frontend/components/account/guest-empty-state.tsx)) instead of a sign-in wall.
- **Header.** Guests see a quiet *Sign in* link that returns to the current page through allowlisted `returnTo` targets. A stored or verified session shows *Account*.
- **Draft in the browser.** [`services/configurator-draft.ts`](../frontend/services/configurator-draft.ts) keeps the design, stage and furthest stage in local storage (`sewncovers.configurator-draft`). Every access is guarded: blocked, full or empty storage falls back to memory for the page session. The draft never holds a sign-in token; the token stays in session storage. A draft saved to a project is linked to it, so further edits save as a new version and saving again never creates a duplicate project. Signing out removes linked drafts, pending actions and private custom patterns; a never-saved guest draft stays.
- **Links never destroy a draft.** A shared or project link that would overwrite an unsaved design asks first (*Keep your unsaved design?*). An untouched copy of a link, a design saved to a project, or the design's own public link opens straight away.
- **Performance.** Restoring, link comparison and validation of stored drafts load from [`draft-session.tsx`](../frontend/components/configurator/draft-session.tsx), which sits outside the first-load chunks.
- **Privacy copy.** The `/legal/` privacy notice and retention table describe the browser-stored draft.
