import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const USD_LINE = ".byn-usd-converted-line";
export const TEST_RATE = 3;

export async function readFixture(name) {
  return readFile(path.join(ROOT, "tests", "fixtures", name), "utf8");
}

/**
 * Serves fixture HTML from the real hostname (content.js branches on
 * location.hostname), stubs chrome.runtime with a fixed rate, then injects
 * src/content.js the same way Chrome would at document_idle.
 */
export async function loadWithContentScript(page, { url, fixture, rate = TEST_RATE }) {
  const html = await readFixture(fixture);

  await page.route("**/*", (route) => {
    if (route.request().url() === url) {
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    }
    return route.abort();
  });

  await page.addInitScript((usdRate) => {
    Object.defineProperty(window, "chrome", {
      configurable: true,
      value: {
        runtime: {
          lastError: undefined,
          sendMessage(message, callback) {
            if (message?.type === "GET_USD_RATE") {
              setTimeout(() => callback({ ok: true, rate: usdRate }), 0);
            }
          },
        },
      },
    });
  }, rate);

  await page.goto(url);
  await page.addScriptTag({ path: path.join(ROOT, "src", "content.js") });
  await page.waitForFunction(() => document.getElementById("byn-usd-converted-style"));
}

export function usdText(byn, rate = TEST_RATE) {
  const [integerPart, fractionalPart] = (byn / rate).toFixed(2).split(".");
  return `~$${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${fractionalPart}`;
}
