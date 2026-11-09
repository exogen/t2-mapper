import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";

const lifecycle = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  refresh: vi.fn(() => Promise.resolve()),
  focus: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) =>
    lifecycle.effects.push(effect),
}));
vi.mock("../state/appAccountStore", () => ({
  refreshAccount: lifecycle.refresh,
  refreshAccountOnFocus: lifecycle.focus,
}));
vi.mock("./AppProviders", () => ({
  AppProviders: ({ children }: { children: React.ReactNode }) => children,
}));
// No sidebar/account widget is mounted: the app must still discover the session.
vi.mock("./MapInspector", () => ({ MapInspector: () => null }));
vi.mock("./NewAddressDialog", () => ({ NewAddressDialog: () => null }));

afterEach(() => vi.unstubAllGlobals());

it("checks the session before opening the sidebar and owns focus checks until the app unmounts", async () => {
  const window = new EventTarget();
  vi.stubGlobal("window", window);
  renderToStaticMarkup(<App />);
  expect(lifecycle.effects).toHaveLength(1);
  const cleanup = lifecycle.effects[0]();
  expect(lifecycle.refresh).toHaveBeenCalledOnce();
  await lifecycle.refresh.mock.results[0].value;
  window.dispatchEvent(new Event("focus"));
  expect(lifecycle.focus).toHaveBeenCalledOnce();
  cleanup?.();
  window.dispatchEvent(new Event("focus"));
  expect(lifecycle.focus).toHaveBeenCalledOnce();
});
