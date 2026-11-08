import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EditableGame } from "../state/editableGame";
import { TeamNamesDialog } from "./TeamNameDialog";

const fixture = vi.hoisted(() => ({
  game: null as EditableGame | null,
  savedNames: { 1: "Knights", 2: "Dragons" },
}));
vi.mock("./useEditableGame", async (original) => ({
  ...(await original<typeof import("./useEditableGame")>()),
  useEditableGame: () => fixture.game,
}));
vi.mock("../state/casterStore", () => ({
  useCaster: (select: (state: unknown) => unknown) =>
    select({
      publishedGame: { presentation: { teamNames: fixture.savedNames } },
    }),
}));
vi.mock("../state/gameEntityStore", () => ({ useDataSource: () => "demo" }));
vi.mock("./useIsWatchSpectator", () => ({ useIsWatchSpectator: () => false }));
vi.mock("../state/streamSnapshotStore", () => ({
  useStreamSnapshot: (select: (snapshot: { playerRoster: [] }) => unknown) =>
    select({ playerRoster: [] }),
}));
vi.mock("../state/gamePresentationApi", () => ({
  publishTeamNames: vi.fn(),
  readPublishedDemoPresentation: vi.fn(),
}));
vi.mock("./InputControls", () => ({
  inputControlsStore: { setState: vi.fn() },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("react-dom", async (original) => ({
  ...(await original<typeof import("react-dom")>()),
  createPortal: (children: ReactNode) => children,
}));
vi.mock("@ariakit/react", () => ({
  Dialog: ({
    children,
    className,
  }: {
    children: ReactNode;
    className: string;
  }) => <div className={className}>{children}</div>,
  DialogHeading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

beforeEach(() => {
  fixture.game = {
    id: "game",
    revision: 1,
    presentation: { title: "Final", teamNames: fixture.savedNames },
  };
  vi.stubGlobal("document", { body: {} });
});
afterEach(() => vi.unstubAllGlobals());

function render() {
  return renderToStaticMarkup(
    <TeamNamesDialog
      teams={[
        { teamId: 1, name: "Storm" },
        { teamId: 2, name: "Inferno" },
      ]}
      customNames={{ 1: "Storm" }}
      onClose={() => {}}
      onSave={() => {}}
    />,
  );
}

it("offers an unchecked save-to-demo option and one Save action without help text", () => {
  const html = render();
  expect(html).toContain("Save to demo data");
  expect(html).toContain('type="checkbox"');
  expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
  expect(html).not.toContain("Only affects your view");
  expect(html).not.toContain("Save for everyone");
  expect(html).not.toContain("Save for me");
  expect(html).toContain(">Save</button>");
  expect(html).toContain(">Cancel</button>");
  expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled/);
});

it("keeps the checkbox available on old published recordings", () => {
  fixture.game = {
    id: "legacy",
    revision: 0,
    presentation: {},
    demo: { filename: "old-2002.rec" },
  };
  const html = render();
  expect(html).toContain("Save to demo data");
  expect(html).not.toContain("Loading current demo data");
  expect(html).not.toContain("Choose a game");
});

it("shows only personal Save and Cancel when shared editing is not authorized", () => {
  fixture.game = null;
  const html = render();
  expect(html).not.toContain("Save to demo data");
  expect(html).toContain(">Save</button>");
});

it("keeps explicit default-valued personal names separate from saved placeholders", () => {
  const html = render();
  expect(html).toContain('value="Storm"');
  expect(html).toContain('placeholder="Knights"');
  expect(html).toContain('placeholder="Dragons"');
});
