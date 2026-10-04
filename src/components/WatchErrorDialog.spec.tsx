import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { WatchErrorDialog } from "./WatchErrorDialog";

it.each(["new join", "active viewer"])(
  "presents an admin restriction without a reconnect action for a %s",
  (scenario) => {
    const markup = renderToStaticMarkup(
      <WatchErrorDialog
        endReason="watchingDisabled"
        message="Server admins have disabled watching for this mission."
        onBrowse={vi.fn()}
        onRejoin={scenario === "active viewer" ? vi.fn() : undefined}
        onRetry={vi.fn()}
      />,
    );
    expect(markup).toContain('aria-label="Watching disabled"');
    expect(markup).toContain("Server admins have disabled watching");
    expect(markup).toContain("Browse servers");
    expect(markup).not.toContain("Rejoin");
    expect(markup).not.toContain("Retry");
    expect(markup).not.toContain("Uplink failure");
  },
);

it("preserves reconnect actions for ordinary connection failures", () => {
  const markup = renderToStaticMarkup(
    <WatchErrorDialog
      message="Connection lost"
      onBrowse={vi.fn()}
      onRejoin={vi.fn()}
    />,
  );
  expect(markup).toContain('aria-label="Uplink failure"');
  expect(markup).toContain("Rejoin");
});
