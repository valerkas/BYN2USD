# Production smoke tests — BYN2USD

Manual / agent checklist against live sites. The Chrome extension itself is not injected in Cursor’s browser; these cases verify that **upstream APIs and DOM hooks** the extension relies on still work.

## Pass criteria (summary)

| ID | Area | Pass when |
|----|------|-----------|
| TC-NBRB | НБРБ API | At least one rate URL returns HTTP 200 and `Cur_OfficialRate` > 0 |
| TC-AV-LIST | av.by listing | ≥1 `.listing-item__price-primary` (or `[class*='__price-primary']`) with BYN currency text |
| TC-AV-DETAIL | av.by ad page | ≥1 price-primary block with BYN currency text |
| TC-KF-LIST | re.kufar.by listing | ≥1 BYR price via `[class*="price__byr"]`, `[class*="styles_price__byr"]`, or `[data-testid="card-price"]` |
| TC-KF-DETAIL | re.kufar.by ad | Main price context found (`price--main` / `adview_price` / `adview_*_price` / BYR selectors) with total BYN amount |
| TC-KF-METER | re.kufar.by | Meter / м² prices are distinguishable (`price__meter` / `styles_price__meter`) so they are not treated as the only main price |

Fail any case if the page hard-blocks (CAPTCHA / empty shell / login wall) and retry once with a different URL from the same site family.

---

## TC-NBRB — Official USD rate

**URLs (try in order):**

1. `https://www.nbrb.by/api/exrates/rates/USD?parammode=2`
2. `https://www.nbrb.by/api/exrates/rates/431?parammode=2`
3. `https://www.nbrb.by/api/exrates/rates/431`

**Steps:**

1. `GET` each URL until one succeeds.
2. Parse JSON; read `Cur_OfficialRate`.

**Expect:**

- Numeric rate, finite, `> 0` (typical band roughly 2–5 BYN per USD; do not hard-fail on band alone).
- Record which URL worked and the rate value.

---

## TC-AV-LIST — av.by search / listing

**Seed URL:** `https://cars.av.by/filter`

**Selectors (from `src/content.js`):**

- `.listing-item__price-primary`
- `.listing-top__price-primary`
- `[class*='__price-primary']`

**Currency tokens:** `р.`, `руб`, `BYN`, `бел. руб` (case-insensitive).

**Steps:**

1. Open the seed URL; wait for listing cards.
2. Count matching price-primary nodes.
3. Confirm at least one node’s text matches a currency token and a number.

**Expect:** count ≥ 1 with currency + amount.

---

## TC-AV-DETAIL — av.by listing detail

**Steps:**

1. From TC-AV-LIST, open the first ad link, **or** use any live `https://cars.av.by/...` ad URL.
2. Find price-primary block(s) on the detail page.
3. Confirm BYN currency + amount in that block.

**Expect:** ≥1 matching price-primary with currency.

---

## TC-KF-LIST — Kufar realty listing cards

**Seed URL:** `https://re.kufar.by/l/minsk/kupit/kvartiru`

**Selectors:**

- `[class*="price__byr"]`
- `[class*="styles_price__byr"]`
- `[data-testid="card-price"]`

**Steps:**

1. Open the seed URL; wait for cards (`[data-testid*="realty-card"]` or `a[href*="/vi/"]`).
2. Count BYR price nodes that contain a numeric amount.

**Expect:** count ≥ 1.

---

## TC-KF-DETAIL — Kufar realty ad page

**Steps:**

1. From TC-KF-LIST, open the first `/vi/` ad, **or** any live `https://re.kufar.by/vi/...` URL.
2. Check for main price context:
   - `[class*="price--main"]`
   - `[class*="adview_price"]`
   - `[class*="adview_mobile_price"]`
   - `[class*="adview_desktop_price"]`
   - or BYR selectors from TC-KF-LIST
3. Confirm a total price amount (not only empty shell).

**Expect:** main price context present with a total BYN amount.

---

## TC-KF-METER — Meter price is separate

**On the same ad or listing as TC-KF-LIST / TC-KF-DETAIL:**

1. Look for `[class*="price__meter"]` or `[class*="styles_price__meter"]`.
2. If none exist on this page, mark **N/A** (not fail).
3. If present, confirm meter nodes are **distinct** from main BYR / `price--main` nodes (different closest price container).

**Expect:** N/A or distinct meter vs main containers.

---

## Report template

```text
BYN2USD production smoke — <ISO date>
TC-NBRB:     PASS/FAIL — rate=<n> via <url>
TC-AV-LIST:  PASS/FAIL — pricePrimaryCount=<n>
TC-AV-DETAIL:PASS/FAIL — note=<…>
TC-KF-LIST:  PASS/FAIL — byrPriceCount=<n>
TC-KF-DETAIL:PASS/FAIL — note=<…>
TC-KF-METER: PASS/FAIL/N/A — note=<…>
Overall:     PASS if all non-N/A cases PASS
```

If a case fails because of markup drift, note the new class names / HTML snippet (short) so `src/content.js` selectors can be updated.
