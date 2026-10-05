import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { LiveConnectionState } from "../state/liveConnectionStore";
import { ServerBrowser } from "./ServerBrowser";

const test = vi.hoisted(() => ({
  view: "list",
  state: {
    servers: [],
    serversLoading: false,
    serverListError: null as string | null,
    browserToRelayPing: null,
  },
}));

vi.mock("../state/liveConnectionStore", () => ({
  useLiveSelector: (select: (state: Partial<LiveConnectionState>) => unknown) =>
    select(test.state),
}));
vi.mock("./SettingsProvider", () => ({
  useSettings: () => ({ serverBrowserView: test.view, warriorName: "" }),
}));

beforeEach(() => {
  test.state.serverListError = null;
});

it.each(["list", "tiles"])(
  "shows a query failure in the %s server browser",
  (view) => {
    test.view = view;
    test.state.serverListError =
      "Unable to load the server list. Please try refreshing.";
    const markup = renderToStaticMarkup(
      <ServerBrowser showWarriorField={false} />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(test.state.serverListError);
  },
);

it("does not label a successfully empty server list as an error", () => {
  const markup = renderToStaticMarkup(
    <ServerBrowser showWarriorField={false} />,
  );
  expect(markup).not.toContain('role="alert"');
});
