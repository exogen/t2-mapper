import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AppAccountState } from "../state/appAccountStore";
import { DebugCastGeniusInfo } from "./DebugCastGeniusInfo";

const fixture = vi.hoisted(() => ({
  account: {
    status: "ready" as AppAccountState["status"],
    pending: null as AppAccountState["pending"],
    user: null as { role: "admin" | "user" } | null,
  },
  live: {
    castMetrics: null as typeof sample | null,
    castCoverageLeadMs: null as number | null,
    castShotLeadMs: null as number | null,
  },
}));

vi.mock("../state/appAccountStore", () => ({
  useAppAccount: (selector: (state: typeof fixture.account) => unknown) =>
    selector(fixture.account),
}));
vi.mock("../state/liveConnectionStore", () => ({
  useLiveSelector: (selector: (state: typeof fixture.live) => unknown) =>
    selector(fixture.live),
}));

const sample = {
  activeWorkers: 2,
  workers: [
    { gameId: "one", epoch: 1, cpuPercent: 12.5, rssBytes: 96 * 1024 ** 2 },
    { gameId: "two", epoch: 2, cpuPercent: 0, rssBytes: null },
  ],
};

beforeEach(() => {
  Object.assign(fixture.account, {
    status: "ready",
    pending: null,
    user: { role: "admin" },
  });
  Object.assign(fixture.live, {
    castMetrics: sample,
    castCoverageLeadMs: 402,
    castShotLeadMs: 17,
  });
});

it.each(["user", null] as const)(
  "keeps CastGenius diagnostics hidden with retained metrics for role %s",
  (role) => {
    fixture.account.user = role == null ? null : { role };
    expect(renderToStaticMarkup(<DebugCastGeniusInfo />)).toBe("");
  },
);

it("hides diagnostics until the session is verified and during sign-out", () => {
  fixture.account.status = "loading";
  expect(renderToStaticMarkup(<DebugCastGeniusInfo />)).toBe("");
  fixture.account.status = "ready";
  fixture.account.pending = "sign-out";
  expect(renderToStaticMarkup(<DebugCastGeniusInfo />)).toBe("");
});

it.each([
  [17, "+17 ms"],
  [-11, "-11 ms"],
  [0, "0 ms"],
] as const)(
  "shows worker usage and shot lead %s for admins",
  (lead, formattedLead) => {
    fixture.live.castShotLeadMs = lead;
    const html = renderToStaticMarkup(<DebugCastGeniusInfo />);
    expect(html).toContain("<legend>CastGenius</legend>");
    expect(html).toContain("<dt>Active workers</dt><dd>2</dd>");
    expect(html).toContain("12.5% CPU · 96 MiB RSS");
    expect(html).toContain("0% CPU · — RSS");
    expect(html).toContain("Planner lead</dt><dd>+402 ms</dd>");
    expect(html).toContain("Shot arrival</dt>");
    expect(html).toContain(`<dd>${formattedLead}</dd>`);
  },
);

it("shows when diagnostics have not been sampled and distinguishes an idle relay", () => {
  fixture.live.castMetrics = null;
  fixture.live.castCoverageLeadMs = null;
  fixture.live.castShotLeadMs = null;
  expect(
    renderToStaticMarkup(<DebugCastGeniusInfo />).match(/Not yet sampled/g),
  ).toHaveLength(3);

  fixture.live.castMetrics = { activeWorkers: 0, workers: [] };
  expect(renderToStaticMarkup(<DebugCastGeniusInfo />)).toContain(
    "<dt>Active workers</dt><dd>0</dd>",
  );
});
