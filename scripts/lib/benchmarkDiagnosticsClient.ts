import type { Page } from "puppeteer";
import type {
  DiagnosticDetails,
  DiagnosticsGlobals,
  DiagnosticsObservation,
  DiagnosticsReading,
  DiagnosticsReport,
} from "../../src/diagnostics/protocol";

export interface BenchmarkNetwork {
  blockedWebSockets: number;
  hostnames: string[];
}

export interface BenchmarkPageGlobals extends DiagnosticsGlobals {
  __t2BenchmarkNetwork?: BenchmarkNetwork;
}

interface Capture<T> {
  report: T | null;
  network?: BenchmarkNetwork;
}

/** All callbacks are self-contained because Puppeteer serializes their source.
 * The shared contract is imported as types only; no app code runs in Node. */
export async function bootstrapDiagnostics(page: Page, enabled: boolean) {
  await page.evaluateOnNewDocument((enabled) => {
    (globalThis as DiagnosticsGlobals).__t2DiagnosticsAutomation = enabled;
  }, enabled);
}

export async function diagnosticsAvailable(page: Page): Promise<boolean> {
  return page.evaluate(() => "__t2Diagnostics" in globalThis);
}

export async function diagnosticsDownloadComplete(
  page: Page,
): Promise<boolean> {
  return page.evaluate(
    () =>
      (globalThis as DiagnosticsGlobals).__t2Diagnostics?.observe().latestSample
        ?.values["playback.downloadComplete"] === 1,
  );
}

export function captureDiagnostics(
  page: Page,
  full: true,
): Promise<Capture<DiagnosticsReport>>;
export function captureDiagnostics(
  page: Page,
  full?: false,
): Promise<Capture<DiagnosticsObservation>>;
export function captureDiagnostics(
  page: Page,
  full: boolean,
): Promise<Capture<DiagnosticsReading>>;
export async function captureDiagnostics(
  page: Page,
  full = false,
): Promise<Capture<DiagnosticsReading>> {
  return page.evaluate((full) => {
    const environment = globalThis as BenchmarkPageGlobals;
    const diagnostics = environment.__t2Diagnostics;
    return {
      report: diagnostics
        ? full
          ? diagnostics.snapshot()
          : diagnostics.observe()
        : null,
      network: environment.__t2BenchmarkNetwork,
    };
  }, full);
}

export async function markDiagnosticsPhase(
  page: Page,
  name: string,
  details?: DiagnosticDetails,
) {
  await page.evaluate(
    ({ name, details }) => {
      (globalThis as DiagnosticsGlobals).__t2Diagnostics?.mark(
        `benchmark.${name}`,
        details,
      );
    },
    { name, details },
  );
}
