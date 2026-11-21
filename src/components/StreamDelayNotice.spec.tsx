import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StreamDelayNotice } from "./StreamDelayNotice";

const { live, director } = vi.hoisted(() => ({
  live: {
    streamDelayMs: 0,
    streamDelayReason: null as "castGenius" | "tournament" | null,
    streamDelayReadyAt: null as number | null,
    catchupProgress: null as number | null,
  },
  director: { status: "idle", error: null as string | null },
}));

vi.mock("../state/liveConnectionStore", () => ({
  useLiveSelector: (selector: (state: typeof live) => unknown) =>
    selector(live),
}));

vi.mock("../state/liveDirectorStore", () => ({
  liveDirectorStore: director,
  exitLiveDirector: vi.fn(),
}));

vi.mock("zustand", () => ({
  useStore: (
    store: typeof director,
    selector: (state: typeof director) => unknown,
  ) => selector(store),
}));

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(live, {
    streamDelayMs: 8_000,
    streamDelayReason: "castGenius",
    streamDelayReadyAt: Date.now() + 4_000,
    catchupProgress: null,
  });
  Object.assign(director, { status: "loading", error: null });
});

afterEach(() => vi.useRealTimers());

it("shows a CastGenius countdown for the CastGenius channel", () => {
  const html = renderToStaticMarkup(<StreamDelayNotice />);
  expect(html).toContain("CastGenius starts in 00:04");
  expect(html).not.toContain("Stream delayed");
});

it.each(["tournament", null] as const)(
  "shows the stream-delay notice for a %s delay even with CastGenius enabled",
  (reason) => {
    Object.assign(live, {
      streamDelayReason: reason,
      streamDelayMs: 120_000,
      streamDelayReadyAt: Date.now() + 116_000,
    });
    const html = renderToStaticMarkup(<StreamDelayNotice />);
    expect(html).toContain("Stream delayed 2m");
    expect(html).toContain("Live coverage begins in 01:56");
    expect(html).not.toContain("CastGenius");
  },
);

it("shows CastGenius preparing while the relay has no reliable deadline", () => {
  live.streamDelayReadyAt = null;
  const html = renderToStaticMarkup(<StreamDelayNotice />);
  expect(html).toContain("Preparing the CastGenius view…");
  expect(html).not.toContain("Stream delayed");
});

it("gives the canvas to the catch-up progress indicator once downloading starts", () => {
  live.catchupProgress = 0;
  expect(renderToStaticMarkup(<StreamDelayNotice />)).toBe("");
});
