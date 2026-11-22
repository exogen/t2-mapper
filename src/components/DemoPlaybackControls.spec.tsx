import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { TimelineEvent } from "../state/demoTimelineStore";
import { IFF_PALETTE, rgbString, type TeamColorScheme } from "../iffTheme";
import type { ClipSample, ClipTake } from "../../relay/clipTypes";
import { ClipControlsContext } from "./clipControlsContext";
import { DemoPlaybackControls } from "./DemoPlaybackControls";
import playbackStyles from "./PlaybackControls.module.css";

const green = rgbString(IFF_PALETTE.green);
const red = rgbString(IFF_PALETTE.red);
const orange = rgbString(IFF_PALETTE.orange);
const blueMap = rgbString(IFF_PALETTE.blueMap);
const neutral = rgbString(IFF_PALETTE.neutral);

const state = vi.hoisted(() => ({
  actions: new Map<string, () => void>(),
  setSpeed: vi.fn(),
  events: [] as TimelineEvent[] | null,
  observerTeamColors: "blueOrange" as TeamColorScheme,
  recording: { duration: 100 },
  clipRoute: null as string | null,
  clip: {
    draft: null as ClipTake | null,
    active: null as ClipTake | null,
    playing: false,
    playheadMs: 0,
    trimStartMs: 0,
    trimEndMs: 0,
    jumpTransitions: new Set<number>(),
  },
  playback: {
    rate: 1,
    status: "paused",
    resumeAfterSeek: null,
    downloadComplete: true,
    pendingSeekSec: null,
    seekProgress: null,
  },
}));

vi.mock("./InputControls", () => ({
  useInputAction(action: string, callback: () => void) {
    state.actions.set(action, callback);
  },
}));
vi.mock("./useQueryParams", () => ({
  useNavigationQueryState: () => [{ clip: state.clipRoute }],
}));
vi.mock("../state/clipStore", () => ({
  clipStore: {
    getState: () => state.clip,
    getInitialState: () => state.clip,
    subscribe: () => () => {},
  },
}));
vi.mock("./ClipControls", () => ({
  ClipPlaybackControls: () => null,
}));
vi.mock("./usePlayback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./usePlayback")>()),
  useRecording: () => state.recording,
  useIsSeeking: () => state.playback.status === "seeking",
  useCurrentTime: () => 0,
  useDuration: () => state.recording.duration,
  useSpeed: () => 1,
  SPEED_OPTIONS: [0.5, 1, 2],
  usePlaybackActions: () => ({
    toggle() {},
    seek() {},
    setSpeed: state.setSpeed,
  }),
}));
vi.mock("../state/engineStore", () => ({
  isCurrentPlayback: () => true,
  useEngineSelector: (selector: (value: typeof state) => unknown) =>
    selector(state),
}));
vi.mock("../state/demoLoadStore", () => ({ useDemoLoad: () => null }));
vi.mock("../state/demoTimelineStore", () => ({
  useDemoTimeline: (selector: (value: typeof state) => unknown) =>
    selector(state),
}));
vi.mock("../state/demoDirectorStore", () => ({
  startDirector() {},
  exitDirector() {},
  useDirector: (
    selector: (value: {
      status: string;
      scanProgress: null;
      error: null;
    }) => unknown,
  ) => selector({ status: "idle", scanProgress: null, error: null }),
}));
vi.mock("./SettingsProvider", () => ({
  useSettings: () => ({ observerTeamColors: state.observerTeamColors }),
}));

beforeEach(() => {
  state.actions.clear();
  state.setSpeed.mockClear();
  state.playback.rate = 1;
  state.events = [];
  state.recording.duration = 100;
  state.clipRoute = null;
  state.clip = {
    draft: null,
    active: null,
    playing: false,
    playheadMs: 0,
    trimStartMs: 0,
    trimEndMs: 0,
    jumpTransitions: new Set(),
  };

  state.observerTeamColors = "blueOrange";
  state.playback.status = "paused";
});

function clipSample(timeMs: number, jump?: ClipSample["jump"]): ClipSample {
  return {
    timeMs,
    demoTimeSec: timeMs / 1000,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    fov: 70,
    aspect: 1.5,
    projection: "perspective",
    cameraMode: "freeFly",
    targetId: null,
    flagSlot: null,
    rate: 1,
    playing: true,
    ...(jump && { jump, cut: true }),
  };
}

function editingDraft() {
  const draft: ClipTake = {
    version: 1,
    sourceDemo: "test.rec",
    samples: [clipSample(0), clipSample(5000)],
  };
  state.clip = {
    draft,
    active: draft,
    playing: false,
    playheadMs: 5000,
    trimStartMs: 1000,
    trimEndMs: 4000,
    jumpTransitions: new Set(),
  };
}

it("replaces demo transport with an inline clip trim timeline until saved or discarded", () => {
  editingDraft();
  const markup = renderToStaticMarkup(<DemoPlaybackControls />);
  expect(markup).toContain("data-clip-editing");
  for (const label of ["Play clip", "Clip start", "Clip end", "Seek clip"])
    expect(markup).toContain(`aria-label="${label}"`);
  expect(markup).not.toContain("Save clip");
  expect(markup).not.toContain("Discard");
  expect(markup).not.toContain("data-playback-seek");
  expect(markup).not.toContain('aria-label="CastGenius"');
  expect(markup).not.toContain('id="playbackSpeed"');
});

it("disables draft transport and trim controls during save", () => {
  editingDraft();
  state.clip.draft!.samples.splice(1, 0, clipSample(2500, "quickCam"));
  const markup = renderToStaticMarkup(
    <ClipControlsContext
      value={{
        recordButton: null,
        recordAvailable: false,
        editorPanel: null,
        saving: true,
      }}
    >
      <DemoPlaybackControls />
    </ClipControlsContext>,
  );
  expect(markup).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Play clip"/);
  expect(markup).toMatch(/aria-label="Clip start"[^>]*data-disabled=""/);
  expect(markup).toMatch(/data-type="clip-jump"[^>]*disabled=""/);
});

it("shows jump markers from the draft and their selected preview choices", () => {
  editingDraft();
  state.clip.active = {
    ...state.clip.draft!,
    samples: [...state.clip.draft!.samples],
  };
  state.clip.draft!.samples.splice(1, 0, clipSample(2500, "quickCam"));
  state.clip.jumpTransitions.add(2500);
  const markup = renderToStaticMarkup(<DemoPlaybackControls />);
  expect(markup).toMatch(
    /data-type="clip-jump"[^>]*aria-label="Transition for Quick cam at 2.500s"[^>]*aria-pressed="true"/,
  );
});

it("uses clip time and duration for saved clips and offers replay at the end", () => {
  editingDraft();
  state.clip.draft = null;
  state.events = [
    {
      type: "match-start",
      timeSec: 80,
      description: "Another map",
    } as TimelineEvent,
  ];
  const markup = renderToStaticMarkup(<DemoPlaybackControls />);
  expect(markup).toContain('aria-label="Replay clip"');
  expect(markup).toContain('aria-valuemax="5"');
  expect(markup).toContain("0:05 / 0:05");
  expect(markup).not.toContain('aria-label="CastGenius"');
  expect(markup).not.toContain("Another map");
});

it("uses the same centered seek spinner in demo playback, clip playback and trimming", () => {
  state.playback.status = "seeking";
  const renderPlayIcon = () =>
    renderToStaticMarkup(<DemoPlaybackControls />).match(
      /<button[^>]*>([\s\S]*?)<\/button>/,
    )?.[1];
  const demoIcon = renderPlayIcon();
  expect(demoIcon).toContain(playbackStyles.PlaySpinner);

  editingDraft();
  expect(renderPlayIcon()).toBe(demoIcon);
  state.clip.draft = null;
  expect(renderPlayIcon()).toBe(demoIcon);
});

it("prevents starting CastGenius while a saved clip is being prepared", () => {
  state.clipRoute = "clip-one";
  const markup = renderToStaticMarkup(<DemoPlaybackControls />);
  expect(markup).toMatch(/<button[^>]*disabled=""[^>]*aria-label="CastGenius"/);
});

it.each(["saved", "draft"])(
  "ignores speed hotkeys during %s clip playback",
  (mode) => {
    editingDraft();
    if (mode === "saved") state.clip.draft = null;
    renderToStaticMarkup(<DemoPlaybackControls />);
    state.actions.get("decreasePlaybackSpeed")!();
    state.actions.get("increasePlaybackSpeed")!();
    expect(state.setSpeed).not.toHaveBeenCalled();
  },
);

it("keeps speed hotkeys available for ordinary demos", () => {
  renderToStaticMarkup(<DemoPlaybackControls />);
  state.actions.get("decreasePlaybackSpeed")!();
  state.actions.get("increasePlaybackSpeed")!();
  expect(state.setSpeed.mock.calls).toEqual([[0.5], [2]]);
});

it("shows Pause while the final announcement is finishing, then Play", () => {
  state.playback.status = "ending";
  expect(renderToStaticMarkup(<DemoPlaybackControls />)).toContain(
    'aria-label="Pause" title="Pause (Space)"',
  );
  state.playback.status = "paused";
  expect(renderToStaticMarkup(<DemoPlaybackControls />)).toContain(
    'aria-label="Play" title="Play (Space)"',
  );
});

function markers(...events: TimelineEvent[]) {
  state.events = events;
  return (
    renderToStaticMarkup(<DemoPlaybackControls />).match(
      /<button[^>]*data-type="(?:match-start|flag-cap)"[^>]*>[\s\S]*?<\/button>/g,
    ) ?? []
  );
}

it("adds capture markers with no held time in their labels alongside the match-start tick", () => {
  const result = markers(
    { type: "match-start", timeSec: 10, description: "Match started" },
    { type: "flag-grab", timeSec: 20, description: "Flag grabbed" },
    {
      type: "flag-cap",
      timeSec: 25,
      description: "Teammate captured the Inferno flag (Held: 00:04.70)",
      capturer: "Teammate",
      actorTeamId: 1,
      teamAffinity: "friendly",
    },
    { type: "flag-drop", timeSec: 30, description: "Flag dropped" },
    {
      type: "flag-cap",
      timeSec: 75,
      description: "Opponent captured the Storm flag",
      capturer: "Opponent",
      actorTeamId: 2,
      teamAffinity: "enemy",
    },
  );
  expect(result).toHaveLength(3);
  expect(result[0]).toContain("left:10%");
  expect(result[0]).toContain('title="Match started – 0:10"');
  expect(result[0]).toContain('d="M12 4.3v15.4"');
  expect(result[1]).toContain(`left:25%;color:${green}`);
  expect(result[1]).toContain("<svg");
  expect(result[1]).toContain('title="Storm scores (Teammate) – 0:25"');
  expect(result[1]).toContain(
    'aria-label="Seek to Storm scores (Teammate) – 0:25"',
  );
  expect(result[2]).toContain(`left:75%;color:${red}`);
  expect(result[2]).toContain('title="Inferno scores (Opponent) – 1:15"');
});

it("uses the scoring team's custom name rather than the captured flag's team", () => {
  expect(
    markers({
      type: "flag-cap",
      timeSec: 25,
      description: "Player captured the Inferno flag",
      capturer: "Player",
      actorTeamId: 1,
      actorTeamName: "Rambo",
      flagTeamName: "Inferno",
      flagTeamId: 2,
    })[0],
  ).toContain('title="Rambo scores (Player) – 0:25"');
});

it.each([
  ["blueOrange", blueMap, orange],
  ["greenRed", green, red],
  ["redGreen", red, green],
] as const)(
  "uses the scoring team's %s observer color",
  (scheme, team1, team2) => {
    state.observerTeamColors = scheme;
    const result = markers(
      {
        type: "flag-cap",
        timeSec: 25,
        description: "Inferno flag captured",
        actorTeamId: 1,
        flagTeamId: 2,
        teamAffinity: "neutral",
      },
      {
        type: "flag-cap",
        timeSec: 75,
        description: "Storm flag captured",
        actorTeamId: 2,
        flagTeamId: 1,
        teamAffinity: "neutral",
      },
    );
    expect(result[0]).toContain(`color:${team1}`);
    expect(result[1]).toContain(`color:${team2}`);
  },
);

it("keeps an unknown scoring team neutral", () => {
  expect(
    markers({ type: "flag-cap", timeSec: 25, description: "Flag captured" })[0],
  ).toContain(`color:${neutral}`);
});

it.each([
  ["blueOrange", blueMap, orange],
  ["greenRed", green, red],
  ["redGreen", red, green],
] as const)(
  "uses %s team colors for captures after a player returns to observer mode",
  (scheme, team1, team2) => {
    state.observerTeamColors = scheme;
    const result = markers(
      {
        type: "flag-cap",
        timeSec: 10,
        description: "Friendly capture while playing",
        actorTeamId: 1,
        teamAffinity: "friendly",
      },
      {
        type: "flag-cap",
        timeSec: 20,
        description: "Enemy capture while playing",
        actorTeamId: 2,
        teamAffinity: "enemy",
      },
      {
        type: "flag-cap",
        timeSec: 25,
        description: "Storm capture while observing",
        actorTeamId: 1,
        teamAffinity: "neutral",
      },
      {
        type: "flag-cap",
        timeSec: 75,
        description: "Inferno capture while observing",
        actorTeamId: 2,
        teamAffinity: "neutral",
      },
      {
        type: "flag-cap",
        timeSec: 80,
        description: "Unknown capture while observing",
        teamAffinity: "neutral",
      },
    );
    expect(result[0]).toContain(`color:${green}`);
    expect(result[1]).toContain(`color:${red}`);
    expect(result[2]).toContain(`color:${team1}`);
    expect(result[3]).toContain(`color:${team2}`);
    expect(result[4]).toContain(`color:${neutral}`);
  },
);

it("handles a capture-only timeline and multiple captures at the same timestamp", () => {
  const result = markers(
    {
      type: "flag-cap",
      timeSec: 25,
      description: "First capture",
      actorTeamId: 1,
      teamAffinity: "friendly",
    },
    {
      type: "flag-cap",
      timeSec: 25,
      description: "Second capture",
      actorTeamId: 1,
      teamAffinity: "neutral",
    },
    {
      type: "flag-cap",
      timeSec: 25,
      description: "Third capture",
      actorTeamId: 2,
      teamAffinity: "neutral",
    },
  );
  expect(result).toHaveLength(3);
  expect(result[0]).toContain(`color:${green}`);
  expect(result[1]).toContain(`color:${blueMap}`);
  expect(result[2]).toContain(`color:${orange}`);
});

it("omits markers before scanning and when the duration is zero", () => {
  state.events = null;
  expect(renderToStaticMarkup(<DemoPlaybackControls />)).not.toContain(
    'data-type="flag-cap"',
  );
  state.recording.duration = 0;
  expect(
    markers({ type: "flag-cap", timeSec: 25, description: "Flag captured" }),
  ).toEqual([]);
  const emptyTimeline = renderToStaticMarkup(<DemoPlaybackControls />);
  expect(emptyTimeline).not.toContain("NaN");
  expect(emptyTimeline).toContain('data-disabled=""');
});
