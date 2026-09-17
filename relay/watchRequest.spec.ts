import { describe, expect, it, vi } from "vitest";
import { WatchRequest } from "./watchRequest";

function setup() {
  let finish!: (compatible: boolean) => void;
  const options = {
    isKnown: (address: string) => address === "known",
    probe: vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    ),
    checking: vi.fn(),
    rejected: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
  };
  return {
    request: new WatchRequest(options),
    options,
    finish: (ok: boolean) => finish(ok),
  };
}

describe("watch navigation during server probes", () => {
  it.each([true, false])(
    "ignores a probe after leaving (compatible=%s)",
    async (compatible) => {
      const { request, options, finish } = setup();
      const pending = request.watch("old");
      await vi.waitFor(() => expect(options.probe).toHaveBeenCalledOnce());
      request.leave();
      finish(compatible);
      await pending;
      expect(options.attach).not.toHaveBeenCalled();
      expect(options.rejected).not.toHaveBeenCalled();
    },
  );

  it("does not let a late probe replace a newer known server", async () => {
    const { request, options, finish } = setup();
    const pending = request.watch("old");
    await vi.waitFor(() => expect(options.probe).toHaveBeenCalledOnce());
    await request.watch("known", "channel");
    finish(true);
    await pending;
    expect(options.attach.mock.calls).toEqual([["known", "channel"]]);
  });

  it("serializes probes and skips superseded selections", async () => {
    const { request, options, finish } = setup();
    const first = request.watch("first");
    await vi.waitFor(() => expect(options.probe).toHaveBeenCalledOnce());
    const second = request.watch("second");
    const third = request.watch("third");
    finish(true);
    await vi.waitFor(() => expect(options.probe).toHaveBeenCalledTimes(2));
    expect(options.probe.mock.calls).toEqual([["first"], ["third"]]);
    finish(true);
    await Promise.all([first, second, third]);
    expect(options.attach.mock.calls).toEqual([["third", undefined]]);
  });
});
