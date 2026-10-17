import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactNode, type ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { TimelineEvent } from "../state/demoTimelineStore";
import { DemoTimeline } from "./DemoTimeline";
import type { TeamColorScheme } from "./iffTheme";

const state = vi.hoisted(() => ({
  events: [] as TimelineEvent[],
  scanProgress: null,
  error: null,
  recording: { recorderName: "MapGenius" },
  observerTeamColors: "blueOrange" as TeamColorScheme,
}));

const hooks = vi.hoisted(() => ({
  states: [] as { value: unknown; set: (value: unknown) => void }[],
  effects: [] as (readonly unknown[])[],
  pending: [] as (() => void)[],
  stateIndex: 0,
  effectIndex: 0,
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.stateIndex++;
    const slot = (hooks.states[index] ??= {
      value: typeof initial === "function" ? initial() : initial,
      set(value: unknown) {
        slot.value = typeof value === "function" ? value(slot.value) : value;
      },
    });
    return [slot.value, slot.set];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void, deps: readonly unknown[]) => {
    const index = hooks.effectIndex++;
    const previous = hooks.effects[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous[i])))
      hooks.pending.push(effect);
    hooks.effects[index] = deps;
  },
}));

vi.mock("../state/demoTimelineStore", () => ({
  useDemoTimeline: (selector: (value: typeof state) => unknown) =>
    selector(state),
}));
vi.mock("../state/gameEntityStore", () => ({
  useRecorderName: () => "OldName",
}));
vi.mock("../state/demoTimelineFollow", () => ({ seekToTimelineEvent() {} }));
vi.mock("./usePlayback", () => ({ useRecording: () => state.recording }));
vi.mock("./SettingsProvider", () => ({
  useSettings: () => ({
    setSidebarOpen() {},
    observerTeamColors: state.observerTeamColors,
  }),
}));
vi.mock("./useMediaQuery", () => ({ useMediaQuery: () => false }));

beforeEach(() => {
  hooks.states = [];
  hooks.effects = [];
  hooks.pending = [];
  state.recording = { recorderName: "MapGenius" };
  state.observerTeamColors = "blueOrange";
  state.events = [];
});

function tree() {
  hooks.stateIndex = hooks.effectIndex = 0;
  const result = DemoTimeline();
  if (hooks.pending.length) {
    for (const effect of hooks.pending.splice(0)) effect();
    return tree();
  }
  return result;
}

function elements(node: ReactNode): ReactElement<Record<string, any>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, any>>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function category(label: string) {
  return elements(tree()).find(
    (node) =>
      node.type === "button" &&
      renderToStaticMarkup(node)
        .replace(/<[^>]*>/g, "")
        .startsWith(`${label} (`),
  )!;
}

function mine() {
  return elements(tree()).find(
    (node) => node.type === "input" && node.props.type === "checkbox",
  )!;
}

const markup = () => renderToStaticMarkup(tree());

function renderMarkup(...events: TimelineEvent[]) {
  state.events = events;
  return markup();
}

function render(...events: TimelineEvent[]) {
  return renderMarkup(...events).replace(/<[^>]*>/g, "");
}

it.each([true, false])(
  "uses only the original message as the whole entry's tooltip (message=%s)",
  (hasMessage) => {
    state.events = [
      {
        type: "kill",
        timeSec: 1,
        description: "Alice killed Bob",
        killer: "Alice",
        victim: "Bob",
        raw: { killer: "\x10\bAlice\x11", victim: "\x10\bBob\x11" },
        originalMessage: hasMessage ? "Bob ate Alice's disc." : undefined,
      },
      {
        type: "rename",
        timeSec: 2,
        description: "Alice is now Carol",
        previousName: "Alice",
        actor: "Carol",
        raw: { previousName: "\x10\bAlice\x11", actor: "\x10\bCarol\x11" },
        originalMessage: hasMessage
          ? "Alice changed name to Carol."
          : undefined,
      },
      {
        type: "death",
        timeSec: 3,
        description: "Carol cratered",
        victim: "Carol",
        weapon: "ground",
        originalMessage: hasMessage
          ? "Carol hit the ground too hard."
          : undefined,
      },
      {
        type: "generator-online",
        timeSec: 4,
        description: "Storm generator online",
      },
    ];
    category("All").props.onClick();
    const rows = elements(tree()).filter(
      (node) => node.type === "button" && "title" in node.props,
    );
    expect(rows).toHaveLength(4);
    rows.forEach((row, i) => {
      expect(row.props.title).toBe(state.events[i].originalMessage);
      const titles = [...renderToStaticMarkup(row).matchAll(/title="/g)];
      expect(titles).toHaveLength(state.events[i].originalMessage ? 1 : 0);
    });
  },
);

it.each([
  ["flag-grab", "You grabbed the enemy flag"],
  ["flag-drop", "You dropped the flag"],
  ["flag-return", "You returned the flag"],
  ["flag-cap", "You captured a flag"],
  ["generator-offline", "You destroyed the generator"],
  ["generator-online", "You repaired the generator"],
  ["rename", "You are now NewName"],
] as const)("keeps recorder %s labels after a rename", (type, label) => {
  expect(
    render({
      type,
      timeSec: 1,
      description: "Recorder event",
      isRecorder: true,
      killer: "NewName",
      victim: "Opponent",
      actor: "NewName",
      capturer: "NewName",
      previousName: "OldName",
      raw: { actor: "\x10\bNewName\x11", capturer: "\x10\bNewName\x11" },
    }),
  ).toContain(label);
});

it.each([
  ["flag-cap", "Teammate captured the enemy flag"],
  ["generator-offline", "Teammate destroyed the Storm generator"],
  ["generator-online", "Teammate repaired the Storm generator"],
  ["rename", "OldName is now Teammate"],
] as const)("keeps other players' names for %s", (type, label) => {
  const text = render({
    type,
    timeSec: 1,
    description: "Unused description",
    isRecorder: false,
    teamAffinity: "friendly",
    actor: "Teammate",
    capturer: "Teammate",
    previousName: "OldName",
    raw: { actor: "\x10\bTeammate\x11", capturer: "\x10\bTeammate\x11" },
    generatorLabel: "Storm generator",
  });
  expect(text).toContain(label);
  expect(text).not.toContain("You");
});

it.each([
  ["flag-cap", "You captured a flag"],
  ["generator-offline", "You destroyed the generator"],
  ["generator-online", "You repaired the generator"],
] as const)("labels recorder %s without a name", (type, label) => {
  expect(
    render({
      type,
      timeSec: 1,
      description: "Unused description",
      isRecorder: true,
    }),
  ).toContain(label);
});

it("labels the recorder's death even when its navigation target is the killer", () => {
  state.events = [
    {
      type: "kill",
      timeSec: 1,
      description: "Killed by Opponent",
      isRecorder: false,
      victimIsRecorder: true,
      killer: "Opponent",
      victim: "NewName",
    },
  ];
  category("Deaths").props.onClick();
  expect(markup().replace(/<[^>]*>/g, "")).toContain("Opponent killed you");
});

it("names another player using the recorder's former name", () => {
  expect(
    render({
      type: "flag-grab",
      timeSec: 1,
      description: "OldName grabbed the flag",
      isRecorder: false,
      actor: "OldName",
    }),
  ).toContain("OldName grabbed the enemy flag");
});

it.each([
  ["him", false, "disc", "Player disced himself"],
  ["her", false, "disc", "Player disced herself"],
  ["her", true, "disc", "You disced yourself"],
  ["him", true, "mortar", "You mortared yourself"],
  ["her", false, "plasma", "Player plasma rifled herself"],
  ["him", false, "chaingun", "Player chaingunned himself"],
  ["her", false, "mine", "Player mined herself"],
  ["him", false, "satchelcharge", "Player satchelcharged himself"],
  ["him", false, "explosion", "Player exploded himself"],
  ["him", false, "turret", "Player was shot by his own base turret"],
  ["her", false, "plasma turret", "Player was shot by her own plasma turret"],
  ["her", true, "turret", "You were shot by your own base turret"],
  [undefined, false, "turret", "Player was shot by their own base turret"],
  [undefined, false, "disc", "Player disced themselves"],
] as const)(
  "renders self-weapon deaths: %s / %s / %s",
  (victimPronoun, isRecorder, weapon, label) => {
    state.events = [
      {
        type: "death",
        timeSec: 1,
        description: `Killed by own ${weapon}`,
        victim: "Player",
        raw: { victim: "\x10\bPlayer\x11" },
        weapon,
        selfKill: true,
        victimPronoun,
        isRecorder,
      },
    ];
    category("Deaths").props.onClick();
    expect(markup().replace(/<[^>]*>/g, "")).toContain(label);
    expect(markup()).toContain('data-type="death"');
    expect(renderToStaticMarkup(category("Kills"))).toContain("Kills (0)");
  },
);

it.each([
  [undefined, "died"],
  ["default", "died"],
  ["blaster", "was shot by a blaster"],
  ["plasma", "was shot by a plasma rifle"],
  ["chaingun", "was shot by a chaingun"],
  ["disc", "was hit by a disc"],
  ["grenade", "was hit by a grenade"],
  ["laser", "was shot by a laser rifle"],
  ["ELF", "was killed by an ELF projector"],
  ["mortar", "was hit by a mortar"],
  ["missile", "was hit by a missile"],
  ["shocklance", "was killed by a shocklance"],
  ["mine", "was killed by a mine"],
  ["explosion", "died in an explosion"],
  ["impact", "was run over by a vehicle"],
  ["ground", "cratered"],
  ["turret", "was shot by a base turret"],
  ["plasma turret", "was shot by a plasma turret"],
  ["AA turret", "was shot by an AA turret"],
  ["ELF turret", "was shot by an ELF turret"],
  ["mortar turret", "was shot by a mortar turret"],
  ["missile turret", "was shot by a missile turret"],
  ["clamp turret", "was shot by an indoor deployable turret"],
  ["spike turret", "was shot by an outdoor deployable turret"],
  ["sentry turret", "was shot by a sentry turret"],
  ["out of bounds", "died out of bounds"],
  ["lava", "died in lava"],
  ["shrike blaster", "was shot by a Shrike"],
  ["belly turret", "was shot by a Havoc belly turret"],
  ["bomber bomb", "was hit by a bomber bomb"],
  ["tank chaingun", "was shot by a tank chaingun"],
  ["tank mortar", "was hit by a tank mortar"],
  ["satchel charge", "was killed by a satchel charge"],
  ["satchelcharge", "was killed by a satchel charge"],
  ["MPB missile", "was hit by an MPB missile"],
  ["lighting", "was struck by lightning"],
  ["ForceField", "died in a force field"],
  ["Crash", "died in a vehicle crash"],
  ["nexus camping", "was killed for camping at the Nexus"],
  ["suicide", "suicided"],
  ["custom weapon", "died from custom weapon damage"],
] as const)("renders %s deaths as a sentence", (weapon, action) => {
  state.events = [
    {
      type: "death",
      timeSec: 1,
      description: "Unused description",
      victim: "Player",
      weapon,
    },
  ];
  category("Deaths").props.onClick();
  const text = markup().replace(/<[^>]*>/g, "");
  expect(text).toContain(`Player ${action}`);
  expect(text).not.toContain(" — ");
});

it.each([
  ["msgsuicide", "suicided"],
  ["msgoobkill", "died out of bounds"],
  ["msglavakill", "died in lava"],
  ["msglightningkill", "were struck by lightning"],
  ["msgcampkill", "were killed for camping at the Nexus"],
  ["msgvehiclecrash", "died in a vehicle crash"],
  ["msgvehiclespawnkill", "were in a vehicle spawn field"],
  ["msgturretkill", "were shot by a turret"],
  ["msgcturretkill", "were shot by a turret"],
  ["msgturretselfkill", "were shot by your own turret"],
  ["msgexplosionkill", "died in an explosion"],
  ["msgvehiclekill", "were run over by a vehicle"],
  ["msgrogueminekill", "were killed by a mine"],
  ["msgselfkill", "died"],
])(
  "uses %s when damage text is absent, with recorder grammar",
  (deathMessage, action) => {
    state.events = [
      {
        type: "death",
        timeSec: 1,
        description: "Unused description",
        victim: "Player",
        isRecorder: true,
        deathMessage,
      },
    ];
    category("Deaths").props.onClick();
    expect(markup().replace(/<[^>]*>/g, "")).toContain(`You ${action}`);
  },
);

it("keeps an unknown victim's death a complete sentence", () => {
  state.events = [
    { type: "death", timeSec: 1, description: "Unused description" },
  ];
  category("Deaths").props.onClick();
  expect(markup().replace(/<[^>]*>/g, "")).toContain("A player died");
});

it("groups generator state changes and keeps player filters for observers", () => {
  const text = render(
    { type: "generator-offline", timeSec: 1, description: "Generator offline" },
    { type: "generator-online", timeSec: 2, description: "Generator online" },
    { type: "rename", timeSec: 3, description: "Name changed" },
  );
  expect(text).toContain("All (3)");
  expect(text).toContain("Gens (2)");
  expect(text).toContain("Renames (1)");
  expect(text).toContain("Kills (0)");
  expect(text).toContain("Deaths (0)");
});

it("keeps empty categories available", () => {
  const text = render();
  expect(text).toContain("Kills (0)");
  expect(text).toContain("Deaths (0)");
  expect(text).toContain("Renames (0)");
});

it.each([
  ["MapGenius", false],
  ["mapgenius", false],
  ["Player", true],
  ["Spectator", true],
])(
  "defaults Mine to %s's recording type, independently of categories",
  (recorderName, checked) => {
    state.recording = { recorderName: recorderName as string };
    expect(mine().props.checked).toBe(checked);
    for (const label of ["All", "Kills", "Deaths"])
      expect(category(label).props["aria-pressed"]).toBe(false);
    for (const label of [
      "Grabs",
      "Drops",
      "Returns",
      "Caps",
      "Gens",
      "Renames",
    ])
      expect(category(label).props["aria-pressed"]).toBe(true);
    expect(category("Match")).toBeUndefined();
    const controls = elements(tree()).filter(
      (node) => node.type === "input" || node.type === "button",
    );
    expect(controls[0].type).toBe("input");
    expect(markup()).toContain("Only the recorder’s events");
  },
);

const combat = (
  killer: string,
  victim: string,
  isRecorder = false,
  victimIsRecorder = false,
): TimelineEvent => ({
  timeSec: 1,
  type: "kill",
  description: `${killer} killed ${victim}`,
  killer,
  victim,
  isRecorder,
  victimIsRecorder,
});

it("toggles categories independently and shows each combat incident once", () => {
  state.events = [
    combat("Alice", "Bob"),
    {
      timeSec: 2,
      type: "death",
      victim: "Carol",
      weapon: "ground",
      description: "Carol cratered",
    },
    { timeSec: 3, type: "flag-grab", actor: "Dave", description: "Grab" },
  ];
  expect(markup()).not.toContain('data-type="kill"');
  expect(markup()).not.toContain('data-type="death"');
  expect(markup()).toContain('data-type="flag-grab"');
  category("Kills").props.onClick();
  expect(markup()).toContain("Alice");
  expect(markup()).not.toContain("Carol");
  category("Deaths").props.onClick();
  expect(markup().match(/data-type="kill"/g)).toHaveLength(1);
  expect(markup()).toContain("Carol");
  category("Kills").props.onClick();
  expect(markup().match(/data-type="death"/g)).toHaveLength(2);
  category("Deaths").props.onClick();
  expect(markup()).not.toContain('data-type="kill"');
  category("All").props.onClick();
  expect(markup().match(/data-type="(?:kill|death|flag-grab)"/g)).toHaveLength(
    3,
  );
  category("All").props.onClick();
  expect(markup()).toContain("No events found.");
});

it("uses the killer for Mine + Kills and the victim for Mine + Deaths", () => {
  state.recording = { recorderName: "Player" };
  state.events = [
    combat("Player", "Victim", true),
    combat("Killer", "Player", false, true),
    combat("Other", "Bystander"),
    {
      timeSec: 2,
      type: "death",
      victim: "Player",
      weapon: "ground",
      description: "Player cratered",
      isRecorder: true,
    },
    {
      timeSec: 3,
      type: "death",
      victim: "Other",
      deathMessage: "msgsuicide",
      description: "Other suicided",
    },
  ];
  expect(renderToStaticMarkup(category("Kills"))).toContain("Kills (1)");
  expect(renderToStaticMarkup(category("Deaths"))).toContain("Deaths (2)");
  category("Kills").props.onClick();
  expect(markup().replace(/<[^>]*>/g, "")).toContain("You killed Victim");
  expect(markup().replace(/<[^>]*>/g, "")).not.toContain("Killer killed you");
  category("Kills").props.onClick();
  category("Deaths").props.onClick();
  expect(markup().replace(/<[^>]*>/g, "")).toContain("Killer killed you");
  expect(markup()).toContain("cratered");
  expect(markup().replace(/<[^>]*>/g, "")).not.toContain("You killed Victim");
  mine().props.onChange({ target: { checked: false } });
  expect(markup()).toContain("Bystander");
  expect(markup()).toContain("suicided");
});

it("always shows match events while filtering generators by ownership", () => {
  state.events = [
    {
      timeSec: 1,
      type: "generator-offline",
      actor: "Player",
      isRecorder: true,
      description: "Mine",
    },
    {
      timeSec: 2,
      type: "generator-offline",
      actor: "Other",
      isRecorder: false,
      description: "Other",
    },
    { timeSec: 3, type: "generator-online", description: "Unattributed" },
    { timeSec: 4, type: "match-start", description: "Match started" },
    { timeSec: 5, type: "match-countdown", description: "Countdown started" },
    { timeSec: 6, type: "match-end", description: "Match ended" },
  ];
  expect(markup().match(/data-type=/g)).toHaveLength(6);
  mine().props.onChange({ target: { checked: true } });
  expect(markup().match(/data-type=/g)).toHaveLength(4);
  expect(renderToStaticMarkup(category("Gens"))).toContain("Gens (1)");
  expect(category("Gens").props["aria-pressed"]).toBe(true);
  expect(category("Kills").props["aria-pressed"]).toBe(false);
  category("All").props.onClick();
  category("All").props.onClick();
  expect(markup().match(/data-type="match-[^"]+"/g)).toHaveLength(3);
  expect(markup().match(/data-type=/g)).toHaveLength(3);
  mine().props.onChange({ target: { checked: false } });
  expect(markup().match(/data-type=/g)).toHaveLength(3);
});

it("resets categories and Mine when another demo's events arrive", () => {
  category("All").props.onClick();
  mine().props.onChange({ target: { checked: true } });
  state.events = [];
  expect(mine().props.checked).toBe(false);
  expect(category("Kills").props["aria-pressed"]).toBe(false);
  expect(category("Grabs").props["aria-pressed"]).toBe(true);
  state.recording = { recorderName: "Player" };
  state.events = [];
  expect(mine().props.checked).toBe(true);
});

it.each(["flag-grab", "flag-drop", "flag-return"] as const)(
  "does not label a teammate's %s as the recorder's action",
  (type) => {
    const text = render({
      type,
      timeSec: 1,
      actor: "Teammate",
      teamAffinity: "friendly",
      description: "Flag action",
    });
    expect(text).toContain("Teammate");
    expect(text).not.toContain("You");
  },
);

const flagTypes = [
  "flag-grab",
  "flag-drop",
  "flag-return",
  "flag-cap",
] as const;

function flagColor(event: TimelineEvent) {
  return /data-type="flag-[^"]+" style="color:([^"]+)"/.exec(
    renderMarkup(event),
  )?.[1];
}

it.each([
  ["blueOrange", "rgb(45, 162, 255)", "rgb(255, 100, 15)"],
  ["greenRed", "rgb(0, 212, 71)", "rgb(255, 60, 10)"],
  ["redGreen", "rgb(255, 60, 10)", "rgb(0, 212, 71)"],
] as const)(
  "colors every observer flag action by its owner's team using %s",
  (scheme, team1, team2) => {
    state.observerTeamColors = scheme;
    for (const type of flagTypes) {
      for (const [actorTeamId, color] of [
        [1, team1],
        [2, team2],
      ] as const) {
        expect(
          flagColor({
            type,
            timeSec: 1,
            description: "Flag event",
            actorTeamId,
            flagTeamId: type === "flag-return" ? actorTeamId : 3 - actorTeamId,
            teamAffinity: "neutral",
          }),
        ).toBe(color);
      }
    }
  },
);

it.each(flagTypes)(
  "colors player %s icons by friendly/enemy action",
  (type) => {
    state.observerTeamColors = "redGreen";
    for (const [teamAffinity, color] of [
      ["friendly", "rgb(0, 212, 71)"],
      ["enemy", "rgb(255, 60, 10)"],
    ] as const) {
      expect(
        flagColor({
          type,
          timeSec: 1,
          description: "Flag event",
          teamAffinity,
          actorTeamId: teamAffinity === "friendly" ? 1 : 2,
          flagTeamId: teamAffinity === "friendly" ? 2 : 1,
        }),
      ).toBe(color);
    }
  },
);

it("updates observer flag colors when the configured palette changes", () => {
  const event: TimelineEvent = {
    type: "flag-cap",
    timeSec: 1,
    description: "Flag captured",
    actorTeamId: 1,
    flagTeamId: 2,
  };
  expect(flagColor(event)).toBe("rgb(45, 162, 255)");
  state.observerTeamColors = "redGreen";
  expect(flagColor(event)).toBe("rgb(255, 60, 10)");
});

it("keeps every cap and its event-time color when captures share a timestamp", () => {
  const markup = renderMarkup(
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
  expect(markup.match(/data-type="flag-cap"/g)).toHaveLength(3);
  expect(markup).toContain("Caps (3)");
  expect(
    [...markup.matchAll(/data-type="flag-cap" style="color:([^"]+)"/g)].map(
      (match) => match[1],
    ),
  ).toEqual(["rgb(0, 212, 71)", "rgb(45, 162, 255)", "rgb(255, 100, 15)"]);
});

it.each([undefined, 0, 3])(
  "keeps unknown observer action team %s neutral",
  (actorTeamId) => {
    expect(
      flagColor({
        type: "flag-cap",
        timeSec: 1,
        description: "Flag captured",
        actorTeamId,
        flagTeamId: 1,
      }),
    ).toBe("rgb(200, 200, 200)");
  },
);
