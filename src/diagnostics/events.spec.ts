import { expect, it, vi } from "vitest";
import { emitDiagnosticEvent, installDiagnosticEventSink } from "./events";

it("keeps shared events inert without a recorder and safely replaces its sink", () => {
  emitDiagnosticEvent("no-browser");
  const old = vi.fn();
  const current = vi.fn();
  const stopOld = installDiagnosticEventSink(old);
  emitDiagnosticEvent("load", { bytes: 10 });
  const stopCurrent = installDiagnosticEventSink(current);
  stopOld();
  emitDiagnosticEvent("seek");
  expect(old).toHaveBeenCalledExactlyOnceWith("load", { bytes: 10 });
  expect(current).toHaveBeenCalledExactlyOnceWith("seek", undefined);
  stopCurrent();
  emitDiagnosticEvent("stopped");
  expect(current).toHaveBeenCalledTimes(1);
});
