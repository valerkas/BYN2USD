import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/report.json" }],
  ],
  use: {
    locale: "ru-BY",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "unit",
      testDir: "./tests/unit",
    },
    {
      name: "production",
      testDir: "./tests/production",
      retries: 1,
    },
  ],
});
