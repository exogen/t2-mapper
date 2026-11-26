import { createElement as h, Fragment, type CSSProperties } from "react";
import type { LinkPreviewImage } from "./linkPreview.js";
import { resolveUnfurls, type UnfurlSource } from "./linkPreviewRules.js";

export function UnfurlCards({
  source,
  measuredWidths,
  imageSrc = (url) => url,
}: {
  source: UnfurlSource;
  measuredWidths?: ReadonlyMap<string, number>;
  imageSrc?: (url: string) => string;
}) {
  const { discord, slack, messages } = resolveUnfurls(source, measuredWidths);
  const discordImage = discord.images[0];
  function image(value: LinkPreviewImage, className?: string) {
    return h("img", {
      className,
      src: imageSrc(value.url),
      alt: value.alt,
      referrerPolicy: "no-referrer",
    });
  }
  return h(
    Fragment,
    null,
    h(
      "section",
      { className: "platform discord", "aria-label": "Discord preview" },
      !discord.visible
        ? h("p", { className: "empty" }, "No preview fields found.")
        : discord.layout === "photo" && discordImage
          ? image(discordImage, "discord-image")
          : h(
              "article",
              {
                className: "discord-embed",
                style: discord.accent
                  ? ({ "--preview-accent": discord.accent } as CSSProperties)
                  : undefined,
              },
              h(
                "div",
                { className: "discord-row" },
                h(
                  "div",
                  { className: "discord-copy" },
                  discord.siteName &&
                    h(
                      "div",
                      { className: "discord-provider" },
                      discord.siteName,
                    ),
                  discord.title &&
                    h(
                      "a",
                      {
                        className: "platform-title discord-title",
                        href: source.url,
                      },
                      discord.title,
                    ),
                  discord.description &&
                    h(
                      "p",
                      { className: "discord-description" },
                      discord.description,
                    ),
                ),
                discord.layout === "compact" &&
                  discordImage &&
                  image(discordImage, "discord-thumbnail"),
              ),
              discord.layout === "large" &&
                discordImage &&
                image(discordImage, "discord-image"),
              discord.layout === "gallery" &&
                h(
                  "div",
                  { className: "discord-gallery" },
                  discord.images.map((item, index) =>
                    h("img", {
                      key: index,
                      src: imageSrc(item.url),
                      alt: item.alt,
                      referrerPolicy: "no-referrer",
                    }),
                  ),
                ),
            ),
    ),
    h(
      "section",
      { className: "platform slack", "aria-label": "Slack preview" },
      slack.visible
        ? h(
            "article",
            { className: "slack-attachment" },
            h(
              "div",
              { className: "slack-copy" },
              slack.title &&
                h(
                  "a",
                  { className: "platform-title slack-title", href: source.url },
                  slack.title,
                ),
              slack.description &&
                h("p", { className: "slack-description" }, slack.description),
              h(
                "div",
                { className: "slack-provider" },
                slack.icon && image({ url: slack.icon, alt: "" }),
                slack.siteName,
              ),
            ),
            slack.image && image(slack.image, "slack-image"),
          )
        : h("p", { className: "empty" }, "No Slack preview for these tags."),
    ),
    h(
      "section",
      {
        className: "platform messages",
        "aria-label": "Apple Messages preview",
      },
      h(
        "a",
        {
          className: messages.image
            ? "messages-bubble"
            : "messages-bubble messages-compact",
          href: source.url,
        },
        messages.image && image(messages.image, "messages-image"),
        h(
          "div",
          { className: "messages-copy" },
          h(
            "strong",
            { className: "platform-title messages-title" },
            messages.title,
          ),
          h("span", { className: "messages-domain" }, messages.domain),
        ),
        !messages.image &&
          messages.icon &&
          image({ url: messages.icon, alt: "" }, "messages-thumbnail"),
      ),
    ),
  );
}
