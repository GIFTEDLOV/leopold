#!/usr/bin/env node
const { chromium } = require("/home/dell/zama-szn4/frontend/node_modules/@playwright/test");
try { const executable = chromium.executablePath(); process.stdout.write(`${JSON.stringify({ schema: "zama-szn4.sg5-preflight.v2", playwrightApi: "AVAILABLE", managedBrowser: "AVAILABLE", browser: executable, status: "READY" })}\n`); } catch { process.stdout.write(`${JSON.stringify({ schema: "zama-szn4.sg5-preflight.v2", status: "BLOCKED_NO_BROWSER" })}\n`); process.exitCode = 1; }
