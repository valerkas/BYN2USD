import { test as base, chromium } from "@playwright/test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Same file set as scripts/package.ps1, so production tests exercise what gets published.
const PACKAGE_FILES = [
  "manifest.json",
  "icons/icon-16.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "src/background.js",
  "src/content.js",
  "src/popup.html",
  "src/popup.js",
];

export const test = base.extend({
  extensionDir: [
    async ({}, use) => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "byn2usd-ext-"));
      for (const rel of PACKAGE_FILES) {
        await cp(path.join(ROOT, rel), path.join(dir, rel), { recursive: true });
      }
      await use(dir);
      await rm(dir, { recursive: true, force: true });
    },
    { scope: "worker" },
  ],

  context: async ({ extensionDir }, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      locale: "ru-BY",
      viewport: { width: 1366, height: 900 },
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
      ],
    });
    await use(context);
    await context.close();
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },

  extensionWorker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent("serviceworker", { timeout: 15_000 });
    }
    await use(worker);
  },
});

export { expect } from "@playwright/test";
