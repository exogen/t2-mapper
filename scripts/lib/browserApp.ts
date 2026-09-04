/**
 * Driving the real app in a headless browser: the launch flags it needs
 * to render, a page on the demo screen, and the page-side script that
 * loads a demo the way the drop screen does.
 *
 * Page-side code is passed as SOURCE STRINGS: tsx's transpile of an
 * inline callback injects esbuild helpers (`__name`) that do not exist
 * in the page.
 */
import puppeteer, { type Browser, type Page } from "puppeteer";

export const APP_URL_DEFAULT = "http://localhost:3000";

export async function launchApp(
  options: { protocolTimeout?: number } = {},
): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    ...(options.protocolTimeout != null
      ? { protocolTimeout: options.protocolTimeout }
      : {}),
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--no-sandbox"],
  });
}

/**
 * A page on the app's demo screen, settled, with page errors echoed and
 * console lines matching `echo` printed.
 */
export async function openApp(
  browser: Browser,
  appUrl: string,
  echo?: RegExp,
): Promise<Page> {
  const page = await browser.newPage();
  page.on("pageerror", (e) =>
    console.error(`  [page] ${e instanceof Error ? e.message : e}`),
  );
  if (echo) {
    page.on("console", (m) => {
      const t = m.text();
      if (echo.test(t)) console.error(`  ${t}`);
    });
  }
  await page.goto(`${appUrl}/?mode=demo`, {
    waitUntil: "networkidle2",
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 2000));
  return page;
}

/**
 * Page-side prelude: `resolve(path)` maps a source path to the module
 * URL the dev server actually served (HMR stamps a `?t=` on modules, so
 * importing the bare path would duplicate every store), then `loader`
 * and `engine` are imported and the demo at `recUrl` is loaded, resolving
 * once the recording is in the store.
 */
export function loadDemoScript(recUrl: string, timeoutMs = 180000): string {
  return `
    const urls = performance.getEntriesByType("resource").map((r) => r.name);
    const resolve = (p) => urls.find((n) => n.includes(p)) ?? p;
    const loader = await import(resolve("/src/stream/demoFileLoader"));
    const engine = await import(resolve("/src/state/engineStore"));
    await loader.loadDemoUrl(${JSON.stringify(recUrl)});
    await new Promise((res, rej) => {
      const t0 = Date.now();
      const poll = () => {
        if (engine.engineStore.getState().playback.recording != null) res();
        else if (Date.now() - t0 > ${timeoutMs}) rej(new Error("load timeout"));
        else setTimeout(poll, 250);
      };
      poll();
    });
  `;
}
