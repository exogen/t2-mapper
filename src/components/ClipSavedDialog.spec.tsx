import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { ClipView } from "../../relay/clipTypes";
import { ClipSavedDialog } from "./ClipSavedDialog";

vi.mock("@ariakit/react", async (original) => ({
  ...(await original<typeof import("@ariakit/react")>()),
  Dialog: ({ children }: { children: ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogHeading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

afterEach(() => vi.unstubAllGlobals());

const clip: ClipView = {
  id: "12345678-1234-4123-8123-123456789abc",
  sourceDemo: "match.rec",
  title: "Clip of S5-Damnation CTF from Sat, Nov 14, 2026",
  startSec: 10,
  ownerDiscordId: "126767979894407168",
  createdAt: 0,
  state: "processing",
  checkpointUrl: "/unused",
};
const defaults = {
  clip: null,
  saving: true,
  error: null,
  statusError: null,
  copied: false,
  onCopy: vi.fn(),
  onClose: vi.fn(),
};
function render(props: Partial<Parameters<typeof ClipSavedDialog>[0]> = {}) {
  vi.stubGlobal("window", { location: { href: "https://play.example.com/" } });
  return renderToStaticMarkup(<ClipSavedDialog {...defaults} {...props} />);
}

it("keeps the share field and actions present but disabled while the title and link load", () => {
  const markup = render();
  expect(markup).toContain("Saving clip…");
  expect(markup).toContain("Skeleton");
  expect(markup).toMatch(/aria-label="Clip share link"[^>]*disabled=""/);
  expect(markup).toMatch(/disabled=""[^>]*aria-label="Copy clip link"/);
  expect(markup).toMatch(/disabled=""[^>]*>[\s\S]*?Play clip/);
  expect(markup).toMatch(/aria-label="Close saved clip"[^>]*disabled=""/);
});

it.each(["processing", "ready"] as const)(
  "fills in the same share field when the clip is %s",
  (state) => {
    const markup = render({ clip: { ...clip, state }, saving: false });
    expect(markup).toContain(clip.title);
    expect(markup).not.toContain("Skeleton");
    expect(markup).toContain(`clip=${clip.id}`);
    expect(markup).not.toMatch(/aria-label="Clip share link"[^>]*disabled=""/);
    expect(markup).toContain(
      state === "ready"
        ? "Your clip is ready to share."
        : "Preparing the clip’s starting checkpoint…",
    );
  },
);

it("keeps failed-save recovery inside the dialog", () => {
  const markup = render({
    saving: false,
    error: "Connection interrupted",
    onRetry: vi.fn(),
  });
  expect(markup).toContain('role="alert"');
  expect(markup).toContain("Connection interrupted");
  expect(markup).toContain("Your recording is still available.");
  expect(markup).toContain("Retry");
  expect(markup).not.toMatch(/aria-label="Close saved clip"[^>]*disabled=""/);
});
