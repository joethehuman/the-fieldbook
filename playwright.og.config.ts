import { defineConfig } from "@playwright/test";

const backendPort = process.env.FIELDBOOK_BACKEND_TEST_PORT || "3180";
const serverPort = process.env.FIELDBOOK_SERVER_TEST_PORT || "3181";
const demoPort = process.env.FIELDBOOK_DEMO_TEST_PORT || "3182";
process.env.FIELDBOOK_BACKEND_TEST_PORT = backendPort;
process.env.FIELDBOOK_DEMO_TEST_PORT = demoPort;

export default defineConfig({
  testDir: "./tests/reading",
  testMatch: "og-card.spec.ts",
  workers: 1,
  outputDir: "test-results/og",
  reporter: "list",
  use: { baseURL: `http://localhost:${serverPort}` },
  webServer: [
    {
      command: "node tests/accounts/backend.mjs",
      url: `http://127.0.0.1:${backendPort}/health`,
      reuseExistingServer: false,
      env: { FIELDBOOK_BACKEND_TEST_PORT: backendPort },
    },
    {
      command: "node --require ./tests/accounts/provider.cjs .next/standalone/server.js",
      url: `http://localhost:${serverPort}`,
      reuseExistingServer: false,
      env: {
        PORT: serverPort,
        HOSTNAME: "127.0.0.1",
        NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-test-key",
        SUPABASE_SECRET_KEY: "synthetic-secret",
        FIELDBOOK_URL: `http://localhost:${serverPort}`,
        FIELDBOOK_OWNER_EMAIL: "admin@example.test",
        FIELDBOOK_BACKEND_TEST_PORT: backendPort,
        VERCEL_ENV: "",
        FIELDBOOK_ENVIRONMENT: "",
      },
    },
    {
      command: `node node_modules/serve/build/main.js demo/out -l ${demoPort} --no-clipboard`,
      url: `http://127.0.0.1:${demoPort}`,
      reuseExistingServer: false,
    },
  ],
});
