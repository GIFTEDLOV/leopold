import { defineConfig, devices } from "@playwright/test";

import { SG5_LIVE_ACK, SG5_PAGE_ENABLE } from "./lib/sg5/protocol";

const live = process.env.SG5_LIVE_ACK === SG5_LIVE_ACK;
const outputDir = process.env.SG5_PLAYWRIGHT_OUTPUT_DIR ?? "/tmp/leopold-playwright";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "line",
  outputDir,
  use: {
    baseURL: "http://localhost:3000",
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.env.SG5_BROWSER_EXECUTABLE ? { executablePath: process.env.SG5_BROWSER_EXECUTABLE } : {}),
      },
    },
  ],
  webServer:
    process.env.SG5_EXTERNAL_SERVER === "1"
      ? undefined
      : {
          command: "pnpm dev --hostname 127.0.0.1 --port 3000",
          url: "http://localhost:3000/api/sg5-health",
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            SG5_PROBE_PAGE: SG5_PAGE_ENABLE,
            ...(live ? { SG5_LIVE_ACK } : { NEXT_PUBLIC_LEOPOLD_DEV_FIXTURE: "1" }),
          },
        },
});
