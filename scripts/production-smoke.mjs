/**
 * Production smoke for BYN2USD — mirrors tests/production-smoke.md
 * Exit 0 = all non-N/A cases pass; exit 1 = any failure.
 */
import { chromium } from "playwright";

const CURRENCY_RE = /р\.?|руб|byn|бел/i;
const AV_PRICE =
  ".listing-item__price-primary, .listing-top__price-primary, [class*='__price-primary']";
const KF_BYR =
  '[class*="price__byr"], [class*="styles_price__byr"], [data-testid="card-price"]';
const KF_MAIN =
  '[class*="price--main"], [class*="adview_price"], [class*="adview_mobile_price"], [class*="adview_desktop_price"]';
const KF_METER =
  '[class*="price__meter"], [class*="styles_price__meter"]';

const NBRB_URLS = [
  "https://www.nbrb.by/api/exrates/rates/USD?parammode=2",
  "https://www.nbrb.by/api/exrates/rates/431?parammode=2",
  "https://www.nbrb.by/api/exrates/rates/431",
];

const results = [];

function record(id, status, note) {
  results.push({ id, status, note });
  console.log(`${id}: ${status} — ${note}`);
}

async function checkNbrb() {
  for (const url of NBRB_URLS) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const payload = await res.json();
      const rate = Number(payload?.Cur_OfficialRate);
      if (Number.isFinite(rate) && rate > 0) {
        record("TC-NBRB", "PASS", `rate=${rate} via ${url}`);
        return;
      }
    } catch {
      // try next
    }
  }
  record("TC-NBRB", "FAIL", "no URL returned a positive Cur_OfficialRate");
}

async function countMatching(page, selector, requireCurrency) {
  return page.evaluate(
    ({ selector, requireCurrency, currencySource }) => {
      const currency = new RegExp(currencySource, "i");
      const nodes = [...document.querySelectorAll(selector)];
      const matched = requireCurrency
        ? nodes.filter((el) => currency.test(el.textContent || ""))
        : nodes;
      const sample = matched
        .slice(0, 3)
        .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80));
      return { count: matched.length, sample };
    },
    { selector, requireCurrency, currencySource: CURRENCY_RE.source }
  );
}

async function firstHref(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el?.href ?? null;
  }, selector);
}

async function withRetry(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`${label} first attempt failed: ${err.message}`);
    return fn();
  }
}

async function checkAvBy(browser) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    locale: "ru-BY",
  });
  const page = await context.newPage();

  await withRetry("TC-AV-LIST", async () => {
    await page.goto("https://cars.av.by/filter", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(2500);
  });

  const list = await countMatching(page, AV_PRICE, true);
  if (list.count >= 1) {
    record("TC-AV-LIST", "PASS", `pricePrimaryCount=${list.count}; sample=${JSON.stringify(list.sample)}`);
  } else {
    record("TC-AV-LIST", "FAIL", `pricePrimaryCount=0; sample=${JSON.stringify(list.sample)}`);
  }

  const adHref =
    (await firstHref(page, ".listing-item a[href]")) ||
    (await firstHref(page, 'a[href*="cars.av.by"]'));

  if (!adHref) {
    record("TC-AV-DETAIL", "FAIL", "no ad link found from listing");
  } else {
    await withRetry("TC-AV-DETAIL", async () => {
      await page.goto(adHref, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(2500);
    });
    const detail = await countMatching(page, AV_PRICE, true);
    if (detail.count >= 1) {
      record(
        "TC-AV-DETAIL",
        "PASS",
        `pricePrimaryCount=${detail.count}; url=${adHref}; sample=${JSON.stringify(detail.sample)}`
      );
    } else {
      record(
        "TC-AV-DETAIL",
        "FAIL",
        `pricePrimaryCount=0; url=${adHref}; sample=${JSON.stringify(detail.sample)}`
      );
    }
  }

  await context.close();
}

async function checkKufar(browser) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    locale: "ru-BY",
  });
  const page = await context.newPage();

  await withRetry("TC-KF-LIST", async () => {
    await page.goto("https://re.kufar.by/l/minsk/kupit/kvartiru", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(3000);
  });

  const list = await countMatching(page, KF_BYR, true);
  if (list.count >= 1) {
    record("TC-KF-LIST", "PASS", `byrPriceCount=${list.count}; sample=${JSON.stringify(list.sample)}`);
  } else {
    record("TC-KF-LIST", "FAIL", `byrPriceCount=0; sample=${JSON.stringify(list.sample)}`);
  }

  const meter = await countMatching(page, KF_METER, false);
  if (meter.count === 0) {
    record("TC-KF-METER", "N/A", "no meter price nodes on listing");
  } else if (list.count >= 1) {
    const distinct = await page.evaluate(
      ({ byrSel, meterSel }) => {
        const byr = document.querySelector(byrSel);
        const met = document.querySelector(meterSel);
        if (!byr || !met) return false;
        return byr.closest('[class*="price"]') !== met.closest('[class*="price"]');
      },
      { byrSel: KF_BYR, meterSel: KF_METER }
    );
    record(
      "TC-KF-METER",
      distinct ? "PASS" : "FAIL",
      `meterCount=${meter.count}; distinctFromByr=${distinct}`
    );
  } else {
    record("TC-KF-METER", "FAIL", `meterCount=${meter.count} but no BYR nodes to compare`);
  }

  const adHref = await firstHref(page, 'a[href*="/vi/"]');
  if (!adHref) {
    record("TC-KF-DETAIL", "FAIL", "no /vi/ ad link from listing");
  } else {
    await withRetry("TC-KF-DETAIL", async () => {
      await page.goto(adHref, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForTimeout(3000);
    });
    const main = await countMatching(page, KF_MAIN, true);
    const byr = await countMatching(page, KF_BYR, true);
    const ok = main.count >= 1 || byr.count >= 1;
    record(
      "TC-KF-DETAIL",
      ok ? "PASS" : "FAIL",
      `mainCount=${main.count}; byrCount=${byr.count}; url=${adHref}; sample=${JSON.stringify(main.sample.length ? main.sample : byr.sample)}`
    );
  }

  await context.close();
}

function printReport() {
  console.log("\n--- BYN2USD production smoke report ---");
  for (const r of results) {
    console.log(`${r.id}: ${r.status} — ${r.note}`);
  }
  const failed = results.filter((r) => r.status === "FAIL");
  const overall = failed.length === 0 ? "PASS" : "FAIL";
  console.log(`Overall: ${overall}`);
  return failed.length === 0;
}

async function main() {
  await checkNbrb();

  const browser = await chromium.launch({ headless: true });
  try {
    await checkAvBy(browser);
    await checkKufar(browser);
  } finally {
    await browser.close();
  }

  const ok = printReport();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke runner crashed:", err);
  process.exit(1);
});
