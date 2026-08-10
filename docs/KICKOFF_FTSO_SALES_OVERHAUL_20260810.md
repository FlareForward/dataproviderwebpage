# FTSO Portal Sales Overhaul Kickoff

**Cycle:** ftso-sales-overhaul-01
**Authored:** 2026-08-10 (America/Chicago)
**Mode:** Best tier — full conversion-grade product. Codex default builder, Claude oversees.
**Source request:** Operator (2026-08-10 chat): FTSO page becomes a sales page for the average Joe — land, see how good we are, act (delegate AND stake — both first-class), My Rewards, socials accessible, cross-nav to flareforward.com. "This is a sales page, not necessarily data."

## What This Cycle Is Testing

- **Product increment:** ftso.flareforward.com converts from analytics terminal to sales-first delegation/staking portal with a retention loop (My Rewards).
- **Build OS claim:** a multi-surface UI overhaul can be decomposed into serially-dispatched Codex cycles, each contract-anchored, without regressing the existing on-chain plumbing.

## Framing Lock

- TARGET: `~/dataproviderwebpage` (Cloudflare Worker `ftso-flareforward`, serves ftso.flareforward.com).
- OBJECTIVE: a visitor who has never heard of FlareForward can land, understand why to bond to us in 30 seconds, and complete a delegation OR staking action without leaving the site; a returning delegator checks rewards via My Rewards.
- SUCCESS METRIC: (a) homepage above-the-fold shows pitch + Delegate + Stake + My Rewards CTAs with zero price-ticker content; (b) both wizard journeys (delegate, stake) complete against mainnet from a fresh wallet connect; (c) My Rewards renders per-wallet reward history chart from on-chain reads; (d) socials + cross-nav present in global nav; (e) prices/providers/network stats reachable under Analytics only; (f) `npm run build` green; (g) PRA pass.
- NON-GOAL: rebuilding delegation/staking/rewards plumbing (wagmi, flare-tx-sdk, registry runtime resolution — reuse as-is); any change to the FTSO provider node/feed infra; APY/APR marketing numbers; paid X API integration.
- OPERATOR CONFIRMED: yes — "best" (2026-08-10 chat), plus mid-turn correction "we have staking and delegating both, keep that in mind."

## Kickoff Spec Self-Check

| Original requirement | Testable rewrite | Defect class | Level | Resolution |
|---|---|---|---|---|
| "Geared toward marketing… average Joe" | Given a first-time visitor, when the homepage loads, then the fold contains the builders pitch and action CTAs, and not price feeds or provider tables. | ambiguity (what counts as sales copy) | GOAL | Resolved: journey spec in this doc; copy voice = plain-English, build-to-truth. |
| "Deploying delegations, staking, or anything else" | Both delegation AND staking are first-class journeys with equal CTA weight. | ambiguity | GOAL | Resolved by operator mid-turn message: both. |
| "My Rewards… click and see what their rewards are" | Given a connected wallet, when /rewards loads, then claimable + historical rewards render from on-chain reads. | incompleteness (history depth) | INPUT | Default: reuse `useRewards`/`usePosition` + performance-history snapshot; depth = whatever RewardManager epochs are queryable. |
| "Bigger APY by doing bonding differently" | Copy may say "engineering ways to increase your return" — no numeric APY/APR anywhere. | inconsistency (vs no-APY hard rule `feedback_ftso_report_no_apr_apy` + build-to-truth) | GOAL | Resolved: numeric yield claims LOCKED OUT of copy. |
| "X handles, YouTube handles very accessible" | Global nav/footer + proof strip carry X + YouTube links; public copy credits Whale + Ace. | incompleteness (which handles) | GOAL | Resolved from memory `reference_flareforward_x_handles_20260803`: @whale589, @AceThaGreatest, @hudspeth589. |
| "Content hub pulling from YouTube/X" | Latest videos render without a paid API key. | incompleteness (data source) | INPUT | Default: YouTube public RSS/oEmbed via the existing `/api/*` worker proxy; X = curated static cards (X API is paid). Deferred; stop condition: if RSS blocked, fall back to static embeds. |
| "Nav connecting the two" (main page ↔ FTSO) | Global nav links to flareforward.com properties; flareforward.com side handled in `~/flareforward-site` as a separate cycle. | inconsistency (cross-repo write) | GOAL | Resolved: THIS cycle touches only `dataproviderwebpage`; the flareforward.com-side link-back is a follow-on cycle. |
| Base ref | Overhaul branches from a base containing the /rewards work. | ambiguity | GOAL | Resolved: `feat/rewards-page` = main + 1 commit (654e357), synced with origin. Step 0 merges its PR to main; overhaul branches from fresh `origin/main`. |

## Clarification Budget

| Question | Level | Resolve now? | Default if deferred | Why |
|---|---|---:|---|---|
| Delegation vs staking priority | GOAL | YES (resolved) | — | Operator: both first-class. |
| Numeric yield in copy | GOAL | YES (resolved) | — | Hard rule; locked out. |
| Content-hub source | INPUT | no | YouTube RSS via worker proxy; X static cards | Doesn't change frame; swap-able later. |
| Reward history depth | INPUT | no | Queryable RewardManager epochs + existing snapshot | Plumbing exists. |

No unresolved GOAL-level rows.

## Phase 1 Kill Criteria

| Criterion | YES/NO | Justification |
|---|---|---|
| skills | YES | React/Tailwind UI + existing wagmi/flare-tx-sdk plumbing; well inside Codex lane capability. |
| timeframe | YES | 4–5 serial Codex cycles; no infra dependency; fits revenue-focus period. |
| budget | YES | LLM + Cloudflare deploy cost negligible; no new paid APIs (X API explicitly excluded). |
| strategy | YES | Directly serves FTSO GO-LIVE north star — delegation vote power is the business. |
| audience | YES | Primary: FLR holders ("average Joe") deciding where to delegate/stake; secondary: community members checking rewards. |

## Spec Delta

### Current Truth
- Repo serves ftso.flareforward.com via CF Worker `ftso-flareforward`; SPA fallback + `/api/ftso` proxy to Flare Systems Explorer.
- Routes: `/` (Dashboard = analytics-heavy), `/providers`, `/delegation` + `/staking` (both → `DataProviders` component, which hosts the real wagmi flows), `/rewards` (new sales page w/ per-address lookup, commit 654e357), `/analytics`.
- Plumbing that WORKS and is reused: `useDelegation`, `useStaking`, `useValidatorStaking`, `useRewards`, `usePosition`, `useAccuracy`, `usePerformanceHistory`; `lib/flare.ts` registry-resolved contracts; ConnectWallet.
- Zero socials anywhere in src. No lint/test scripts; build gate = `tsc --noEmit && vite build`.
- Hard rules inherited: no APR/APY numbers; never soften copy / build to truth; public copy credits Whale + Ace; no key custody by agents.
- FIP.16 changed provider signing-weight economics (see `fip16-ftso-provider-economics-skill`) — copy must be consistent with post-FIP.16 reality.

### ADDED
- Sales homepage: hero pitch ("delegate to builders"), dual CTAs (Delegate / Stake), My Rewards nav, proof strip (education platform, builder collective, burn protocols module, honest FIP.16 note, socials).
- Guided first-time wizard with two journeys: delegate (wrap → delegate) and stake, reusing existing hooks.
- My Rewards upgrade: wallet-connect reward history chart per wallet.
- Content hub section: latest YouTube videos (RSS/oEmbed via worker proxy) + curated X cards.
- Unified FlareForward nav (links out to flareforward.com properties).

### MODIFIED
- `/` Dashboard: analytics content moves OUT; becomes the sales page.
- `/analytics`: absorbs live prices, provider directory summary, network stats (demoted, not deleted).
- Global nav (`Root.tsx`): My Rewards promoted; socials + cross-nav added.

### REMOVED
- Live price ticker from homepage (the slow first impression). Feed reads stay available on Analytics.

### UNCHANGED / LOCKED
- Worker proxy behavior for existing `/api/ftso`; wrangler routing config semantics.
- All on-chain write paths (delegate/wrap/stake tx construction) — UI may re-skin around them, not alter tx logic.
- No numeric APY/APR anywhere in copy.

## Goal, Scope, Non-Goals

**Goal:** ftso.flareforward.com sells FlareForward and converts visitors into delegators/stakers, and retains them via My Rewards.

**Scope:** `src/app/**` (pages, components, routes, copy), `src/hooks` additions (read-only), `worker/index.ts` (add YouTube RSS proxy route only), `src/styles`, `docs/**`.

**Non-goals:** flareforward.com repo changes; provider node/feed infra; tx-logic changes; paid APIs; analytics telemetry.

## Target Audience

- Primary: FLR holders with idle vote power; crypto-literate but not FTSO-literate.
- Secondary: existing delegators returning to check rewards.
- Knowledge assumptions: knows what a wallet is; does NOT know WFLR wrapping, vote power, or reward epochs — wizard explains each step in one plain sentence.
- Vocabulary level: plain English first, correct terminology in parentheses.

## Use Case Calibration

- Intended use: public marketing + self-custody delegation/staking portal, real mainnet funds.
- Trust boundary: site never holds keys; all txs signed in the user's wallet; reads via public RPC + worker proxy. No backend state, no PII.
- Finish bar: conversion-grade polish — this page IS the brand's front door for vote power.
- Complexity posture: static SPA + worker proxy stays; no backend, no DB, no auth.
- Explicitly not: custody, yield product, exchange, or numeric-yield marketing.

## File Lock Protocol

```text
LOCKED (do not modify this cycle):
- src/lib/flare.ts tx-construction internals  # on-chain write paths; UI reuse only
- src/hooks/useDelegation.ts, useStaking.ts, useValidatorStaking.ts write paths  # same
- wrangler.jsonc routing semantics for /api/ftso  # prod proxy contract
- .env*, any secrets  # never touched by agents

MUTABLE (fair game):
- src/app/** (pages, components, routes, copy)
- src/hooks/** new read-only hooks (e.g. useRewardHistory)
- src/styles/**
- worker/index.ts (ADD /api/youtube route only; existing routes untouched)
- docs/**
- README.md
```

## Risks And Mitigations

| Risk | Mitigation |
|---|---|
| Re-skin silently breaks working delegation/staking flows | Locked write paths; per-cycle regression check: complete a delegate + stake dry-run on preview before merge. |
| Copy drifts into yield promises | Grep gate: `rg -i "apy|apr|% *return" src` must be empty of numeric claims at quality gate. |
| Identity leak in public copy | Public copy credits Whale + Ace only; grep for the three handles is fine, no real names. |
| YouTube RSS blocked/CORS | Worker proxy route; fallback to static embeds (recorded stop condition). |
| Scope sweep into flareforward-site | Cross-repo write is a named NON-GOAL; separate follow-on cycle. |
| Concurrent sessions in repo | Overhaul runs in a dedicated worktree branched from fresh `origin/main` after Step 0 merge. |

## Execution Sequence

1. **Step 0 — base consolidation:** merge `feat/rewards-page` PR into main; fetch; create worktree `feat/sales-overhaul` from `origin/main`.
2. **Cycle A — information architecture:** new sales homepage shell + nav overhaul (My Rewards, socials, cross-nav); analytics content relocated to `/analytics`; ticker removed. Copy pass 1.
3. **Cycle B — proof strip + burn/FIP.16 modules + content hub** (worker RSS route + fallback).
4. **Cycle C — guided wizard:** dual-journey (delegate | stake) stepper wrapping existing hooks; plain-English step copy.
5. **Cycle D — My Rewards upgrade:** per-wallet reward history chart (new read-only hook + recharts), claimable summary.
6. **Cycle E — polish + PRA:** responsive/mobile, dark consistency, product-readiness-audit, deploy, live verify.

Each Codex dispatch is serial, carries a CONTRACT.yml per `spec-driven-kickoff` contract-anchoring rules, and gets checked in per oversight doctrine.

## Post-Tasks Repo Grounding

| Task | Named surface | Exists? | Evidence | Action |
|---|---|---:|---|---|
| A | src/app/Root.tsx, Dashboard.tsx, Analytics.tsx, routes.tsx | YES | `find src/app` this session | proceed |
| A | homepage ticker (`usePriceFeeds` in Dashboard) | YES | hooks list + README | proceed |
| B | docs/ | TO_CREATE | absent in repo ls | created by this kickoff |
| B | worker/index.ts | YES | repo ls | proceed (additive route) |
| C | useDelegation/useStaking/useValidatorStaking, ConnectWallet | YES | hooks/components ls | proceed (reuse) |
| D | useRewards, usePosition, RewardsBreakdown.tsx, Rewards.tsx | YES | ls + commit 654e357 | proceed |
| D | scripts/snapshot-performance.mjs + public/ftso-performance-history.json | YES | package.json scripts | proceed |
| E | wrangler deploy target `ftso-flareforward` | YES | wrangler.jsonc | operator-approved deploy |

No blocking NO rows.

## Phase-Boundary Commit Plan

Multi-cycle, multi-day: commit at each cycle boundary on the worktree branch with explicit paths; push after each green quality gate; PR per cycle or one stacked PR at operator's preference (default: PR per cycle).

## Quality Gate

```text
QUALITY GATE: expected
  typecheck: npm run build (tsc --noEmit + vite build) — must pass
  lint: N/A — no lint script in repo; do not add tooling this cycle
  tests: N/A — no test runner in repo; verification is journey-based (below)
  locked_files: git diff --name-only vs lock list — no locked paths touched
  placeholders: rg -n "TODO|PLACEHOLDER|lorem" src — empty in shipped copy
  slop_scan: copy read-through against build-to-truth rule
  analytics: N/A — no telemetry by design
  traces: N/A
  evals: journey check (HARD RULE feedback_gate_requires_journey_check): fresh-wallet delegate journey + stake journey + rewards lookup on preview build
  contracts: rg -i "apy|apr" src shows no numeric yield claims; tx paths byte-identical (git diff on locked files empty)
```

## Review, Hardening, Testing, Deploy, Verify

- Phase 5 review packet: per-cycle diff summary + screenshots (fold, wizard steps, rewards chart).
- Phase 6 independent review: Claude reviews each Codex cycle (oversight doctrine); Phase-6 detectors as applicable.
- Phase 7 hardening: external-link rel=noopener, RSS proxy input validation, no secrets in client bundle.
- Phase 9 testing: journey check on `npm run preview` + wrangler dev; mobile viewport pass.
- Phase 10 deploy: `wrangler deploy` — operator-approved, after Cycle E only (prod stays on current build until then).
- Phase 11 verification: live ftso.flareforward.com fold check + delegate dry-run to wallet-connect step; verify /analytics carries demoted data.
- Phase 11.5 PRA: product-readiness-audit — mandatory (user-facing).

## Failure Root-Cause Rule

Every failed gate, broken journey, or regression gets a why-pass before retry; detector false-positives or gate holes get queued to /forge per standing rule.

## Lesson Harvest And Ledger

- Phase 12: harvest copy/conversion lessons into memory if a pattern generalizes (e.g., sales-page journey spec for other FF properties).
- Phase 13: ledger row in the repo's BUILD_LOG (create `docs/BUILD_LOG.tsv` if absent) — cycle id, phases, wall-clock per phase.
