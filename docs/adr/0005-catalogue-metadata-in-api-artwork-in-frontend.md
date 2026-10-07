# ADR 0005: Catalogue metadata in the API, artwork in the frontend

Status: accepted

## Context

The 15 fabric patterns need queryable metadata (names, categories, colours, order) and visuals. Static hosting is the right place for visuals, and the database should stay small.

## Decision

The API and database own each pattern's id, name, description, category, colours, activity and display order. The frontend owns facet labels and the mapping from stable pattern id to a CSS class; the artwork is repeating CSS gradients in `globals.css`, scaled by `--pattern-scale`. `previewClassName` stays in the transport schema, but the frontend resolves the class from the id, so an unknown id fails visibly and backend data can never select an arbitrary class. The frontend never falls back to bundled metadata.

## Consequences

- No image requests, no binary assets in PostgreSQL, and nothing that can lose the GitHub Pages base path.
- The seed migration and `frontend/data/patterns.ts` must stay in step; tests check the pairing, and the catalogue client rejects a response with an id it cannot draw.
- If the API is unreachable the Pattern stage shows a retryable error instead of stale data.
