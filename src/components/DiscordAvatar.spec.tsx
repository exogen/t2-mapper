import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ failed: false }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: () => [
    state.failed,
    (failed: boolean) => {
      state.failed = failed;
    },
  ],
}));

import { DiscordAvatar } from "./DiscordAvatar";

it("replaces a failed avatar image with the local Discord icon", () => {
  const props = {
    src: "https://cdn.discordapp.com/avatars/example.png",
    size: 32,
    className: "avatar",
    fallbackClassName: "fallback",
  };
  const image = DiscordAvatar(props) as ReactElement<{ onError(): void }>;
  expect(image.type).toBe("img");
  image.props.onError();

  const markup = renderToStaticMarkup(<DiscordAvatar {...props} />);
  expect(markup).toContain("<svg");
  expect(markup).toContain('class="fallback"');
  expect(markup).toContain('aria-hidden="true"');
  expect(markup).not.toContain("<img");
});
