import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// Sin PLAYWRIGHT_BASE_URL (uso local) arrancamos el dev server de Vite nosotros mismos.
// En CI, el workflow ya levanto `vite preview` sobre el build de produccion y nos pasa su URL --
// asi el nightly mide contra el mismo bundle minificado que se despliega, no contra el dev server.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
});
