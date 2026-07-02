import { defineConfig, devices } from "@playwright/test";

// Runs against the composed stack: `docker compose up -d --build` first.
// Auth-dependent specs use /auth/test-login, which the backend only enables
// with ENVIRONMENT=test + AUTH_TEST_MODE=1 in .env.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // specs share one database
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
