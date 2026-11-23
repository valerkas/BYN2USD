---
name: production-check
description: >-
  Run the BYN2USD automated test suite (offline unit tests + live production
  tests against НБРБ API, av.by and re.kufar.by with the packaged extension
  loaded), triage failures, and fix markup drift. Use when the user or a
  scheduled automation asks to check production, run weekly tests, smoke-test
  live sites, verify selectors after a site redesign, or "проверь прод".
---

# Production check (BYN2USD)

Designed to run unattended (e.g. weekly). Everything goes through `npm`; the
browser tools are only for diagnosing failures.

## 1. Setup (once per environment)

```bash
npm ci
npx playwright install chromium   # add --with-deps on Linux CI
```

## 2. Run

```bash
npm run test:unit         # offline: fixtures in tests/fixtures, ~10 s
npm run test:production   # live sites, extension loaded from the package file set
```

Run unit first. If unit fails, the code is broken — stop and fix that before
looking at production.

Results: console + `test-results/report.json`. Each failed production test
writes `test-results/<test-name>/markup-diagnostics.json` (URL, page title,
number of `~$` lines, current price CSS classes, HTML around the first BYN
price) next to its screenshot and trace.

## 3. Triage a production failure

Classify each failed test before touching code:

| Symptom in report / diagnostics | Cause | Action |
|---|---|---|
| `NBRB rate unavailable`, service-worker test fails | НБРБ API down or changed | Retry once later; if JSON shape changed, fix `src/background.js` |
| `title` is a CAPTCHA / access denied / empty, `priceClasses` empty | Site blocked the runner | Not a code bug. Report as BLOCKED, rerun later |
| Prices visible, `usdLines: 0`, new class names in `priceClasses` | **Markup drift** | Fix selectors (step 4) |
| `implied rate … vs NBRB` | Wrong amount parsed (e.g. m² price, split nodes) | Fix parsing in `src/content.js`, add fixture case |
| `malformed USD line` | Formatting regression | Fix `formatUsd` / regexes |

When diagnostics are not enough, open the failing URL with the browser tools
and inspect the DOM around the price.

## 4. Fix markup drift

1. Update the selectors in `src/content.js` (`AV_BY_PRICE_BLOCK_SELECTOR`,
   `isKufarMainPriceContext`, `getKufarConversionGroup`, inline CSS in
   `ensureUsdLineStyle`). Keep old selectors — Kufar A/B-tests layouts.
2. Add a fixture in `tests/fixtures/` copying the new markup (strip it to the
   price block + a few neighbours that must NOT be converted), and a test in
   `tests/unit/` asserting the expected `~$` text.
3. Keep the selector constants at the top of `tests/production/live.spec.mjs`
   in sync.
4. `npm run test:unit`, then `npm run test:production` — both must pass.

Do not bump the version, build the zip, commit or push unless the run
instructions explicitly ask for it.

## 5. Report

End with exactly this block:

```text
BYN2USD weekly check — <YYYY-MM-DD>
Unit:        PASS | FAIL (<n> failed)
NBRB:        PASS | FAIL — rate=<value>
av.by:       PASS | FAIL | BLOCKED — <short note>
re.kufar.by: PASS | FAIL | BLOCKED — <short note>
Fix:         none | <files changed, one line>
Overall:     PASS | FAIL | BLOCKED
```
