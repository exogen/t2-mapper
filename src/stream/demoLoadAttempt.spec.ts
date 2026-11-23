import { expect, it, vi } from "vitest";
import { DemoLoadAttempt } from "./demoLoadAttempt";

it("invalidates before abort handlers run and finalizes a preserved download only once", () => {
  const attempt = new DemoLoadAttempt();
  const currentAtAbort = vi.fn(() => attempt.isCurrent);
  attempt.abortController.signal.addEventListener("abort", currentAtAbort);
  const finish = vi.fn();
  attempt.onDownloadCancel(finish);
  attempt.cancel(true);
  attempt.cancel(false);
  expect(currentAtAbort).toHaveReturnedWith(false);
  expect(attempt.abortController.signal.aborted).toBe(true);
  expect(finish).toHaveBeenCalledExactlyOnceWith(true);
});

it("releases completed reader callbacks without removing a newer registration", () => {
  const attempt = new DemoLoadAttempt();
  const oldReader = vi.fn();
  const releaseOld = attempt.onDownloadCancel(oldReader);
  const newReader = vi.fn();
  attempt.onDownloadCancel(newReader);
  releaseOld();
  attempt.cancel(false);
  expect(oldReader).not.toHaveBeenCalled();
  expect(newReader).toHaveBeenCalledExactlyOnceWith(false);
  const complete = new DemoLoadAttempt();
  const completedReader = vi.fn();
  complete.onDownloadCancel(completedReader)();
  complete.cancel(true);
  expect(completedReader).not.toHaveBeenCalled();
});

it("immediately closes a reader registered after its attempt became stale", () => {
  const attempt = new DemoLoadAttempt();
  attempt.cancel(true);
  const reader = vi.fn();
  attempt.onDownloadCancel(reader)();
  expect(reader).toHaveBeenCalledExactlyOnceWith(false);
});
