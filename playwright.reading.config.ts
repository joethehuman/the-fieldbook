import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/reading",
  fullyParallel: false,
  workers: 1,
  outputDir: "test-results/reading",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/reading", open: "never" }],
  ],
  use: {
    baseURL: "http://localhost:3131",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "phone", use: { viewport: { width: 375, height: 812 } } },
  ],
  webServer: [
    {
      command: "node tests/accounts/backend.mjs",
      url: "http://127.0.0.1:3130/health",
      reuseExistingServer: false,
    },
    {
      command:
        "node --require ./tests/accounts/provider.cjs node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3131",
      url: "http://localhost:3131",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-test-key",
        SUPABASE_SECRET_KEY: "synthetic-secret",
        FIELDBOOK_URL: "http://localhost:3131",
        FIELDBOOK_OWNER_EMAIL: "admin@example.test",
        VERCEL_ENV: "",
        FIELDBOOK_ENVIRONMENT: "",
      },
    },
    {
      command:
        "node node_modules/serve/build/main.js demo/out -l 3132 --no-clipboard",
      url: "http://127.0.0.1:3132",
      reuseExistingServer: false,
    },
  ],
});
