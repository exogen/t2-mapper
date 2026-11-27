import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { ShotPlan } from "../director/types";
import type { AppAccountState } from "../state/appAccountStore";
import type {
  DemoDirectorState,
  DirectorStatus,
} from "../state/demoDirectorStore";
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
  demoDirector: {
    status: "idle" as DirectorStatus,
    plan: null as Pick<ShotPlan, "lookaheadSec"> | null,
    planSource: null as DemoDirectorState["planSource"],
    localLookaheadPending: false,
    localLookaheadError: null as string | null,
  },
  liveDirector: {
    status: "idle",
    lookaheadMs: null as number | null,
  },
  preferences: { localCastLookaheadMs: null as number | null },
}));

vi.mock("../state/appAccountStore", () => ({
  useAppAccount: (selector: (state: typeof fixture.account) => unknown) =>
    selector(fixture.account),
}));
vi.mock("../state/liveConnectionStore", () => ({
  useLiveSelector: (selector: (state: typeof fixture.live) => unknown) =>
    selector(fixture.live),
}));
vi.mock("../state/demoDirectorStore", () => ({
  applyLocalCastLookahead: vi.fn(),
  useDirector: (selector: (state: typeof fixture.demoDirector) => unknown) =>
    selector(fixture.demoDirector),
}));
vi.mock("../state/liveDirectorStore", () => ({
  liveDirectorStore: fixture.liveDirector,
}));
vi.mock("../state/settingsStore", () => ({
  settingsStore: fixture.preferences,
}));
vi.mock("zustand", () => ({
  useStore: <T,>(store: T, selector: (state: T) => unknown) => selector(store),
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
  Object.assign(fixture.demoDirector, {
    status: "idle",
    plan: null,
    planSource: null,
    localLookaheadPending: false,
    localLookaheadError: null,
  });
  Object.assign(fixture.liveDirector, { status: "idle", lookaheadMs: null });
  fixture.preferences.localCastLookaheadMs = null;
});

it.each(["user", null] as const)(
  "offers lookahead before activation and hides retained metrics for role %s",
  (role) => {
    fixture.account.user = role == null ? null : { role };
    fixture.preferences.localCastLookaheadMs = 2_500;
    const html = renderToStaticMarkup(<DebugCastGeniusInfo />);
    expect(html).toMatch(/<input[^>]*type="text"[^>]*value="2500"/);
    expect(html).not.toContain("Active workers");
    expect(html).not.toContain("Planner lead");
  },
);

it("hides diagnostics until the session is verified and during sign-out", () => {
  fixture.account.status = "loading";
  expect(renderToStaticMarkup(<DebugCastGeniusInfo />)).not.toContain(
    "Active workers",
  );
  fixture.account.status = "ready";
  fixture.account.pending = "sign-out";
  expect(renderToStaticMarkup(<DebugCastGeniusInfo />)).not.toContain(
    "Active workers",
  );
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

it.each([
  [{ lookaheadSec: 2 }, `${(2_000).toLocaleString()} ms`],
  [{ lookaheadSec: 2.1255 }, `${(2_125.5).toLocaleString()} ms`],
  [{ lookaheadSec: 0 }, "0 ms"],
  [{ lookaheadSec: null }, "Full recording"],
  [{}, "Not recorded"],
] as const)("shows the active demo's lookahead for plan %j", (plan, label) => {
  fixture.account.user = null;
  Object.assign(fixture.demoDirector, {
    status: "playing",
    plan,
    planSource: "sidecar",
  });

  const html = renderToStaticMarkup(<DebugCastGeniusInfo />);
  expect(html).toContain("Lookahead</dt>");
  expect(html).toContain(`<dd>${label}</dd>`);
  expect(html).not.toContain("Active workers");
  expect(html).not.toContain("<input");
});

it.each([
  [6_750, `${(6_750).toLocaleString()} ms`],
  [null, "Not reported"],
] as const)("shows the active live cast's lookahead for %s ms", (ms, label) => {
  fixture.account.user = null;
  Object.assign(fixture.liveDirector, { status: "playing", lookaheadMs: ms });
  Object.assign(fixture.demoDirector, {
    status: "ready",
    plan: { lookaheadSec: 2 },
  });

  const html = renderToStaticMarkup(<DebugCastGeniusInfo />);
  expect(html).toContain("Lookahead</dt>");
  expect(html).toContain(`<dd>${label}</dd>`);
  expect(html).not.toContain("Active workers");
  expect(html).not.toContain("<input");
});

it("renders lookahead as an inline millisecond input for a local cast", () => {
  fixture.account.user = null;
  Object.assign(fixture.demoDirector, {
    status: "playing",
    plan: { lookaheadSec: 1.001 },
    planSource: "local",
  });
  fixture.preferences.localCastLookaheadMs = 1_001;

  const html = renderToStaticMarkup(<DebugCastGeniusInfo />);
  expect(html).toMatch(
    /<dl><dt[^>]*><label[^>]*>Lookahead<\/label><\/dt><dd[^>]*><input/,
  );
  expect(html).toMatch(
    /<input[^>]+type="text"[^>]*inputmode="decimal"[^>]*value="1001"/i,
  );
  expect(html).toMatch(/<span[^>]*>ms<\/span>/);
  expect(html).not.toMatch(/<(button|form)\b/);
  expect(html).not.toContain("Active workers");
});

it("shows replanning status in the lookahead row", () => {
  Object.assign(fixture.demoDirector, {
    status: "playing",
    plan: { lookaheadSec: 2 },
    planSource: "local",
    localLookaheadPending: true,
  });

  const html = renderToStaticMarkup(<DebugCastGeniusInfo />);
  expect(html).toContain('<span role="status">Replanning…</span>');
  expect(html).toMatch(/<input[^>]+disabled=""/);
});
