/**
 * Live production checks: loads the packaged extension into Chromium and
 * verifies USD lines on real av.by / re.kufar.by pages. Requires internet.
 */
import { writeFile } from "node:fs/promises";
import { test, expect } from "../helpers/extension-fixture.mjs";

const USD_LINE = ".byn-usd-converted-line";
const NBRB_URL = "https://www.nbrb.by/api/exrates/rates/USD?parammode=2";
const RATE_TOLERANCE = 0.01;

const AV_PRICE = ".listing-item__price-primary, .listing-top__price-primary, [class*='__price-primary']";
const KF_CARD_PRICE = '[class*="price__byr"], [class*="styles_price__byr"], [data-testid="card-price"]';
const KF_AD_PRICE =
  '[class*="adview_price"], [class*="adview_mobile_price"], [class*="adview_desktop_price"], [class*="price--main"]';
const KF_METER = '[class*="price__meter"], [class*="styles_price__meter"]';

let nbrbRate;

test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext();
  const response = await request.get(NBRB_URL);
  if (response.ok()) {
    nbrbRate = Number((await response.json()).Cur_OfficialRate);
  }
  await request.dispose();
});

/** Collects price-related class names and HTML so markup drift can be fixed from the report. */
async function attachDiagnostics(page, testInfo) {
  const diagnostics = await page
    .evaluate(() => {
      const classes = new Set();
      for (const el of document.querySelectorAll('[class*="price"], [class*="adview"]')) {
        for (const c of String(el.className).split(/\s+/)) {
          if (/price|adview|_main|byr|meter/i.test(c)) classes.add(c);
        }
      }
      const priceTextNode = [...document.querySelectorAll("body *")].find(
        (el) => el.children.length === 0 && /^\s*\d[\d\s\u00A0\u202F]*\s*(р\.|руб)/i.test(el.textContent || "")
      );
      let snippet = null;
      if (priceTextNode) {
        let node = priceTextNode;
        for (let i = 0; i < 3 && node.parentElement; i++) node = node.parentElement;
        snippet = node.outerHTML.slice(0, 1500);
      }
      return {
        url: location.href,
        title: document.title,
        usdLines: document.querySelectorAll(".byn-usd-converted-line").length,
        priceClasses: [...classes].sort(),
        firstPriceSnippet: snippet,
      };
    })
    .catch((error) => ({ error: String(error) }));
  const file = testInfo.outputPath("markup-diagnostics.json");
  await writeFile(file, JSON.stringify(diagnostics, null, 2), "utf8");
  await testInfo.attach("markup-diagnostics.json", { path: file, contentType: "application/json" });
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await attachDiagnostics(page, testInfo);
  }
});

/** Returns [{ byn, usd }] for every USD line inside `scope`, parsed from the page. */
async function readConversions(page, scope) {
  return page.evaluate(
    ({ scope, usdLine }) => {
      const parseNumber = (s) => Number.parseFloat(s.replace(/[\s\u00A0\u202F]/g, "").replace(",", "."));
      return [...document.querySelectorAll(`:is(${scope}) ${usdLine}`)].map((line) => {
        const holder = line.closest(scope) ?? line.parentElement;
        const clone = holder.cloneNode(true);
        clone.querySelectorAll(usdLine).forEach((n) => n.remove());
        const bynMatch = clone.textContent.match(/(\d{1,3}(?:[\s\u00A0\u202F]\d{3})+|\d+)(?:[.,]\d{1,2})?\s*(?:р|руб|byn)/i);
        const usdMatch = line.textContent.match(/^~\$([\d\s.]+)$/);
        return {
          text: line.textContent,
          byn: bynMatch ? parseNumber(bynMatch[1]) : null,
          usd: usdMatch ? parseNumber(usdMatch[1]) : null,
        };
      });
    },
    { scope, usdLine: USD_LINE }
  );
}

function expectRateConsistent(conversions) {
  expect(conversions.length).toBeGreaterThan(0);
  for (const c of conversions.slice(0, 10)) {
    expect(c.usd, `malformed USD line "${c.text}"`).not.toBeNull();
    expect(c.byn, `could not read BYN amount next to "${c.text}"`).not.toBeNull();
    if (nbrbRate) {
      const impliedRate = c.byn / c.usd;
      expect(
        Math.abs(impliedRate - nbrbRate) / nbrbRate,
        `implied rate ${impliedRate.toFixed(4)} vs NBRB ${nbrbRate}`
      ).toBeLessThan(RATE_TOLERANCE);
    }
  }
}

async function firstHref(page, selector, pattern) {
  return page.evaluate(
    ({ selector, pattern }) => {
      const re = new RegExp(pattern);
      return [...document.querySelectorAll(selector)].map((a) => a.href).find((h) => re.test(h)) ?? null;
    },
    { selector, pattern }
  );
}

test("NBRB API returns the official USD rate", async () => {
  expect(nbrbRate, "NBRB rate unavailable").toBeGreaterThan(0);
  expect(nbrbRate).toBeGreaterThan(1);
  expect(nbrbRate).toBeLessThan(10);
});

test("extension service worker fetches and caches the rate", async ({ extensionWorker }) => {
  const response = await extensionWorker.evaluate(
    () =>
      new Promise((resolve) => {
        getRate(true).then(
          (rate) => resolve({ ok: true, rate }),
          (error) => resolve({ ok: false, error: String(error) })
        );
      })
  );
  expect(response.ok, response.error).toBe(true);
  expect(response.rate).toBeGreaterThan(0);
});

test.describe("cars.av.by", () => {
  test("listing shows USD next to BYN prices", async ({ page }) => {
    await page.goto("https://cars.av.by/filter", { waitUntil: "domcontentloaded" });
    await expect(page.locator(`:is(${AV_PRICE}) ${USD_LINE}`).first()).toBeVisible({ timeout: 30_000 });
    expectRateConsistent(await readConversions(page, AV_PRICE));
  });

  test("ad page shows USD next to the price", async ({ page }) => {
    await page.goto("https://cars.av.by/filter", { waitUntil: "domcontentloaded" });
    await page.locator(AV_PRICE).first().waitFor({ timeout: 30_000 });
    const adUrl = await firstHref(page, ".listing-item a[href]", "cars\\.av\\.by/.+/\\d+");
    expect(adUrl, "no ad link on listing").toBeTruthy();

    await page.goto(adUrl, { waitUntil: "domcontentloaded" });
    await expect(page.locator(`:is(${AV_PRICE}) ${USD_LINE}`).first()).toBeVisible({ timeout: 30_000 });
    expectRateConsistent(await readConversions(page, AV_PRICE));
  });
});

test.describe("re.kufar.by", () => {
  test("listing cards show USD, price per m² does not", async ({ page }) => {
    await page.goto("https://re.kufar.by/l/minsk/kupit/kvartiru", { waitUntil: "domcontentloaded" });
    await expect(page.locator(`:is(${KF_CARD_PRICE}) ${USD_LINE}`).first()).toBeVisible({ timeout: 30_000 });
    expectRateConsistent(await readConversions(page, KF_CARD_PRICE));
    await expect(page.locator(`:is(${KF_METER}) ${USD_LINE}`)).toHaveCount(0);
  });

  test("ad page shows USD next to the main price", async ({ page }) => {
    await page.goto("https://re.kufar.by/l/minsk/kupit/kvartiru", { waitUntil: "domcontentloaded" });
    await page.locator('a[href*="/vi/"]').first().waitFor({ timeout: 30_000 });
    const adUrl = await firstHref(page, 'a[href*="/vi/"]', "/vi/");
    expect(adUrl, "no ad link on listing").toBeTruthy();

    await page.goto(adUrl, { waitUntil: "domcontentloaded" });

    // Located by text, not by class, so a Kufar class rename cannot hide a missing USD line.
    await expect
      .poll(() => readTopmostBynPrice(page), {
        message: "first visible BYN price on the ad page has no ~$ line",
        timeout: 30_000,
      })
      .toMatchObject({ hasUsd: true });

    expectRateConsistent(await readConversions(page, KF_AD_PRICE));
  });
});

async function readTopmostBynPrice(page) {
  return page.evaluate((usdLine) => {
    const priceOnly = /^\s*\d{1,3}(?:[\s\u00A0\u202F]\d{3})*\s*р\.\s*$/;
    for (const el of document.querySelectorAll("body *")) {
      const ownText = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join("");
      if (!priceOnly.test(ownText)) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      return {
        text: ownText.trim(),
        className: String(el.className),
        hasUsd: Boolean(el.querySelector(usdLine) || el.parentElement?.querySelector(`:scope > ${usdLine}`)),
      };
    }
    return null;
  }, USD_LINE);
}
