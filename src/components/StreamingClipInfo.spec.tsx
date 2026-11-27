import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type {
  AccountPublicProfile,
  AccountUser,
} from "../../relay/accountTypes";
import type { ClipView } from "../../relay/clipTypes";
import type { AppAccountState } from "../state/appAccountStore";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { recordedDayLabel } from "./demoFormat";
import { StreamingClipInfo } from "./StreamingClipInfo";

const OWNER = "123456789012345678";
const fixture = vi.hoisted(() => ({
  clip: undefined as ClipView | undefined,
  error: null as Error | null,
  profile: undefined as AccountPublicProfile | null | undefined,
  user: null as AccountUser | null,
  demos: undefined as DemoIndexEntry[] | undefined,
}));

vi.mock("./useClipQuery", () => ({
  useClipQuery: () => ({ data: fixture.clip, error: fixture.error }),
}));
vi.mock("./usePublicProfile", () => ({
  usePublicProfile: () => ({ data: fixture.profile }),
}));
vi.mock("../state/appAccountStore", () => ({
  useAppAccount: (select: (state: AppAccountState) => unknown) =>
    select({ status: "ready", user: fixture.user } as AppAccountState),
}));
vi.mock("./useDemoIndex", () => ({
  useDemoIndex: () => ({ data: fixture.demos }),
}));
vi.mock("./useAppNavigation", () => ({
  useAppNavigation: () => ({ demoIndex: vi.fn(), exitClip: vi.fn() }),
}));
vi.mock("../manifest", () => ({ findMissionInfo: () => null }));

beforeEach(() => {
  fixture.error = null;
  fixture.user = null;
  fixture.clip = {
    id: "clip-one",
    title: "Clip of Rollercoaster CTF from Sat, Nov 14, 2026",
    sourceDemo: "match.rec",
    startSec: 70,
    durationMs: 23_000,
    ownerDiscordId: OWNER,
    createdAt: Date.UTC(2026, 10, 17, 8, 26),
    state: "ready",
    checkpointUrl: "/unused",
  };
  fixture.profile = {
    discordId: OWNER,
    name: "Clip creator",
    discordUsername: "creator_login",
    image: "https://cdn.discordapp.com/avatars/creator/avatar.png",
    t2AccountNames: [],
    t2Profile: null,
  };
  fixture.demos = [
    {
      filename: "match.rec",
      bytes: 1,
      recordedAt: "2026-11-14T20:43:00Z",
      recorder: "MapGenius",
      server: "Tournament Server 2",
      address: "example.test:28000",
      mod: "base",
      durationMs: 120_000,
      players: [],
      games: [
        {
          mission: "Katabatic",
          gameType: "CTF",
          startMs: 0,
          tournament: true,
          title: "Opening map",
          teamNames: { 1: "Old team", 2: "Earlier team" },
        },
        {
          mission: "Rollercoaster",
          gameType: "CTF",
          startMs: 60_000,
          tournament: true,
          title: "Semifinals – Map 3",
          teamNames: { 0: "Observer", 1: "Knights", 2: "Dragons" },
        },
      ],
    },
  ];
});

const render = (clipId = "clip-one") =>
  renderToStaticMarkup(<StreamingClipInfo clipId={clipId} />);

it("leads with the clip title and shows its creator, clipped date, duration, and server", () => {
  const markup = render();
  expect(markup).toContain(fixture.clip!.title);
  expect(markup).toContain("Clip creator");
  expect(markup).toContain(
    'src="https://cdn.discordapp.com/avatars/creator/avatar.png"',
  );
  expect(markup).toMatch(new RegExp(`href="[^"]*user=${OWNER}`));
  expect(markup).toContain(
    `Clipped ${recordedDayLabel(new Date(fixture.clip!.createdAt).toISOString())}`,
  );
  expect(markup).toContain("23s");
  expect(markup).toContain("Tournament Server 2");
  expect(markup).not.toContain("MapGenius");
  expect(markup).not.toContain("creator_login");
  expect(markup).not.toContain("Recorded on");
  expect(markup).not.toContain('aria-label="Players"');
  expect(markup).not.toContain("Download this demo");
  expect(markup).not.toContain("Edit shared game details");
  expect(markup).not.toContain("Edit clip title");
});

it("keeps match titles and team names out of the clip toolbar", () => {
  const markup = render();
  expect(markup).not.toContain("Semifinals – Map 3");
  expect(markup).not.toContain("Knights");
  expect(markup).not.toContain("Dragons");
  expect(markup).not.toContain("Opening map");
  expect(markup).not.toContain("Old team");
  expect(markup).not.toContain("Observer");
});

it("uses the signed-in creator's current display name instead of an older public profile", () => {
  fixture.user = {
    ...fixture.profile!,
    id: "current-user",
    name: "Updated creator",
    role: "user",
  };
  const markup = render();
  expect(markup).toContain("Updated creator");
  expect(markup).not.toContain("Clip creator");
  expect(markup).toContain('aria-label="Edit clip title"');
});

it("keeps the clip identity available while creator and source metadata are unavailable", () => {
  fixture.profile = null;
  fixture.demos = undefined;
  fixture.clip!.durationMs = undefined;
  const markup = render();
  expect(markup).toContain(fixture.clip!.title);
  expect(markup).toContain("Clipped");
  expect(markup).not.toContain("undefined");
  expect(markup).not.toContain("NaN");
  expect(markup).not.toContain("MapGenius");
});

it("does not show another clip's cached title when the requested clip changes", () => {
  expect(render("clip-two")).not.toContain(fixture.clip!.title);
  expect(render("clip-two")).toContain("Loading clip…");
});

it("shows clip loading and unavailable states without source demo attribution", () => {
  fixture.clip = undefined;
  expect(render()).toContain("Loading clip…");
  fixture.error = new Error("Not found");
  const markup = render();
  expect(markup).toContain("Clip unavailable");
  expect(markup).not.toContain("MapGenius");
});
