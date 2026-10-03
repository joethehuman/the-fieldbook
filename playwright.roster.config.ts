import { defineConfig } from "@playwright/test";
import authoring from "./playwright.authoring.config";
export default defineConfig({
  ...authoring,
  testDir: "./tests/roster",
  outputDir: "test-results/roster",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/roster", open: "never" }],
  ],
  projects: [
    ...authoring.projects!,
    {
      name: "demo-phone",
      use: {
        baseURL: `http://127.0.0.1:${process.env.FIELDBOOK_TEST_PORT || 3127}`,
        viewport: { width: 375, height: 812 },
      },
    },
  ],
});
