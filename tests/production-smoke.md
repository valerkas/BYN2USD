# BYN2USD tests

Two Playwright projects, both run by `npm test`.

## Unit (`tests/unit`, offline)

Run `src/content.js` / `src/background.js` against saved markup in
`tests/fixtures` with a stubbed `chrome.*` API and a fixed rate of 3 BYN/USD.

| Spec | Covers |
|------|--------|
| `kufar.spec.mjs` | Ad page (current hashed classes + legacy `adview_*_price`), sticky footer, similar ads, listing cards, price per m² skipped, «Договорная» skipped, cards added by infinite scroll |
| `avby.spec.mjs` | Listing + top listing + ad page, amount/currency split across nodes, year/mileage/date/USD price not converted, dynamically added items, no duplicates |
| `background.spec.mjs` | 12:00 Minsk refresh rule, NBRB URL fallback, cache hit without network, all URLs failing, unrelated messages |

## Production (`tests/production`, live)

Loads the extension (same file set as `scripts/package.ps1`) into Chromium
and opens real pages.

| Test | Pass when |
|------|-----------|
| NBRB API | `Cur_OfficialRate` between 1 and 10 |
| Extension service worker | `getRate(true)` resolves with a positive rate |
| av.by listing / ad page | `~$` line inside a price-primary block; BYN ÷ USD within 1 % of the NBRB rate |
| re.kufar.by listing | `~$` line inside BYR card price; none inside price per m² |
| re.kufar.by ad page | `~$` line inside the main ad price |

Failed production tests attach `markup-diagnostics.json` with the current
price CSS classes, so selector drift can be fixed straight from the report.

## Schedule

- GitHub Actions: `.github/workflows/production-smoke.yml`, Mondays 09:00 UTC,
  emails valerkas@gmail.com on failure.
- Agent: `.cursor/skills/production-check/SKILL.md` — run, triage, fix drift, report.
