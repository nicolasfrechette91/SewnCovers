# Self-hosted fonts

These fonts are loaded with `next/font/local` in `app/layout.tsx`. Next copies them into `/_next/static/media`, behind the GitHub Pages base path, so there are no runtime requests to a font CDN (the Content-Security-Policy is `font-src 'self'`).

| File                             | Family     | Axes                     | Source                                                           |
| -------------------------------- | ---------- | ------------------------ | ---------------------------------------------------------------- |
| `fraunces-latin-opsz-wght.woff2` | Fraunces   | wght 100–900, opsz 9–144 | Fontsource build of `google/fonts` `ofl/fraunces`, latin subset  |
| `geist-latin-wght.woff2`         | Geist      | wght 100–900             | Fontsource build of `google/fonts` `ofl/geist`, latin subset     |
| `geist-mono-latin-wght.woff2`    | Geist Mono | wght 100–900             | Fontsource build of `google/fonts` `ofl/geistmono`, latin subset |

All three are licensed under the SIL Open Font License 1.1. The licence and copyright notice for each family is in `OFL-Fraunces.txt`, `OFL-Geist.txt` and `OFL-GeistMono.txt`.
