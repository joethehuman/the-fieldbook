import { defineConfig } from "@playwright/test";
const demoPort = Number(process.env.FIELDBOOK_TEST_PORT || 3157);
const serverPort = Number(process.env.FIELDBOOK_SERVER_TEST_PORT || 3158);
export default defineConfig({
  testDir: "./tests/guests",
  outputDir: "test-results/guests",
  fullyParallel: true,
  workers: 2,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/guests", open: "never" }],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [
    {
      name: "demo-desktop",
      use: {
        baseURL: `http://127.0.0.1:${demoPort}`,
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "demo-phone",
      use: {
        baseURL: `http://127.0.0.1:${demoPort}`,
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: "production-desktop",
      use: {
        baseURL: `http://127.0.0.1:${serverPort}`,
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "production-phone",
      use: {
        baseURL: `http://127.0.0.1:${serverPort}`,
        viewport: { width: 375, height: 812 },
      },
    },
  ],
  webServer: [
    {
      command: `node node_modules/serve/build/main.js out -l ${demoPort} --no-clipboard`,
      url: `http://127.0.0.1:${demoPort}`,
      reuseExistingServer: false,
    },
    {
      command: `node node_modules/next/dist/bin/next start production -H 127.0.0.1 -p ${serverPort}`,
      url: `http://127.0.0.1:${serverPort}`,
      reuseExistingServer: false,
    },
  ],
});
