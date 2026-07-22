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
