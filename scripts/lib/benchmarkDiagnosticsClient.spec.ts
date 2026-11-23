import { afterEach, expect, it, vi } from "vitest";
import type { Page } from "puppeteer";
import { PerformanceRecorder } from "../../src/diagnostics/performanceRecorder";
import {
  bootstrapDiagnostics,
  captureDiagnostics,
  diagnosticsAvailable,
  diagnosticsDownloadComplete,
  markDiagnosticsPhase,
} from "./benchmarkDiagnosticsClient";

vi.mock("../../src/diagnostics/browserDiagnostics", () => {
  throw new Error("The automation client must not load browser implementation");
});

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const recorder = new PerformanceRecorder({ now: () => 10 });
  recorder.sample({ "playback.downloadComplete": 1 });
  const api = {
    observe: vi.fn(() => recorder.observe()),
    snapshot: vi.fn(() => recorder.snapshot()),
    mark: vi.fn((name, details) => recorder.mark(name, details)),
    reset: vi.fn(),
  };
  const page = {
    evaluate: vi.fn(async (fn: (...args: any[]) => unknown, ...args: any[]) =>
      fn(...args),
    ),
    evaluateOnNewDocument: vi.fn(),
  };
  return { api, page: page as unknown as Page, evaluate: page.evaluate };
}

it("bootstraps through a new-document hook without setting a URL or running app code", async () => {
  const { page } = fixture();
  await bootstrapDiagnostics(page, true);
  const [fn, enabled] = vi.mocked(page.evaluateOnNewDocument).mock.calls[0];
  expect(enabled).toBe(true);
  expect("__t2DiagnosticsAutomation" in globalThis).toBe(false);
  vi.stubGlobal("__t2DiagnosticsAutomation", undefined);
  (fn as (enabled: boolean) => void)(enabled as boolean);
  expect(
    (globalThis as { __t2DiagnosticsAutomation?: boolean })
      .__t2DiagnosticsAutomation,
  ).toBe(true);
});

it("uses cheap observations for polling/readiness and full history only on explicit request", async () => {
  const { page, api } = fixture();
  vi.stubGlobal("__t2Diagnostics", api);
  expect(await diagnosticsAvailable(page)).toBe(true);
  expect(await diagnosticsDownloadComplete(page)).toBe(true);
  const observed = await captureDiagnostics(page);
  expect(
    observed.report?.latestSample?.values["playback.downloadComplete"],
  ).toBe(1);
  expect(api.snapshot).not.toHaveBeenCalled();
  const exported = await captureDiagnostics(page, true);
  expect(exported.report?.schemaVersion).toBe(1);
  expect(exported.report?.samples).toHaveLength(1);
  expect(api.snapshot).toHaveBeenCalledOnce();
  await markDiagnosticsPhase(page, "measurement", { targetSec: 1200 });
  expect(api.mark).toHaveBeenCalledWith("benchmark.measurement", {
    targetSec: 1200,
  });
});

it("treats an unbootstrapped page as unavailable without creating a recorder", async () => {
  const { page, api } = fixture();
  vi.stubGlobal("__t2Diagnostics", undefined);
  expect(await diagnosticsDownloadComplete(page)).toBe(false);
  expect((await captureDiagnostics(page)).report).toBeNull();
  expect(api.observe).not.toHaveBeenCalled();
  expect(api.snapshot).not.toHaveBeenCalled();
});
