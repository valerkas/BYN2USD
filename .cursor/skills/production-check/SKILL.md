---
name: production-check
description: >-
  Run BYN2USD production smoke checks against live НБРБ API, av.by, and
  re.kufar.by. Use when the user asks to check production, smoke-test live
  sites, verify selectors still match, regression-check after a site redesign,
  or run tests/production-smoke.md.
---

# Production check (BYN2USD)

## Goal

Verify that live dependencies the extension relies on still work. Follow
`tests/production-smoke.md` exactly. Do **not** expect the extension content
script to be injected in Cursor’s browser — check APIs + DOM hooks only.

## Workflow

1. Read `tests/production-smoke.md` for case IDs and pass criteria.
2. Run cases in this order: **TC-NBRB → TC-AV-LIST → TC-AV-DETAIL → TC-KF-LIST → TC-KF-DETAIL → TC-KF-METER**.
3. Prefer browser tools for site pages; for НБРБ use HTTP fetch (shell `curl` or fetch) first.
4. On CAPTCHA / empty app shell / login wall: retry once with another URL of the same site family, then mark FAIL with the blocker.
5. End with the report template from `tests/production-smoke.md` (PASS/FAIL per case + Overall).

## Seed URLs

| Case | URL |
|------|-----|
| TC-NBRB | `https://www.nbrb.by/api/exrates/rates/USD?parammode=2` (fallbacks in the test file) |
| TC-AV-LIST | `https://cars.av.by/filter` |
| TC-KF-LIST | `https://re.kufar.by/l/minsk/kupit/kvartiru` |

Detail cases: open the first real ad link from the listing page.

## Selector reference (must stay in sync with `src/content.js`)

**av.by price blocks**

```text
.listing-item__price-primary, .listing-top__price-primary, [class*='__price-primary']
```

**Kufar BYR / card**

```text
[class*="price__byr"], [class*="styles_price__byr"], [data-testid="card-price"]
```

**Kufar main (ad)**

```text
[class*="price--main"], [class*="adview_price"], [class*="adview_mobile_price"], [class*="adview_desktop_price"]
```

**Kufar meter (must stay distinct)**

```text
[class*="price__meter"], [class*="styles_price__meter"]
```

**Currency tokens:** `р.`, `руб`, `BYN`, `бел. руб` (case-insensitive).

## Browser probe (preferred)

After navigating and waiting for listings/ad content, evaluate DOM counts, e.g.:

```js
(() => {
  const av = document.querySelectorAll(
    ".listing-item__price-primary, .listing-top__price-primary, [class*='__price-primary']"
  );
  const byr = document.querySelectorAll(
    '[class*="price__byr"], [class*="styles_price__byr"], [data-testid="card-price"]'
  );
  const meter = document.querySelectorAll(
    '[class*="price__meter"], [class*="styles_price__meter"]'
  );
  const main = document.querySelectorAll(
    '[class*="price--main"], [class*="adview_mobile_price"], [class*="adview_desktop_price"]'
  );
  const sample = (nodes) =>
    [...nodes].slice(0, 3).map((el) =>
      (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)
    );
  return {
    avCount: av.length,
    byrCount: byr.length,
    meterCount: meter.length,
    mainCount: main.length,
    avSample: sample(av),
    byrSample: sample(byr),
    mainSample: sample(main)
  };
})()
```

## On failure

If selectors miss but prices are still visible:

1. Capture short class names / HTML around the price (≤300 chars).
2. Mark the case FAIL with “markup drift”.
3. Suggest concrete selector updates for `src/content.js` — do not change code unless the user asks.

## Output

Use only the report template from `tests/production-smoke.md`. Keep the chat summary to that report plus any drift notes.
