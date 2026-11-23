import { test, expect } from "@playwright/test";
import { loadWithContentScript, usdText, USD_LINE } from "../helpers/content-harness.mjs";

test.describe("cars.av.by — listing", () => {
  test.beforeEach(async ({ page }) => {
    await loadWithContentScript(page, {
      url: "https://cars.av.by/filter",
      fixture: "avby-listing.html",
    });
  });

  test("each price-primary block gets exactly one USD line", async ({ page }) => {
    await expect(page.locator(`[data-test="top-1"] ${USD_LINE}`)).toHaveText(usdText(67615));
    await expect(page.locator(`[data-test="item-1"] ${USD_LINE}`)).toHaveText(usdText(66863));
    await expect(page.locator(`[data-test="item-2"] ${USD_LINE}`)).toHaveText(usdText(56796));
  });

  test("amount and currency split across nodes is converted once", async ({ page }) => {
    const block = page.locator('[data-test="item-2"] .listing-item__price-primary');
    await expect(block.locator(USD_LINE)).toHaveCount(1);
    await expect(block).not.toContainText("~$56 796");
  });

  test("year, mileage, date and USD price are not converted", async ({ page }) => {
    for (const selector of [
      ".listing-item__params",
      ".listing-item__date",
      ".listing-item__price-secondary",
    ]) {
      await expect(page.locator(`${selector} ${USD_LINE}`)).toHaveCount(0);
    }
  });

  test("items added later are converted, existing ones are not duplicated", async ({ page }) => {
    await page.evaluate(() => {
      const item = document.querySelector('[data-test="item-1"]').cloneNode(true);
      item.dataset.test = "item-new";
      item.querySelector(".byn-usd-converted-line").remove();
      item.querySelector(".listing-item__price-primary").textContent = "30 000 руб.";
      document.querySelector('[data-test="items"]').appendChild(item);
    });
    await expect(page.locator(`[data-test="item-new"] ${USD_LINE}`)).toHaveText(usdText(30000));
    await expect(page.locator(`[data-test="item-1"] ${USD_LINE}`)).toHaveCount(1);
  });
});

test.describe("cars.av.by — ad page", () => {
  test("price-primary gets one USD line, params untouched", async ({ page }) => {
    await loadWithContentScript(page, {
      url: "https://cars.av.by/buick/encore-gx/139162288",
      fixture: "avby-ad.html",
    });
    await expect(page.locator(`[data-test="ad-price"] ${USD_LINE}`)).toHaveText(usdText(66863));
    await expect(page.locator(`.card__params ${USD_LINE}`)).toHaveCount(0);
    await expect(page.locator(`.card__title ${USD_LINE}`)).toHaveCount(0);
  });
});
