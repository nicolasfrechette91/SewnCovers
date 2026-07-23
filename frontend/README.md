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

Dark mode, status colors, disabled-state colors, and motion tokens are intentionally deferred until a roadmap task or concrete component establishes their requirements. The existing homepage structure and content remain deferred to Task 2.5.
