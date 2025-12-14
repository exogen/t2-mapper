import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer, { type KeyInput } from "puppeteer";
import { parseArgs } from "node:util";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const { values, positionals } = parseArgs({
  options: {
    camera: {
      type: "string",
      default: "1",
    },
    debug: {
      type: "boolean",
      default: false,
    },
    "no-fog": {
      type: "boolean",
      default: false,
    },
  },
  allowPositionals: true,
});

const missionName = positionals[0];
const cameraNumber = parseInt(values.camera, 10);
const debugMode = values.debug;
const fogEnabled = !values["no-fog"];

if (!missionName) {
  console.error(
    "Usage: npx tsx scripts/screenshot.ts <missionName> [cameraNumber]",
  );
  console.error("Example: npx tsx scripts/screenshot.ts TWL2_WoodyMyrk 1");
  process.exit(1);
}

const cameraKey = String(cameraNumber) as KeyInput;
const outputType = "png";

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 600 });

const baseUrl = `http://localhost:3000/t2-mapper/?mission=${encodeURIComponent(missionName)}`;

await page.evaluateOnNewDocument(
  (debugMode, fogEnabled) => {
    localStorage.setItem(
      "settings",
      JSON.stringify({
        fov: 80,
        audioEnabled: false,
        animationEnabled: false,
        debugMode,
        fogEnabled,
      }),
    );
  },
  debugMode,
  fogEnabled,
);

console.log(`Loading: ${baseUrl}`);
await page.goto(baseUrl, { waitUntil: "load" });
await page.waitForNetworkIdle({ idleTime: 500 });

const mapViewer = await page.waitForSelector("canvas");
if (!mapViewer) {
  console.error("Could not find canvas element");
  process.exit(1);
}
await sleep(50);

// Close the popover by pressing Escape
await page.keyboard.press("Escape");
await sleep(50);

// Hide controls from screenshots while keeping them selectable
await page.$eval("#controls", (el: HTMLElement) => {
  el.style.visibility = "hidden";
});

// Wait for mission to load
await page.waitForSelector("#loadingIndicator", { hidden: true });
await sleep(500);

// Select the camera
console.log(`Selecting camera: ${cameraNumber}`);
await mapViewer.press(cameraKey);
await page.waitForNetworkIdle({ idleTime: 250 });
await sleep(100);

const date = new Date();
const tempDir = path.join(os.tmpdir(), "t2-mapper");

await fs.mkdir(tempDir, { recursive: true });
const filePrefix = date.toISOString().replace(/([:-]|\..*$)/g, "");
const outputPath = path.join(
  tempDir,
  `${filePrefix}.${missionName}.${cameraNumber}.${outputType}`,
);

// Take screenshot
await mapViewer.screenshot({
  path: outputPath,
  type: outputType,
});

console.log(`Screenshot saved to: ${outputPath}`);

await Promise.race([
  browser.close(),
  sleep(3000).then(() => browser.process()?.kill("SIGKILL")),
]);
