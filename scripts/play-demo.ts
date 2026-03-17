import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer";
import { parseArgs } from "node:util";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const { values, positionals } = parseArgs({
  options: {
    headless: {
      type: "boolean",
      default: true,
    },
    wait: {
      type: "string",
      default: "10",
      short: "w",
    },
    screenshot: {
      type: "boolean",
      default: false,
      short: "s",
    },
  },
  allowPositionals: true,
});

const demoPath = positionals[0];
const headless = values.headless;
const waitSeconds = parseInt(values.wait!, 10);
const takeScreenshot = values.screenshot;

if (!demoPath) {
  console.error("Usage: npx tsx scripts/play-demo.ts [options] <demo.rec>");
  console.error();
  console.error("Options:");
  console.error("  --no-headless    Show the browser window");
  console.error(
    "  --wait, -w <s>   Seconds to wait after loading (default: 10)",
  );
  console.error("  --screenshot, -s Take a screenshot after loading");
  console.error();
  console.error("Examples:");
  console.error(
    "  npx tsx scripts/play-demo.ts ~/Projects/t2-demo-parser/demo022.rec",
  );
  console.error(
    "  npx tsx scripts/play-demo.ts --no-headless -w 30 ~/Projects/t2-demo-parser/demo022.rec",
  );
  process.exit(1);
}

const absoluteDemoPath = path.resolve(demoPath);

const browser = await puppeteer.launch({ headless });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 600 });

// Capture all console output from the page, serializing object arguments.
page.on("console", async (msg) => {
  const type = msg.type();
  const prefix =
    type === "error" ? "ERROR" : type === "warn" ? "WARN" : type.toUpperCase();
  const args = msg.args();
  const parts: string[] = [];
  for (const arg of args) {
    try {
      const val = await arg.jsonValue();
      parts.push(typeof val === "string" ? val : JSON.stringify(val));
    } catch {
      parts.push(msg.text());
      break;
    }
  }
  console.log(`[browser ${prefix}] ${parts.join(" ")}`);
});

page.on("pageerror", (err: unknown) => {
  console.error(`[browser EXCEPTION] ${(err as Error).message}`);
});

// Set up settings before navigating.
await page.evaluateOnNewDocument(() => {
  localStorage.setItem(
    "settings",
    JSON.stringify({
      fov: 80,
      audioEnabled: false,
      animationEnabled: false,
      debugMode: false,
      fogEnabled: true,
    }),
  );
});

const baseUrl = "http://localhost:3000/t2-mapper/";
console.log(`Loading: ${baseUrl}`);
await page.goto(baseUrl, { waitUntil: "load" });
await page.waitForNetworkIdle({ idleTime: 500 });

// Close any popover by pressing Escape.
await page.keyboard.press("Escape");
await sleep(100);

// Hide controls from screenshots.
await page.$eval("#controls", (el) => {
  (el as HTMLElement).style.visibility = "hidden";
});

// Upload the demo file via the hidden file input.
console.log(`Loading demo: ${absoluteDemoPath}`);
const fileInput = await page.waitForSelector(
  'input[type="file"][accept=".rec"]',
);
if (!fileInput) {
  console.error("Could not find demo file input");
  await browser.close();
  process.exit(1);
}
await fileInput.uploadFile(absoluteDemoPath);

// Wait for the mission to load (demo triggers a mission switch).
console.log("Waiting for mission to load...");
await sleep(2000);
try {
  await page.waitForSelector("#loadingIndicator", {
    hidden: true,
    timeout: 30000,
  });
} catch {
  console.warn(
    "Loading indicator did not disappear within 30s, continuing anyway",
  );
}
await page.waitForNetworkIdle({ idleTime: 1000 });
await sleep(1000);

// Dismiss any popovers and start playback via JS to avoid triggering UI menus.
await page.evaluate(() => {
  // Close any Radix popover by removing it from DOM.
  document
    .querySelectorAll("[data-radix-popper-content-wrapper]")
    .forEach((el) => el.remove());
});
await sleep(200);

// Seek forward if requested via SEEK env var.
const seekTo = process.env.SEEK ? parseFloat(process.env.SEEK) : null;
if (seekTo != null) {
  console.log(`Seeking to ${seekTo}s...`);
  await page.evaluate((t: number) => {
    const input = document.querySelector('input[type="range"]');
    if (input) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      nativeInputValueSetter.call(input, String(t));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, seekTo);
  await sleep(500);
}

// Click play button directly.
await page.evaluate(() => {
  const playBtn = document.querySelector('button[aria-label="Play"]');
  if (playBtn) {
    (playBtn as HTMLButtonElement).click();
  }
});
await sleep(500);
console.log("Started playback.");

console.log(`Demo loaded. Waiting ${waitSeconds}s for console output...`);
await sleep(waitSeconds * 1000);

// Inspect the Three.js scene for entity groups.
const sceneInfo = await page.evaluate(() => {
  const scene = (window as any).__THREE_SCENE__;
  if (!scene) return "No scene found (window.__THREE_SCENE__ not set)";

  const results: string[] = [];
  scene.traverse((obj: any) => {
    if (
      obj.name &&
      (obj.name.startsWith("player_") ||
        obj.name.startsWith("vehicle_") ||
        obj.name.startsWith("item_") ||
        obj.name === "camera")
    ) {
      const pos = obj.position;
      const childCount = obj.children?.length ?? 0;
      results.push(
        `${obj.name}: pos=(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) children=${childCount} visible=${obj.visible}`,
      );
    }
  });

  // Check AnimationMixer state.
  let mixerInfo = "No mixer found";
  scene.traverse((obj: any) => {
    // The root group of StreamPlayback is the direct parent of entity groups.
    if (obj.children?.some((c: any) => c.name?.startsWith("player_"))) {
      // This is the root group. Check for active animations.
      const animations = (obj as any)._mixer;
      mixerInfo = `Root group found. Has _mixer: ${!!animations}`;
    }
  });

  const entityCount = results.length;
  const summary = `Found ${entityCount} entity groups. ${mixerInfo}`;
  return [summary, ...results.slice(0, 5)].join("\n");
});

console.log("[scene]", sceneInfo);

if (takeScreenshot) {
  // Remove any popovers that might be covering the canvas.
  await page.evaluate(() => {
    document
      .querySelectorAll("[data-radix-popper-content-wrapper]")
      .forEach((el) => el.remove());
  });

  const canvas = await page.waitForSelector("canvas");
  if (canvas) {
    const tempDir = path.join(os.tmpdir(), "t2-mapper");
    await fs.mkdir(tempDir, { recursive: true });
    const demoName = path.basename(absoluteDemoPath, ".rec");
    const date = new Date().toISOString().replace(/([:-]|\..*$)/g, "");
    const outputPath = path.join(tempDir, `${date}.demo.${demoName}.png`);
    await canvas.screenshot({ path: outputPath, type: "png" });
    console.log(`Screenshot saved to: ${outputPath}`);
  }
}

console.log("Done.");
await Promise.race([
  browser.close(),
  sleep(3000).then(() => browser.process()?.kill("SIGKILL")),
]);
