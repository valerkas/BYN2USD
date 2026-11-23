import { test, expect } from "@playwright/test";
import { loadWithContentScript, usdText, USD_LINE } from "../helpers/content-harness.mjs";

test.describe("re.kufar.by — ad page (current markup)", () => {
  test.beforeEach(async ({ page }) => {
    await loadWithContentScript(page, {
      url: "https://re.kufar.by/vi/minskij-rajon/kupit/dom/1096455604",
      fixture: "kufar-ad.html",
    });
  });

  test("main price gets exactly one USD line", async ({ page }) => {
    const lines = page.locator(`[data-test="ad-price"] ${USD_LINE}`);
    await expect(lines).toHaveCount(1);
    await expect(lines).toHaveText(usdText(119880));
  });

  test("sticky footer price gets a USD line", async ({ page }) => {
    const lines = page.locator(`[data-test="footer-price"] ${USD_LINE}`);
    await expect(lines).toHaveCount(1);
    await expect(lines).toHaveText(usdText(119880));
  });

  test("similar ads are converted, 'Договорная' is not", async ({ page }) => {
    const similar = page.locator('[data-test="similar"]');
    await expect(similar.locator(USD_LINE)).toHaveCount(1);
    await expect(similar.locator(USD_LINE)).toHaveText(usdText(170700));
  });

  test("params and credit calculator are left alone", async ({ page }) => {
    await expect(page.locator(`[data-test="params"] ${USD_LINE}`)).toHaveCount(0);
    await expect(page.locator(`[data-test="credit"] ${USD_LINE}`)).toHaveCount(0);
  });

  test("USD line is rendered inline next to the price", async ({ page }) => {
    const display = await page
      .locator(`[data-test="ad-price"] ${USD_LINE}`)
      .evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe("inline");
  });
});

test.describe("re.kufar.by — ad page (legacy markup)", () => {
  test.beforeEach(async ({ page }) => {
    await loadWithContentScript(page, {
      url: "https://re.kufar.by/vi/minsk/kupit/kvartiru/1087125430",
      fixture: "kufar-ad-legacy.html",
    });
  });

  for (const widget of ["mobile-price", "desktop-price"]) {
    test(`${widget}: total converted once, price per m² skipped`, async ({ page }) => {
      const lines = page.locator(`[data-test="${widget}"] ${USD_LINE}`);
      await expect(lines).toHaveCount(1);
      await expect(lines).toHaveText(usdText(148202));
      await expect(page.locator(`[data-test="${widget}"] [class*="price__meter"] ${USD_LINE}`)).toHaveCount(0);
    });
  }
});

test.describe("re.kufar.by — listing cards", () => {
  test.beforeEach(async ({ page }) => {
    await loadWithContentScript(page, {
      url: "https://re.kufar.by/l/minsk/kupit/kvartiru",
      fixture: "kufar-listing.html",
    });
  });

  test("each card converts its total BYR price once", async ({ page }) => {
    await expect(page.locator(`[data-test="card-1"] ${USD_LINE}`)).toHaveText(usdText(148202));
    await expect(page.locator(`[data-test="card-2"] ${USD_LINE}`)).toHaveText(usdText(241600));
  });

  test("price per m² is never converted", async ({ page }) => {
    await expect(page.locator(`[class*="price__meter"] ${USD_LINE}`)).toHaveCount(0);
  });

  test("'Договорная' card has no USD line", async ({ page }) => {
    await expect(page.locator(`[data-test="card-3"] ${USD_LINE}`)).toHaveCount(0);
  });

  test("cards added later (infinite scroll) are converted", async ({ page }) => {
    await page.evaluate(() => {
      const card = document.querySelector('[data-test="card-2"]').cloneNode(true);
      card.dataset.test = "card-new";
      card.querySelector('[class*="price__byr"]').textContent = "90 000 р.";
      card.querySelector('[class*="price__meter"]').textContent = "2 000 р./м²";
      document.querySelector("main").appendChild(card);
    });
    await expect(page.locator(`[data-test="card-new"] ${USD_LINE}`)).toHaveText(usdText(90000));
  });
});
