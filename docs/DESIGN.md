# Mosaic Vault — Design System (FROZEN 2026-11-06)

**Feel:** institutional financial infrastructure. Calm, dense where it matters, typographically precise. Think a modern treasury terminal, not a crypto dashboard.

**Light theme is the default**; dark only via a toggle (`data-theme="dark"` on `<html>`, persisted in localStorage). Both themes must be complete.

## Tokens (`app/globals.css`, Tailwind v4 `@theme inline` + shadcn CSS variables)
- Surfaces: `--background` warm off-white `#F7F6F3`; `--card` `#FFFFFF`; `--muted` `#EFEDE8`; borders `#E3E0D9`. Dark: `#0E1116` / `#151A21` / `#1B212A` / `#262D38`.
- Ink / primary: deep navy `#0F1F3D` (dark theme: `#DCE4F2`). Accent for links/interactive: `#1E3A8A` → hover `#172E6E`.
- Semantic: healthy green `#1B7F4C` (bg `#E6F4EC`), warning amber `#B7791F` (bg `#FBF1DC`), risk red `#B42318` (bg `#FBE9E7`), info slate `#475467`. Health-factor bands: ≥ 1.5 green, 1.1–1.5 amber, < 1.1 red (and "Liquidatable" when < 1.0).
- Type: `Geist` (sans) for UI, `Geist Mono` for every number, address, hash. Numbers use `font-variant-numeric: tabular-nums`. Base 15px app / 16px marketing. Headings: 600 weight, tight tracking (-0.01em), no display-weight hero fonts larger than 56px.
- Radius: 6px controls, 10px cards. Shadows: one soft `0 1px 2px rgba(16,24,40,.06)`; no glow.
- Spacing: 4px grid; page gutters 24px (16px mobile); max content width 1200px app, 1120px marketing.
- Motion: 150–200ms ease-out only for state changes; no scroll-jacking; no decorative loops. Respect `prefers-reduced-motion`.

## Rules (anti-slop, owner's standing feedback)
- No eyebrow labels above headings, no pill badges as decoration, no gradient blobs, no identical 3-card feature grids, no emoji, no "✨".
- Status badges only when they carry meaning (Verified external / Test-only / Paused / Liquidatable).
- Every number from chain state; never fabricate charts. Empty states say what to do next in one plain sentence.
- Copy: plain, short, no jargon-on-jargon. Say "Borrowing limit", not "available borrowing capacity (LTV-adjusted)". Expand terms once (e.g. "Health factor: how far the position is from liquidation").
- Must ship: favicon (`app/icon.svg`), `app/opengraph-image.tsx`, `app/manifest.ts`, `app/robots.ts`, `app/sitemap.ts`, `app/not-found.tsx`, proper `<title>` templates, mobile layouts.

## Layout
- Marketing: top nav (logo, Collateral, How it works, Risk model, Docs link, "Open app"), hero with one sentence + two buttons, sections stacked with generous vertical rhythm, footer with testnet disclaimer.
- App shell (`components/layout/AppShell.tsx`): left sidebar 240px (Dashboard, Collateral, Deposit, Borrow, Portfolio, Protocol, Risk — the last two only visible to managers but routable), top bar with network badge (Mezo Testnet / wrong network warning), wallet button, theme toggle. Mobile: sidebar becomes a sheet.
- Tables are real `<table>` with sticky headers, right-aligned mono numbers.
- Transaction flow pattern (shared `components/transactions/TxFlow.tsx`): form → review summary (what changes, resulting health factor, liquidation price) → approve step (if needed) → submit → pending (hash + explorer link) → confirmed (receipt) / reverted (decoded reason). Never show success before the receipt.

## Logo
Wordmark "Mosaic Vault" in Geist 600; mark = 2×2 grid of rounded squares with one square offset (tiles = isolated vaults). Monochrome ink; inverts in dark.
