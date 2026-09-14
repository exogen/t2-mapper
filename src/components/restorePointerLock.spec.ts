import { describe, expect, it, vi } from "vitest";
import { restorePointerLock } from "./restorePointerLock";

function fixture(api: "promise" | "void") {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise =
    api === "promise"
      ? new Promise<void>((res, rej) => {
          resolve = res;
          reject = rej;
        })
      : undefined;
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null as Element | null,
    exitPointerLock: vi.fn(() => {
      doc.pointerLockElement = null;
    }),
  });
  const request = vi.fn(() => promise);
  const target = {
    ownerDocument: doc,
    isConnected: true,
    requestPointerLock: request,
  } as unknown as Element;
  return {
    doc,
    target,
    request,
    async resolveRequest() {
      resolve?.();
      await promise;
    },
    async complete() {
      doc.pointerLockElement = target;
      doc.dispatchEvent(new Event("pointerlockchange"));
      resolve?.();
      await promise;
    },
    async fail() {
      doc.dispatchEvent(new Event("pointerlockerror"));
      reject?.(new Error("Pointer lock denied"));
      await promise?.catch(() => {});
    },
  };
}

describe.each(["promise", "void"] as const)(
  "pointer-lock restoration (%s API)",
  (api) => {
    it("keeps the restored lock when the UI still allows it", async () => {
      const { doc, target, request, complete } = fixture(api);
      restorePointerLock(target, () => true);
      await complete();
      expect(request).toHaveBeenCalledOnce();
      expect(doc.pointerLockElement).toBe(target);
      expect(doc.exitPointerLock).not.toHaveBeenCalled();
    });

    it("rechecks eligibility when the request completes", async () => {
      const { doc, target, complete } = fixture(api);
      let allowed = true;
      restorePointerLock(target, () => allowed);
      allowed = false;
      await complete();
      expect(doc.pointerLockElement).toBeNull();
      expect(doc.exitPointerLock).toHaveBeenCalledOnce();
    });

    it("releases a canceled request, even after an earlier unlock event", async () => {
      const { doc, target, complete } = fixture(api);
      const cancel = restorePointerLock(target, () => true);
      cancel();
      doc.dispatchEvent(new Event("pointerlockchange"));
      await complete();
      expect(doc.pointerLockElement).toBeNull();
    });

    it("does not interfere with later manual locking after a request failed", async () => {
      const { doc, target, fail } = fixture(api);
      const cancel = restorePointerLock(target, () => true);
      cancel();
      await fail();
      doc.pointerLockElement = target;
      doc.dispatchEvent(new Event("pointerlockchange"));
      expect(doc.exitPointerLock).not.toHaveBeenCalled();
    });

    it("does not unlock a different element", async () => {
      const { doc, target, complete } = fixture(api);
      const cancel = restorePointerLock(target, () => true);
      cancel();
      doc.pointerLockElement = {} as Element;
      doc.dispatchEvent(new Event("pointerlockchange"));
      expect(doc.exitPointerLock).not.toHaveBeenCalled();
      await complete();
      expect(doc.pointerLockElement).toBeNull();
    });
  },
);

it("waits for its own promise instead of an earlier request's lock event", async () => {
  const { doc, target, resolveRequest } = fixture("promise");
  const cancel = restorePointerLock(target, () => true);
  doc.pointerLockElement = target;
  doc.dispatchEvent(new Event("pointerlockchange"));
  cancel();
  await resolveRequest();
  expect(doc.pointerLockElement).toBeNull();
  expect(doc.exitPointerLock).toHaveBeenCalledOnce();
});

it("cleans up when the promise completes after the lock was already released", async () => {
  const { doc, target, resolveRequest } = fixture("promise");
  const cancel = restorePointerLock(target, () => true);
  cancel();
  await resolveRequest();
  // A later manual lock must not be mistaken for the canceled restoration.
  doc.pointerLockElement = target;
  doc.dispatchEvent(new Event("pointerlockchange"));
  expect(doc.pointerLockElement).toBe(target);
  expect(doc.exitPointerLock).not.toHaveBeenCalled();
});

it("does not request a lock when restoration is already disallowed", () => {
  const { target, request } = fixture("void");
  restorePointerLock(target, () => false);
  expect(request).not.toHaveBeenCalled();
});

it("handles synchronous request failures without leaving a cancellation listener", () => {
  const { doc, target, request } = fixture("void");
  request.mockImplementation(() => {
    throw new Error("Unsupported");
  });
  const cancel = restorePointerLock(target, () => true);
  cancel();
  doc.pointerLockElement = target;
  doc.dispatchEvent(new Event("pointerlockchange"));
  expect(doc.exitPointerLock).not.toHaveBeenCalled();
});
