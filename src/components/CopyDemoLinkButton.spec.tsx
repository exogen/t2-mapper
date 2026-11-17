import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  route: { clip: null as string | null, demo: "test.rec" as string | null },
  callback: null as (() => Promise<void>) | null,
  copy: vi.fn(),
  history: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useCallback: (callback: () => Promise<void>) => {
    fixture.callback = callback;
    return callback;
  },
}));
vi.mock("./demoMoment", () => ({
  captureDemoMoment: fixture.capture,
  encodeDemoMoment: () => ({ t: 42, hash: "#c1,2,3" }),
}));
vi.mock("./useQueryParams", () => ({
  useNavigationQueryState: () => [fixture.route],
  serializeDemoTime: (base: string, { t }: { t: number }) => `${base}&t=${t}`,
}));
vi.mock("../account/authClient", () => ({
  appApiBaseUrl: "https://api.example.com",
}));
import { CopyDemoLinkButton } from "./CopyDemoLinkButton";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fixture.route = { clip: null, demo: "test.rec" };
  fixture.capture.mockReturnValue({ timeSec: 42 });
  fixture.copy.mockResolvedValue(undefined);
  vi.stubGlobal("window", {
    location: {
      href: "https://play.example.com/?mode=demo&demo=test.rec&t=99#old",
      origin: "https://play.example.com",
      pathname: "/",
      search: "?mode=demo&demo=test.rec",
    },
    history: { replaceState: fixture.history },
  });
  vi.stubGlobal("navigator", { clipboard: { writeText: fixture.copy } });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shares the canonical clip without moment or camera parameters", async () => {
  fixture.route.clip = "clip-id";
  expect(renderToStaticMarkup(<CopyDemoLinkButton />)).toContain(
    'aria-label="Share clip"',
  );
  await fixture.callback!();
  const url = new URL(fixture.copy.mock.calls[0][0]);
  expect(url.searchParams.get("clip")).toBe("clip-id");
  expect(url.searchParams.get("demo")).toBe("test.rec");
  expect(url.searchParams.has("t")).toBe(false);
  expect(url.hash).toBe("");
  expect(fixture.capture).not.toHaveBeenCalled();
  expect(fixture.history).not.toHaveBeenCalled();
});

it("keeps ordinary demo moment links working", async () => {
  expect(renderToStaticMarkup(<CopyDemoLinkButton />)).toContain(
    'aria-label="Link to this moment"',
  );
  await fixture.callback!();
  expect(fixture.copy).toHaveBeenCalledWith(
    "https://play.example.com/?mode=demo&demo=test.rec&t=42#c1,2,3",
  );
  expect(fixture.history).toHaveBeenCalledOnce();
});
