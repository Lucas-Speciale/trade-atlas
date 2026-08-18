<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Trade Atlas repository guide

## Project shape

- Production: `https://trade.lucasspeciale.com`
- Repository: `Lucas-Speciale/trade-atlas` (private)
- Hosting: Cloudflare Pages project `trade-atlas`
- Stack: Next.js static export, TypeScript, React, MapLibre, Vitest
- Runtime: browser-only; no application server, database, or trade-data API

Read `README.md` for the product and data overview. Read `future-projects.md` only when planning new work.

## Commands

```bash
pnpm dev
pnpm test
pnpm lint
pnpm build
```

Run all three validation commands before handoff. `pnpm build` writes the static site to ignored `out/`.

## Data rules

- The source archive is `data/raw/BACI_HS17_V202601.zip`; it is large, local, and ignored.
- Never commit raw BACI, boundary ZIPs, `.venv`, `data/processed/`, `.next/`, or `out/`.
- `public/data/trade/` contains validated deployable partitions and is intentionally tracked.
- Do not regenerate those partitions for ordinary UI work. When a data change is requested, run `pnpm data:build`, review `data/processed/build-report.json`, and validate the resulting asset diff.
- Keep HS codes as strings so leading zeroes survive.
- Do not mix BACI releases or HS revisions in one time series without an explicit concordance and documented methodology.
- Preserve source attribution and the provisional label on the latest year.

## Interaction invariants

- In Country Lens, only the geography beneath the fixed lens center selects a country. Pointer hover and click must not select or emphasize map countries; they are reserved for dragging and zooming.
- Over ocean, clear the country fingerprint and statistics.
- In Product Overlay, country hover may preview a value and country click may select product-specific routes.
- Product route direction is outbound for a net exporter and inbound for a net importer. Route copy must distinguish gross bilateral flows from the selected overlay metric.
- Keep the basemap, country boundaries, labels, and overlay translucency visually consistent across both modes.
- Preserve keyboard, touch, reduced-motion, and shareable URL behavior.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`: install, test, lint, build, then deploy `out/` to Cloudflare Pages. It uses repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; never print, copy into files, or commit either value.

Do not push or trigger a production deployment unless the user asks. For local-only changes, leave the worktree ready for review.

The root portfolio at `lucasspeciale.com` is a separate repository and deployment. Do not edit it from this project.

## Maintenance

- Prefer extending the existing components and data contracts over adding parallel rendering paths.
- Remove superseded styles, types, state, and copy in the same change that replaces them.
- Use focused calculation helpers in `src/lib/` and cover non-visual logic with Vitest.
- Keep the README concise; put speculative work in `future-projects.md`, not in operational documentation.
- Preserve the generated Next.js instruction block at the top of this file. `next dev` may refresh it.
