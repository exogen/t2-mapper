import { expect, it, vi } from "vitest";
import { PendingRequests } from "./pendingRequests";

it("shares pending work, releases subscribers after settlement and ignores duplicate completion", () => {
  const pending = new PendingRequests<string, number>(vi.fn());
  let resolve!: (value: number) => void;
  const start = vi.fn((done: typeof resolve) => {
    resolve = done;
  });
  const first = vi.fn(),
    second = vi.fn();
  pending.request("one", start, first);
  pending.request("one", start, second);
  pending.request("one", start);
  expect(start).toHaveBeenCalledOnce();
  expect(pending.size).toBe(1);
  resolve(7);
  resolve(8);
  expect(first).toHaveBeenCalledExactlyOnceWith(7);
  expect(second).toHaveBeenCalledExactlyOnceWith(7);
  expect(pending.size).toBe(0);
});

it("clears failed entries before observers retry and contains callback/logging failures", () => {
  const pending = new PendingRequests<string, number>(() => {
    throw new Error("logger");
  });
  let reject!: (error: unknown) => void;
  let retry!: (value: number) => void;
  const loaded = vi.fn(),
    otherError = vi.fn();
  pending.request(
    "one",
    (_done, failed) => {
      reject = failed;
    },
    undefined,
    () => {
      pending.request(
        "one",
        (done) => {
          retry = done;
        },
        loaded,
      );
      throw new Error("observer");
    },
  );
  pending.request("one", vi.fn(), undefined, otherError);
  reject("offline");
  expect(otherError).toHaveBeenCalledExactlyOnceWith("offline");
  expect(pending.size).toBe(1);
  retry(9);
  expect(loaded).toHaveBeenCalledExactlyOnceWith(9);
  expect(pending.size).toBe(0);
});

it("preserves synchronous loader throws and permits a new request", () => {
  const pending = new PendingRequests<string, number>(vi.fn());
  expect(() =>
    pending.request("one", () => {
      throw new Error("loader");
    }),
  ).toThrow("loader");
  expect(pending.size).toBe(0);
  const loaded = vi.fn();
  pending.request("one", (resolve) => resolve(3), loaded);
  expect(loaded).toHaveBeenCalledExactlyOnceWith(3);
});
