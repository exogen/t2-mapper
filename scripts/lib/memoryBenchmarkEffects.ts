import type { Page } from "puppeteer";

/** Exercise the public graphics controls; no application stores are exposed
 * for the benchmark. Closing the sidebar restores the playback viewport. */
export async function setBenchmarkEffects(page: Page, enabled: boolean) {
  let opened = false;
  for (const button of await page.$$('button[aria-label="Open sidebar"]')) {
    if (!(await button.boundingBox())) continue;
    await button.click();
    opened = true;
    break;
  }
  let found = false;
  for (const button of await page.$$("button[aria-expanded]")) {
    if ((await button.evaluate((el) => el.textContent?.trim())) !== "Graphics")
      continue;
    if (
      (await button.evaluate((el) => el.getAttribute("aria-expanded"))) !==
      "true"
    )
      await button.click();
    found = true;
    break;
  }
  if (!found)
    throw new Error("Graphics controls unavailable for effects workload");
  const master =
    'fieldset[aria-labelledby="graphics-effects-label"] legend input[type="checkbox"]';
  const checked = await page.$eval(master, (el) =>
    Boolean((el as unknown as { checked: boolean }).checked),
  );
  if (checked !== enabled) await page.click(master);
  if (enabled) {
    const vignette = "#graphics-effect-vignette";
    if (
      !(await page.$eval(vignette, (el) =>
        Boolean((el as unknown as { checked: boolean }).checked),
      ))
    )
      await page.click(vignette);
  }
  if (opened) {
    for (const button of await page.$$('button[aria-label="Close sidebar"]')) {
      if (!(await button.boundingBox())) continue;
      await button.click();
      break;
    }
  }
  return { enabled, effect: "vignette" };
}
