import { defineConfig, devices } from "@playwright/test";

import { SG5_DYNAMIC_ASSET_ORIGINS_RESOLVED, SG5_LIVE_ACK, SG5_PAGE_ENABLE } from "./lib/sg5/protocol";

const liveRequested = process.env.SG5_LIVE_ACK === SG5_LIVE_ACK;
const externalServer = process.env.SG5_EXTERNAL_SERVER === "1";
const browserExecutable = process.env.SG5_BROWSER_EXECUTABLE;
const outputDir = process.env.SG5_PLAYWRIGHT_OUTPUT_DIR;

if (liveRequested && !SG5_DYNAMIC_ASSET_ORIGINS_RESOLVED) {
  throw new Error("SG-5 live execution is blocked until exact public-key and CRS origins are reviewed and committed");
}
if (!outputDir) throw new Error("SG-5 Playwright must be launched with a private output directory");

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
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(browserExecutable ? { executablePath: browserExecutable } : {}) },
    },
  ],
  webServer: externalServer
    ? undefined
    : {
        command: "pnpm dev --hostname 127.0.0.1 --port 3000",
        url: "http://localhost:3000/api/sg5-health",
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          SG5_PROBE_PAGE: SG5_PAGE_ENABLE,
          ...(liveRequested ? { SG5_LIVE_ACK } : {}),
        },
      },
});
