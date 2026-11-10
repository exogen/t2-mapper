import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserDemoUploadResponse } from "../../relay/userDemoTypes";

const mocks = vi.hoisted(() => ({ refreshAccount: vi.fn() }));
vi.mock("../account/authClient", () => ({
  appApiBaseUrl: "https://api.tribes2.online",
}));
vi.mock("../state/appAccountStore", () => ({
  refreshAccount: mocks.refreshAccount,
}));

import { uploadUserDemo, userDemoUploadsUrl } from "./userDemoUpload";

type Progress = { lengthComputable: boolean; loaded: number; total: number };

class FakeXHR {
  static instances: FakeXHR[] = [];
  static onOpen?: () => void;
  static onSend?: () => void;
  status = 0;
  responseText = "";
  withCredentials = false;
  timeout = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  upload = { onprogress: null as ((event: Progress) => void) | null };
  open = vi.fn((_method: string, _url: URL) => FakeXHR.onOpen?.());
  setRequestHeader = vi.fn();
  send = vi.fn((_file: File) => FakeXHR.onSend?.());
  abort = vi.fn(() => this.onabort?.());

  constructor() {
    FakeXHR.instances.push(this);
  }

  respond(status: number, text: string) {
    this.status = status;
    this.responseText = text;
    this.onload?.();
  }
}

const file = new File(["original recording bytes"], "A match #1.REC");
const OWNER = "123456789012345678";
const response: UserDemoUploadResponse = {
  demo: {
    id: "upload-id",
    originalFilename: file.name,
    filename: null,
    state: "queued",
    bytes: file.size,
    storedBytes: 0,
    recordedAt: null,
    createdAt: "2026-11-09T08:00:00.000Z",
    error: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  FakeXHR.instances = [];
  FakeXHR.onOpen = undefined;
  FakeXHR.onSend = undefined;
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
});
afterEach(() => vi.unstubAllGlobals());

function start() {
  const controller = new AbortController();
  const onProgress = vi.fn();
  const removeListener = vi.spyOn(controller.signal, "removeEventListener");
  const promise = uploadUserDemo(file, OWNER, onProgress, controller.signal);
  return {
    controller,
    onProgress,
    removeListener,
    promise,
    request: FakeXHR.instances[0],
  };
}

function expectClean(request: FakeXHR) {
  expect(request.onload).toBeNull();
  expect(request.onerror).toBeNull();
  expect(request.ontimeout).toBeNull();
  expect(request.onabort).toBeNull();
  expect(request.upload.onprogress).toBeNull();
}

describe("direct user demo upload", () => {
  it("posts the original File with credentials, filename, and progress", async () => {
    const { request, controller, onProgress, removeListener, promise } =
      start();
    expect(request.open).toHaveBeenCalledExactlyOnceWith(
      "POST",
      expect.any(URL),
    );
    const url = request.open.mock.calls[0][1];
    expect(url.origin).toBe("https://api.tribes2.online");
    expect(url.pathname).toBe("/api/demo-uploads");
    expect(url.searchParams.get("filename")).toBe(file.name);
    expect(url.searchParams.get("owner")).toBe(OWNER);
    expect(request.withCredentials).toBe(true);
    expect(request.timeout).toBe(310_000);
    expect(request.setRequestHeader).toHaveBeenCalledExactlyOnceWith(
      "Content-Type",
      "application/octet-stream",
    );
    expect(request.send).toHaveBeenCalledExactlyOnceWith(file);
    request.upload.onprogress?.({
      lengthComputable: true,
      loaded: 1,
      total: 4,
    });
    request.upload.onprogress?.({
      lengthComputable: true,
      loaded: 4,
      total: 4,
    });
    request.upload.onprogress?.({
      lengthComputable: false,
      loaded: 4,
      total: 0,
    });
    request.upload.onprogress?.({
      lengthComputable: true,
      loaded: 0,
      total: 0,
    });
    expect(onProgress.mock.calls).toEqual([[0.25], [1]]);
    request.respond(202, JSON.stringify(response));
    await expect(promise).resolves.toEqual(response);
    expectClean(request);
    expect(removeListener).toHaveBeenCalledExactlyOnceWith(
      "abort",
      expect.any(Function),
    );
    controller.abort();
    expect(request.abort).not.toHaveBeenCalled();
  });

  it("keeps the initiating owner attached when the account changes while the request opens", async () => {
    let currentOwner = OWNER;
    FakeXHR.onOpen = () => {
      currentOwner = "223456789012345678";
    };
    const promise = uploadUserDemo(
      file,
      currentOwner,
      vi.fn(),
      new AbortController().signal,
    );
    const request = FakeXHR.instances[0];
    expect(currentOwner).not.toBe(OWNER);
    expect(request.open.mock.calls[0][1].searchParams.get("owner")).toBe(OWNER);
    request.respond(202, JSON.stringify(response));
    await expect(promise).resolves.toEqual(response);
  });

  it("uses the same owner binding for private list and delete URLs", () => {
    const list = userDemoUploadsUrl(OWNER);
    const deletion = userDemoUploadsUrl(OWNER, "upload-id");
    expect(list.pathname).toBe("/api/demo-uploads");
    expect(deletion.pathname).toBe("/api/demo-uploads/upload-id");
    expect(list.searchParams.get("owner")).toBe(OWNER);
    expect(deletion.searchParams.get("owner")).toBe(OWNER);
  });

  it("returns a duplicate response without another request", async () => {
    const { request, promise } = start();
    const duplicate = { ...response, duplicate: true };
    request.respond(200, JSON.stringify(duplicate));
    await expect(promise).resolves.toEqual(duplicate);
    expect(FakeXHR.instances).toHaveLength(1);
    expectClean(request);
  });

  it("returns the relay's validation error", async () => {
    const { request, promise, removeListener } = start();
    request.respond(
      422,
      JSON.stringify({ error: "The recording is incomplete." }),
    );
    await expect(promise).rejects.toThrow("The recording is incomplete.");
    expect(mocks.refreshAccount).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalledOnce();
    expectClean(request);
  });

  it.each([
    JSON.stringify({ error: "Sign in to upload demos" }),
    JSON.stringify({
      error: "Your signed-in account changed. Please try again.",
    }),
    "not JSON",
  ])(
    "refreshes the account for a 401, even with an unreadable response (%s)",
    async (body) => {
      const { request, promise } = start();
      request.respond(401, body);
      await expect(promise).rejects.toThrow();
      expect(mocks.refreshAccount).toHaveBeenCalledOnce();
      expectClean(request);
    },
  );

  it.each([
    "",
    "not JSON",
    "null",
    "[]",
    "1",
    '"ok"',
    "{}",
    '{"demo":null}',
    '{"demo":{}}',
  ])(
    "rejects malformed success JSON instead of leaving the promise pending (%s)",
    async (body) => {
      const { request, promise } = start();
      request.respond(202, body);
      await expect(promise).rejects.toThrow(
        "Check your demo list before retrying.",
      );
      expectClean(request);
    },
  );

  it("handles a null error response without throwing from the XHR callback", async () => {
    const { request, promise } = start();
    expect(() => request.respond(503, "null")).not.toThrow();
    await expect(promise).rejects.toThrow("The demo could not be uploaded.");
    expectClean(request);
  });

  it.each([
    ["onerror", "The upload connection failed."],
    ["ontimeout", "The upload timed out."],
  ] as const)(
    "cleans up after %s and advises checking the library",
    async (event, message) => {
      const { request, promise, removeListener } = start();
      request[event]?.();
      await expect(promise).rejects.toThrow(message);
      await expect(promise).rejects.toThrow(
        "Check your demo list before retrying.",
      );
      expect(removeListener).toHaveBeenCalledOnce();
      expectClean(request);
    },
  );

  it("does not create a request when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadUserDemo(file, OWNER, vi.fn(), controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXHR.instances).toHaveLength(0);
  });

  it("aborts once and removes every handler before the native abort event", async () => {
    const { request, promise, controller, removeListener } = start();
    const nativeAbort = request.onabort;
    controller.abort();
    controller.abort();
    nativeAbort?.();
    await expect(promise).rejects.toBe(controller.signal.reason);
    expect(request.abort).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledOnce();
    expectClean(request);
  });

  it("handles a native abort without recursively aborting the request", async () => {
    const { request, promise, controller, removeListener } = start();
    request.onabort?.();
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(request.abort).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalledOnce();
    expectClean(request);
  });

  it("never sends when the signal aborts while opening the request", async () => {
    const controller = new AbortController();
    FakeXHR.onOpen = () => controller.abort();
    const promise = uploadUserDemo(file, OWNER, vi.fn(), controller.signal);
    const request = FakeXHR.instances[0];
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(request.send).not.toHaveBeenCalled();
    expect(request.abort).toHaveBeenCalledOnce();
    expectClean(request);
  });

  it.each(["onOpen", "onSend"] as const)(
    "cleans up synchronous XHR failure in %s",
    async (stage) => {
      const failure = new Error("Request failed synchronously");
      FakeXHR[stage] = () => {
        throw failure;
      };
      const { request, promise, controller, removeListener } = start();
      await expect(promise).rejects.toBe(failure);
      controller.abort();
      expect(request.abort).not.toHaveBeenCalled();
      expect(removeListener).toHaveBeenCalledOnce();
      expectClean(request);
    },
  );
});
