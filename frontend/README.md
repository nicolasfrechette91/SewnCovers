# SewnCovers frontend

This directory contains the Next.js 16.2.11, React, and TypeScript App Router frontend. It is configured for static export to GitHub Pages. The current foundation does not call the FastAPI service yet; API integration is deferred to a later roadmap task.

## Requirements

- Node.js 20.9.0 or newer, as required by the installed Next.js version
- npm, using the committed `package-lock.json`

## Local setup

Install the locked dependencies from the `frontend` directory:

```powershell
npm ci
```

If `.env.local` does not already exist, create it in Windows PowerShell with:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

On macOS or Linux, create it only when it does not already exist:

```bash
test -e .env.local || cp .env.example .env.local
```

`NEXT_PUBLIC_API_URL` is the browser-visible FastAPI address and defaults to `http://localhost:8000` in the example. Every `NEXT_PUBLIC_` value is embedded in browser code, so never put credentials, database URLs, API keys, or other private values there. Local environment files are ignored and must not be committed.

## Run the frontend

Start the development server:

```powershell
npm run dev
```

Open <http://localhost:3000>. Run the backend separately when it is needed; the current frontend does not consume it yet.

Press `Ctrl+C` in this terminal to stop the development server.

## Quality checks

Run these commands from the `frontend` directory:

```powershell
npm run lint
npm run typecheck
npm run build
```

`npm run typecheck` performs strict TypeScript checking without emitting files. `npm run build` performs the production build and writes the static export to the ignored `out/` directory. The existing configuration keeps local development and ordinary local builds at the domain root while GitHub Actions builds use the `/sewncovers` base path required by GitHub Pages.

## Design tokens

The visual foundation uses a warm ivory page, warm-neutral surfaces, forest-green brand actions, and restrained terracotta accents. Semantic CSS-first Tailwind v4 theme variables in `app/globals.css` are the single source of truth; they generate utilities such as `bg-page`, `text-text-muted`, `border-border-strong`, `rounded-card`, and `shadow-raised` while remaining available as CSS custom properties.

- Color roles distinguish the page, elevated and subtle surfaces, primary and muted text, brand interaction states, decorative and text-safe accent variants, borders, and focus colors. Standard borders are for visual separation; controls that require a 3:1 boundary use `border-strong`. The regular terracotta accent is not approved for normal-sized text, so `accent-strong` is used when accent-colored text is needed.
- Geist remains the body and display family, with Geist Mono retained for technical content. The compact semantic scale covers supporting text, labels, buttons, body copy, section headings, and page titles without coupling visual size to HTML heading level. This preserves the verified static-export setup, but clean builds still need outbound access while `next/font/google` downloads and self-hosts Geist.
- Spacing keeps Tailwind's 4px base and adds a few named steps for icons, controls, components, cards, gutters, layouts, and sections. Radius tokens cover small and standard controls, cards, panels, and intentional pills. Three warm shadow levels cover cards, raised controls, and future overlay surfaces.
- The global `:focus-visible` fallback applies only to standard interactive or explicitly focusable elements. Its two-color 2px/3px ring remains visible on light surfaces and forest-green actions, with a system-color outline fallback in forced-colors mode; later components may compose the same `shadow-focus` token with their own shadows.

WCAG 2.2 contrast checks: primary text on the page is 12.28:1; muted text is 5.22:1 on the page and 5.64:1 on cards; light text on the brand is 8.92:1; brand on the page is 8.20:1; text-safe terracotta on the page is 5.64:1; and the focus color is 4.31:1 on the page and 4.65:1 on cards. The strong border is 3.08:1 on the page and 3.32:1 on cards. The inner light focus ring is 8.92:1 against the brand, while the outer terracotta ring is 4.65:1 against the inner ring. Values were checked with the WCAG relative-luminance formula.

Task 2.2 adds semantic disabled-control aliases and an error surface/border/text palette because those concrete component states now require them. Dark mode and a broader status or motion-token system remain deferred.

## UI primitives

Reusable typed primitives live in `components/ui/` and are available from the `@/components/ui` barrel. Their static Tailwind class mappings consume the semantic theme utilities above; optional `className` props are intended for layout integration rather than replacing required state or focus treatment.

- `Button` renders a native button with primary or secondary variants, default or compact sizing, `type="button"` by default, and native disabled behavior. Loading disables interaction, sets `aria-busy`, preserves the original width where practical, and exposes a visible loading label.
- `NumberInput` renders a labeled native number input with standard controlled or uncontrolled value handling, decimal-friendly input mode, supporting text, native numeric attributes, and optional invalid styling. Caller-provided error IDs compose with generated supporting-text IDs through `aria-describedby`; the component does not coerce, clamp, round, validate, or convert values.
- `UnitSelector` is a controlled native radio group for centimetres (`cm`) and inches (`in`). Its fieldset and legend provide group semantics, selected state includes a visible checkmark, and unit changes do not convert numeric values.
- `LoadingState` exposes a visible, polite status label and an assistive-technology-hidden CSS spinner. Rotation is limited to users without a reduced-motion preference, while the static indicator remains visible for reduced motion.
- `ErrorMessage` remains in document flow, defaults to assertive alert semantics, accepts normal React content and an `id` for form association, and uses the semantic error surface, border, and text tokens.

Business validation, measurement conversion, persistence, retry behavior, overlays, skeletons, toasts, and global error handling remain deferred to their roadmap tasks.

## Configurator component shells

Reusable domain-oriented shells live in `components/configurator/` and are exported through `@/components/configurator`. They consume the semantic design tokens and native form conventions established by the UI layer, but do not own the configurator workflow. The roadmap-aligned parent-supplied step labels are Shape, Measurements, Pattern, Preview, and Review; saving and restoring a design remain later workflow outcomes.

- `StepIndicator` renders a display-only ordered list, derives completed and upcoming states from a validated current step ID, and exposes the current item with `aria-current="step"`.
- `ShapeSelectionStep` owns the shape-selection presentation while the central configuration Context remains the only source of selection state. It renders a native radio group with whole-card labels, visible checked and availability text, native disabled behavior, and the documented square, rectangle, and box / bench identifiers.
- `PatternCard` associates a whole visible card with a native radio input. The caller owns controlled or uncontrolled selection and supplies preview content; previews are decorative by default, while callers may opt into accessible preview content.
- `PatternFilter` is a controlled generic fieldset. Its explicit selection mode renders native radios for one active value or native checkboxes for combinable values, then reports values without filtering records internally. Product category and color values remain intentionally undefined until the catalogue tasks.
- `CushionPreview` provides a labeled, contained visual region, a deliberate empty state, and separate descriptive content. Supplied visuals are decorative; accurate proportions, compositing, pattern tiling, and scale rendering remain deferred.
- `ConfigurationSummary` renders caller-formatted label/value items as a description list, including intentional empty and missing-value fallbacks. It performs no measurement conversion, calculation, validation, pricing, or totals.

Future parent components remain responsible for measurement and pattern state integration, data fetching, filter logic, workflow navigation, business validation, measurement conversion, accurate preview rendering, pricing, persistence, and API integration.

## Configuration state

The central in-memory configuration state lives in `context/configuration/`. `ConfigurationProvider` owns a `useReducer` instance and wraps route content inside the server-compatible root layout; `useConfiguration()` returns the typed `state` and `dispatch` values and throws a descriptive error outside the provider. Public state, action, reducer, initial-state, provider, and hook exports are available from `@/context/configuration`.

The state follows the documented shared configuration contract: `shape`, `width`, `height`, `thickness`, `unit`, `patternId`, and `patternScale`. Shape, measurements, and pattern selection begin as `null`; the initial unit is centimetres and the documented default pattern scale is `1`. Supported actions set each field independently (`setShape`, `setWidth`, `setHeight`, `setThickness`, `setMeasurementUnit`, `setPatternId`, and `setPatternScale`) or restore the complete initial state with `resetConfiguration`.

The reducer only applies typed immutable transitions. Shape-specific measurement behavior, measurement conversion and validation, pattern data and filtering, workflow navigation, preview calculations, pricing, persistence, API integration, and saved/shared designs remain deferred to their roadmap tasks.

## Shape selection

The static `/configure/` route provides the minimum server-compatible configurator page shell for Task 3.2. Its display-only `StepIndicator` identifies Shape as the current step, while `ShapeSelectionStep` is the smallest client boundary needed to call `useConfiguration()`. The component reads `state.shape` directly and dispatches the existing typed `setShape` action; it does not duplicate the selected shape in local component state.

The selection group uses a native `fieldset`, `legend`, and same-name radio inputs. Each radio is associated with its complete visible card label and supporting text. Checked state is communicated by the native state, a checkmark, persistent Selected text, and a stronger card boundary; focus moves to the visible card treatment. Disabled options retain native disabled semantics and explicit Unavailable in this step text. Labels and status elements meet or exceed the approximately 44px target, wrap at narrow widths, and retain system-color checked, disabled, and focus boundaries in forced-colors CSS.

Only the exact `square` identifier is selectable in this first vertical slice. The already documented `rectangle` and `box` identifiers are shown only as disabled, explicitly unavailable future options; they do not dispatch configuration changes. Measurement inputs, shape-specific calculations, validation, conversion, later-step navigation, patterns, previews, pricing, and persistence remain deferred.

## Global layout components

Reusable server-compatible layout components live in `components/layout/` and are exported through `@/components/layout`. The root layout renders the site header and footer around one flexing `<main id="main-content">` landmark and provides a focus-revealed skip link to that stable target. The starter homepage keeps its existing content and now relies on the root layout for its main landmark.

- `SiteHeader` renders a static semantic header and primary navigation with an accessible text-based SewnCovers home link because no approved logo asset exists. Optional typed navigation items use `next/link`; a caller may provide an exact `currentHref` to add `aria-current="page"` and a persistent underline without route-dependent client logic.
- Navigation stacks and wraps with responsive CSS. The integrated header continues to expose only the home destination; Task 3.2 adds the minimal `/configure/` page without expanding global navigation or adding a redundant disclosure menu. The component has no client boundary; a mobile disclosure can be added when later navigation work defines the complete destination set.
- `SiteFooter` renders the documented SewnCovers portfolio-prototype identity and a build-time year. Optional typed footer navigation is omitted from the integrated frame until real destinations are defined.
- Internal `next/link` destinations remain application-relative because Next.js applies the configured `/sewncovers` base path automatically in GitHub Pages builds. Public image paths continue to use the existing build-time base-path strategy.

Legal, contact, social, account, commerce, search, and additional product or configurator links remain deferred until their routes and content are defined.

## Landing page

The `/` route is a server-compatible landing page composed inside the shared header, single `main#main-content`, and footer frame. It introduces the prototype, presents three illustrative studies for the supported cushion shapes, explains the planned journey as an ordered three-step sequence, and links to the existing `#examples` and `#how-it-works` sections. The prototype-status notice explicitly states that the current experience does not take orders, calculate prices, or produce finished covers.

The landing studies are CSS illustrations built from the existing semantic palette and paired with visible captions. They do not create pattern records, product selection, pricing, or configurator state. The default Next.js starter graphics remain in `public/` for now but are not referenced by the landing page; no remote images or new image assets are used.
