import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  DataSaveButton,
  GameDataSelector,
  TeamNameFields,
} from "./GameDataFields";

it("keeps the same Save label and reserved spinner slot while idle, loading, and saving", () => {
  const ready = renderToStaticMarkup(<DataSaveButton />);
  const loading = renderToStaticMarkup(<DataSaveButton loading />);
  const saving = renderToStaticMarkup(<DataSaveButton saving />);
  for (const html of [ready, loading, saving]) {
    expect(html).toContain(">Save</button>");
    expect(html).not.toContain("Saving…");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("<p");
  }
  expect(ready).toContain('aria-busy="false"');
  expect(ready).not.toContain("Loading demo data");
  expect(loading).toContain("Loading demo data");
  expect(saving).toContain("Saving data");
  expect(loading).toContain('aria-busy="true"');
  expect(saving).toContain('aria-busy="true"');
  expect(loading).toContain('disabled=""');
  expect(saving).toContain('disabled=""');
});

vi.mock("../state/streamSnapshotStore", () => ({
  useStreamSnapshot: (select: (snapshot: { playerRoster: [] }) => unknown) =>
    select({ playerRoster: [] }),
}));

const teams = [
  { teamId: 2, name: "Inferno" },
  { teamId: 1, name: "Storm" },
];

it("shows mission/time only when a recording needs a game selector", () => {
  const games = [
    { mission: "Katabatic", gameType: "CTF", startMs: 0, tournament: false },
    {
      mission: "Raindance",
      gameType: "CTF",
      startMs: 120000,
      tournament: false,
    },
  ];
  expect(
    renderToStaticMarkup(
      <GameDataSelector
        games={games.slice(0, 1)}
        selectedIndex={0}
        onSelect={() => {}}
      />,
    ),
  ).toBe("");
  const html = renderToStaticMarkup(
    <GameDataSelector games={games} selectedIndex={null} onSelect={() => {}} />,
  );
  expect(html).toContain("Choose a game…");
  expect(html).toContain("Katabatic");
  expect(html).toContain("2:00");
});

it("keeps personal name presence separate from the saved and server names", () => {
  const html = renderToStaticMarkup(
    <TeamNameFields
      teams={teams}
      names={{ 1: "Storm" }}
      savedNames={{ 1: "Knights" }}
      onChange={() => {}}
    />,
  );
  const inputs = html.match(/<input[^>]*>/g)!;
  expect(inputs[0]).toContain("team-1");
  expect(inputs[0]).toContain('value="Storm"');
  expect(inputs[0]).toContain('placeholder="Knights"');
  expect(inputs[1]).toContain('value=""');
  expect(inputs[1]).toContain('placeholder="Inferno"');
  expect(html).toContain("Saved: Knights");
  expect(html).toContain("Server: Inferno");
  const resets = html.match(/<button[^>]*>/g)!;
  expect(resets[0]).not.toContain("disabled");
  expect(resets[1]).toContain("disabled");
});

it("renders unset overrides as empty fields with saved-name placeholders", () => {
  const html = renderToStaticMarkup(
    <TeamNameFields
      teams={teams}
      names={{}}
      savedNames={{ 1: "Knights" }}
      autoFocus={false}
      onChange={() => {}}
    />,
  );
  expect(html).not.toContain('value="Knights"');
  expect(html).toContain('placeholder="Knights"');
  expect(html).not.toContain("autofocus");
  expect(html.match(/disabled=""/g)).toHaveLength(2);
});
