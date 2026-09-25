import { defineConfig } from "@playwright/test";
const demoPort = Number(process.env.FIELDBOOK_TEST_PORT || 3127);
const serverPort = Number(process.env.FIELDBOOK_SERVER_TEST_PORT || 3128);
export default defineConfig({
  testDir: "./tests/authoring",
  outputDir: "test-results/authoring",
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/authoring", open: "never" }],
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
      command: "node tests/accounts/backend.mjs",
      url: "http://127.0.0.1:3130/health",
      reuseExistingServer: false,
    },
    {
      command: `node node_modules/serve/build/main.js out -l ${demoPort} --no-clipboard`,
      url: `http://127.0.0.1:${demoPort}`,
      reuseExistingServer: false,
    },
    {
      command: `node --require ./tests/accounts/provider.cjs node_modules/next/dist/bin/next start production -H 127.0.0.1 -p ${serverPort}`,
      url: `http://127.0.0.1:${serverPort}`,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-test-key",
        SUPABASE_SECRET_KEY: "synthetic-secret",
        FIELDBOOK_URL: `http://127.0.0.1:${serverPort}`,
        FIELDBOOK_OWNER_EMAIL: "admin@example.test",
        VERCEL_ENV: "",
        FIELDBOOK_ENVIRONMENT: "",
      },
    },
  ],
});
