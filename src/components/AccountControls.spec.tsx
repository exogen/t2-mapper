import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AppAccountState } from "../state/appAccountStore";
import { AccountControls } from "./AccountControls";

const state = vi.hoisted(() => ({ account: {} as AppAccountState }));
vi.mock("../state/appAccountStore", () => ({
  useAppAccount: (selector: (value: AppAccountState) => unknown) =>
    selector(state.account),
  consumeAccountSignInError() {},
  refreshAccount() {},
  signInWithDiscord() {},
  signOutAccount() {},
}));

beforeEach(() => {
  state.account = {
    status: "ready",
    enabled: true,
    user: null,
    pending: null,
    error: null,
  };
});

it("offers Discord sign-in without account creation or profile fields", () => {
  const markup = renderToStaticMarkup(<AccountControls />);
  expect(markup).toContain("Sign in with Discord");
  expect(markup).not.toContain("<input");
  expect(markup).not.toContain("Relay status");
});

it("hides the account controls when the relay has not enabled login", () => {
  state.account.enabled = false;
  expect(renderToStaticMarkup(<AccountControls />)).toBe("");
});

it("hides an initial request failure before account support is known", () => {
  state.account.enabled = null;
  state.account.status = "error";
  state.account.error = "Sign-in is unavailable. Please try again.";
  expect(renderToStaticMarkup(<AccountControls />)).toBe("");
});

it.each(["admin", "user"] as const)(
  "shows the Discord profile and a crown only for the admin role (%s)",
  (role) => {
    state.account.user = {
      id: "1",
      name: "Example <Player>",
      image: "https://cdn.discordapp.com/example.png",
      role,
      discordId: "123456789012345678",
      discordUsername: "example_player",
    };
    const markup = renderToStaticMarkup(<AccountControls />);
    expect(markup).toContain("Example &lt;Player&gt;");
    expect(markup).toContain("@example_player");
    expect(markup).toContain("Sign out");
    expect(markup.includes('role="img" aria-label="Admin"')).toBe(
      role === "admin",
    );
    expect(markup).not.toContain("Relay status");
    expect(markup).not.toContain(">Admin<");
    expect(markup).not.toContain("Sign in with Discord");
  },
);

it("shows a retry action for an unavailable session API", () => {
  state.account.status = "error";
  state.account.error = "Sign-in is unavailable. Please try again.";
  const markup = renderToStaticMarkup(<AccountControls />);
  expect(markup).toContain('role="alert"');
  expect(markup).toContain("Retry");
  expect(markup).not.toContain("Sign in with Discord");
});

it("prevents duplicate sign-in actions while Discord is opening", () => {
  state.account.pending = "sign-in";
  const markup = renderToStaticMarkup(<AccountControls />);
  expect(markup).toContain("Opening Discord…");
  expect(markup).toContain('disabled=""');
});
