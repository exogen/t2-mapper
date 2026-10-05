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
    expect(markup).toContain('aria-label="Transmission ended"');
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

it.each([
  [
    "You are not allowed to play on this server.",
    "You are not allowed to play on this server.",
  ],
  ["PASSWORD", "This server requires a password."],
  ["CR_YOUAREBANNED", "You are not allowed to play on this server."],
  ["CR_SERVERFULL", "This server is full."],
  ["CR_AUTHENTICATION_FAILED", "Authentication with the game server failed."],
  [
    "CR_INVALID_CONNECT_PACKET",
    "The server rejected the connection request as invalid.",
  ],
  [
    "CHR_PROTOCOL_SERVER",
    "The server uses an older, incompatible game protocol.",
  ],
  ["CHR_PROTOCOL", "The server requires a newer game protocol."],
  [
    "CHR_NOT_AUTHENTICATED",
    "This server requires an authenticated game account.",
  ],
  [
    "CHR_INVALID_SERVER_PACKET",
    "The server sent an invalid connection response.",
  ],
  [
    "WS_PeerAuthServer_ExpiredClientCertificate",
    "The game account&#x27;s authentication has expired.",
  ],
  ["Custom server refusal", "Custom server refusal"],
  ["Unable to reconnect to the relay.", "Unable to reconnect to the relay."],
])("shows the join failure %s", (message, expected) => {
  const markup = renderToStaticMarkup(
    <WatchErrorDialog message={message} onBrowse={vi.fn()} />,
  );
  expect(markup).toContain('role="dialog"');
  expect(markup).toContain(expected);
  expect(markup).toContain("Browse servers");
});
