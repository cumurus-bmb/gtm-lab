# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 会話言語

このプロジェクトでの会話は **日本語** で行うこと。コミットメッセージやコード内コメントは既存の慣習（英語のコミットメッセージ、日本語のUI文言・コメント）に従う。

## What this is

A self-contained GTM (Google Tag Manager) / GA4 practice lab: static HTML pages with intentionally tricky tracking scenarios (dynamic forms, iframes, SPA-style nav, duplicate-submission traps, consent mode), plus a client-side grading engine that intercepts outgoing GA4 hits and scores them against 18 challenges — no backend, no build step.

## Commands

```bash
docker compose up -d      # serve site/ via nginx at http://localhost:8080
docker compose down
```

No build step, no `npm install`, no Node.js anywhere in `site/`. `site/` is nginx-served static files as-is (`docker-compose.yml` mounts `./site` read-only into `nginx:alpine`; see `nginx/default.conf`). Edit and refresh — there is no compile/watch step.

## `site/config.js` setup

Before testing against a real GTM/GA4 container, edit `site/config.js` (the committed/shipped version ships with placeholders — don't commit real IDs):

```js
window.LAB_CONFIG = {
  GTM_ID: 'GTM-XXXXXXX',              // your GTM container ID
  GA4_MEASUREMENT_ID: 'G-XXXXXXXXXX', // your GA4 measurement ID (display only; GTM does the actual sending)
  LAB_GRADER_ENABLED: true            // false disables the panel + interception entirely
};
```

`config.js` only sets config and initializes `dataLayer`/`gtag` and Consent Mode v2 defaults — it must never call `dataLayer.push()` for a custom/measurement event.

## Global Constraints (do not violate)

These apply to every file under `site/`; a future change must not break them even if the immediate task doesn't restate them:

- No build step, no bundler/transpiler, no Node runtime shipped — every file in `site/` must run as-is in a browser.
- Only relative paths inside `site/` — never a leading `/assets/...`. A page at depth 1 (e.g. `site/products/index.html`) must reference `../assets/...`. `site/` is uploaded byte-for-byte to the production host (see `deploy.sh`) and must work identically there.
- No `id` attribute anywhere in `site/` HTML, and no `data-*` **measurement-hint** attributes (e.g. `data-sku=`, `data-event=`, `data-track=`) — these would hand the learner an easy GTM selector instead of requiring real DOM/JS work. A generic `data-role="..."` used purely as a same-page JS DOM-mount marker is fine.
- Class names are deliberately generic and reused across unrelated elements (`.btn`, `.card`, `.link`, `.item`, `.box`) — never add a uniquely-named class whose only purpose is to make an element easy to target for tracking.
- Header/footer markup and the GTM container snippet are hand-duplicated verbatim in every page — not a DRY violation, it's required because there's no build/include step.
- `site/` JavaScript never calls `dataLayer.push()` for a custom/measurement event. `dataLayer` is initialized once in `config.js` and left entirely to the learner's GTM work. (`LabGrader.setScenarioContext()` is not a `dataLayer` push and is invisible to GTM — see below.)
- `config.js` and `assets/lab-grader.js` must be the first two `<script>` tags in every page's `<head>`, loaded synchronously (no `async`/`defer`), before the GTM container snippet — the network patch must be live before `gtm.js` starts firing.
- `robots.txt` has `Disallow: /`, and every page's `<head>` has `<meta name="robots" content="noindex,nofollow">`.
- `LAB_GRADER_ENABLED = false` in `config.js` must fully disable interception and hide the panel, with zero console errors.

## Grading engine

- `site/assets/lab-grader.js` — the engine. Patches `navigator.sendBeacon`, `fetch`, `XMLHttpRequest`, and `Image.prototype.src` to intercept GA4 `/g/collect` hits (including batched multi-line POST bodies), normalizes them (`ep.*`/`epn.*` params flattened into `hit.params`), evaluates challenges, tracks per-page pass/fail progress in `localStorage`, and renders the floating panel. Public API on `window.LabGrader`:
  - `getHits()` — all normalized hits captured so far (this page load).
  - `onHit(fn)` — subscribe to each new hit as it arrives.
  - `evaluate(challenge, hitList)` — score one challenge object against a hit list; returns `{ status: 'pass'|'fail'|'pending', reason }`.
  - `setScenarioContext(name)` — tag subsequent captured hits with `hit.context = name`, for `forbid.when` matching (see below). Not a `dataLayer` push.
  - `registerScenarioSteps(pageId, steps)` / `runScenario(pageId, stepNames)` — pages register named step functions; used to drive scripted scenarios (e.g. fill-and-submit-a-failing-form) from the panel or console.
  - `getDuplicateFlags()` — hits flagged as duplicates (session-dedup on `transaction_id` for `purchase`/`generate_lead`, and rapid <500ms identical-signature repeats).
  - When `LAB_GRADER_ENABLED === false`, `window.LabGrader` is replaced with no-op stubs (`getHits` returns `[]`, `evaluate` returns `pending`) and no panel is rendered.
- `site/assets/challenges.js` — data only: `window.LAB_CHALLENGES`, an array of 18 challenge objects (`id`, `level` 1–5, `page`, `title`, `brief`, `constraints`, `expect`, optional `forbid`/`scenario`/`observe_ms`).

Schema extensions this project adds on top of the literal spec schema (documented once here, kept consistent with `docs/CHALLENGES.md`/`docs/ANSWERS.md`):
- **`page: '*'`** — challenge applies on every page; the panel evaluates it regardless of current path, against hits captured since the current page load.
- **`observe_ms`** — for "must never fire" challenges (no `expect` field): PASS once `observe_ms` (default 5000) elapses with no `forbid` violation, PENDING while still observing.
- **Scenario-context tagging for `forbid.when`** — `forbid` entries are `{event, when}`; `when` matches against `hit.context` (set via `setScenarioContext`), may be omitted to match any context, and `event` may be `'*'` to match any event. Used to fail challenges like "must not fire on a failed form submit" without a real GTM-visible signal.

## Docs

- `docs/CHALLENGES.md` — the 18 problem statements a learner works through, grouped by level (Lv1 basics through Lv5 advanced).
- `docs/ANSWERS.md` — reference solutions. Don't read ahead of solving a challenge yourself.
- `docs/VERIFICATION.md` — how to confirm your GTM work: GTM Preview mode, GA4 DebugView, and reading the in-page grading panel / Hit Log.

## Deployment

`deploy.sh` deploys `site/` as-is to the production host (ConoHa Wing). Because of this, relative paths inside `site/` are load-bearing — never introduce an absolute `/assets/...` reference; it will break once uploaded to a subdirectory or different host root.
