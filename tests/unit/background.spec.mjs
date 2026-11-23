import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BACKGROUND_JS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
  "background.js"
);

const MINSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const minsk = (iso) => Date.parse(`${iso}Z`) - MINSK_OFFSET_MS;

/**
 * Loads src/background.js into a blank page with stubbed chrome.* and fetch.
 * `responses` maps NBRB URL -> { status, body }; unknown URLs return 404.
 */
async function loadBackground(page, { responses = {}, stored = {} } = {}) {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.evaluate(
    ({ responses, stored }) => {
      const storage = { ...stored };
      window.__storage = storage;
      window.__fetched = [];
      window.__listeners = { installed: [], message: [] };
      window.chrome = {
        storage: {
          local: {
            async get(keys) {
              return Object.fromEntries(keys.filter((k) => k in storage).map((k) => [k, storage[k]]));
            },
            async set(values) {
              Object.assign(storage, values);
            },
          },
        },
        runtime: {
          onInstalled: { addListener: (fn) => window.__listeners.installed.push(fn) },
          onMessage: { addListener: (fn) => window.__listeners.message.push(fn) },
        },
      };
      window.fetch = async (url) => {
        window.__fetched.push(url);
        const r = responses[url] ?? { status: 404, body: {} };
        return new Response(JSON.stringify(r.body), { status: r.status });
      };
      window.__ask = (message) =>
        new Promise((resolve) => {
          window.__listeners.message[0](message, {}, resolve);
        });
    },
    { responses, stored }
  );
  await page.addScriptTag({ path: BACKGROUND_JS });
}

test.describe("background — daily refresh at 12:00 Minsk", () => {
  const cases = [
    { name: "never fetched", updated: 0, now: "2026-11-23T09:00:00", expected: true },
    { name: "before noon, fetched yesterday", updated: "2026-11-22T15:00:00", now: "2026-11-23T11:59:00", expected: false },
    { name: "after noon, fetched this morning", updated: "2026-11-23T09:00:00", now: "2026-11-23T12:30:00", expected: true },
    { name: "after noon, already fetched after noon", updated: "2026-11-23T12:10:00", now: "2026-11-23T18:00:00", expected: false },
    { name: "after noon, fetched yesterday", updated: "2026-11-22T15:00:00", now: "2026-11-23T13:00:00", expected: true },
  ];

  for (const c of cases) {
    test(c.name, async ({ page }) => {
      await loadBackground(page);
      const updatedAt = c.updated ? minsk(c.updated) : 0;
      const result = await page.evaluate(
        ([u, n]) => shouldRefreshAtMinskNoon(u, n),
        [updatedAt, minsk(c.now)]
      );
      expect(result).toBe(c.expected);
    });
  }
});

test.describe("background — GET_USD_RATE", () => {
  test("falls back to the next NBRB URL and caches the rate", async ({ page }) => {
    await loadBackground(page, {
      responses: {
        "https://www.nbrb.by/api/exrates/rates/USD?parammode=2": { status: 500, body: {} },
        "https://www.nbrb.by/api/exrates/rates/431?parammode=2": {
          status: 200,
          body: { Cur_OfficialRate: 2.997 },
        },
      },
    });

    const response = await page.evaluate(() => window.__ask({ type: "GET_USD_RATE" }));
    expect(response).toEqual({ ok: true, rate: 2.997 });

    const storage = await page.evaluate(() => window.__storage);
    expect(storage.usdRate).toBe(2.997);
    expect(storage.usdRateUpdatedAt).toBeGreaterThan(0);
  });

  test("serves a fresh cached rate without hitting the network", async ({ page }) => {
    await loadBackground(page, { stored: { usdRate: 3.1, usdRateUpdatedAt: Date.now() } });

    const response = await page.evaluate(() => window.__ask({ type: "GET_USD_RATE" }));
    expect(response).toEqual({ ok: true, rate: 3.1 });
    expect(await page.evaluate(() => window.__fetched)).toEqual([]);
  });

  test("reports an error when every NBRB URL fails", async ({ page }) => {
    await loadBackground(page);
    const response = await page.evaluate(() => window.__ask({ type: "GET_USD_RATE" }));
    expect(response.ok).toBe(false);
    expect(response.error).toMatch(/NBRB request failed/);
  });

  test("ignores unrelated messages", async ({ page }) => {
    await loadBackground(page);
    const handled = await page.evaluate(() => window.__listeners.message[0]({ type: "OTHER" }, {}, () => {}));
    expect(handled).toBe(false);
  });
});
