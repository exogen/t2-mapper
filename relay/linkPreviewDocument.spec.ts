import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LinkPreviewMetadata } from "./linkPreview";
import { LinkPreviewDocument } from "./linkPreviewDocument";
import { resolveUnfurls } from "./linkPreviewRules";

const metadata: LinkPreviewMetadata = {
  kind: "map",
  siteName: "MapGenius",
  title: "Katabatic",
  description: "Explore this Tribes 2 map.",
  url: "https://play.tribes2.online/?mode=map&mission=Katabatic",
  type: "website",
  twitterCard: "summary_large_image",
  image: { url: "https://example.com/map.png", alt: "Katabatic map" },
  tags: ["Authoring-only tag"],
  details: ["Authoring-only detail"],
};

function render(value = metadata) {
  return renderToStaticMarkup(
    h(LinkPreviewDocument, {
      metadata: value,
      head: h("meta", { property: "og:title", content: value.title }),
    }),
  );
}

describe("LinkPreviewDocument", () => {
  it("shows only published fields in the three supported platform simulations", () => {
    const html = render();
    expect(html.match(/<section /g)).toHaveLength(3);
    expect(html).toContain('aria-label="Discord preview"');
    expect(html).toContain('aria-label="Slack preview"');
    expect(html).toContain('aria-label="Apple Messages preview"');
    expect(html).not.toContain("Authoring-only tag");
    expect(html).not.toContain("Authoring-only detail");
    const messages = html.match(
      /<section class="platform messages"[\s\S]*?<\/section>/,
    )![0];
    expect(messages).toContain("Katabatic");
    expect(messages).toContain("play.tribes2.online");
    expect(messages).not.toContain(metadata.description);
  });

  it("uses the card type differently in each platform", () => {
    const html = render({ ...metadata, twitterCard: "summary" });
    expect(html).toContain('<img class="discord-thumbnail"');
    const slack = html.match(
      /<section class="platform slack"[\s\S]*?<\/section>/,
    )![0];
    expect(slack).toContain(metadata.title);
    expect(slack).not.toContain("<img");
    expect(html).toContain('<img class="messages-image"');
    expect(html).not.toContain('<img class="discord-image"');
  });

  it("embeds the real head and an escaped inspection copy without loading a script", () => {
    const html = render();
    expect(html).toContain('<meta name="robots" content="noindex"/>');
    expect(html).toContain('<meta property="og:title" content="Katabatic"/>');
    expect(html).toContain(
      "&lt;meta property=&quot;og:title&quot; content=&quot;Katabatic&quot;/&gt;",
    );
    expect(html).not.toContain("<script");
    expect(html).toContain('id="platform-discord"');
    expect(html).toContain('id="theme-auto"');
    expect(html).toContain('id="theme-light"');
    expect(html).toContain('id="theme-dark"');
    const inputs = html.match(/<input\b[^>]*>/g)!;
    expect(
      inputs.filter((input) => input.includes('name="platform"')),
    ).toHaveLength(3);
    expect(inputs.filter((input) => input.includes('checked=""'))).toEqual([
      expect.stringContaining('id="platform-discord"'),
      expect.stringContaining('id="theme-auto"'),
    ]);
  });

  it("escapes user content in every visible simulation and metadata inspection", () => {
    const html = render({
      ...metadata,
      title: '"><script>alert("bad")</script>',
      description: '<img src=x onerror="bad">',
    });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x");
  });
});

describe("platform metadata decisions", () => {
  const url = "https://example.com/level/";

  it("uses document order for Discord, Open Graph priority for Slack, and the last Discord layout tag", () => {
    const { discord, slack, messages } = resolveUnfurls({
      url,
      tags: [
        ["twitter:title", "Twitter title"],
        ["og:title", "Open Graph title"],
        ["og:description", "Use the main gallery screenshot."],
        ["og:image", "/map.webp"],
        ["twitter:card", "summary"],
        ["twitter:card", "summary_large_image"],
        ["theme-color", "#123456"],
        ["theme-color", "url(https://example.com/style)"],
      ],
    });
    expect(discord).toMatchObject({
      title: "Twitter title",
      layout: "large",
      accent: undefined,
    });
    expect(slack).toMatchObject({
      title: "Open Graph title",
      image: { url: "https://example.com/map.webp" },
    });
    expect(messages.title).toBe("Open Graph title");
  });

  it("caps Discord image galleries at four and counts Unicode title bytes", () => {
    const { discord } = resolveUnfurls({
      url,
      tags: [
        ["og:title", "🚀".repeat(30)],
        ...Array.from(
          { length: 5 },
          (_, i) => ["og:image", `/map-${i}.webp`] as const,
        ),
      ],
    });
    expect(discord.layout).toBe("gallery");
    expect(discord.images).toHaveLength(4);
    expect(discord.title).toBe(`${"🚀".repeat(16)}…`);
  });

  it("uses measured image sizes for Slack suppression and Messages icon fallback", () => {
    const image = "https://example.com/map.webp";
    const { discord, slack, messages } = resolveUnfurls(
      {
        url,
        tags: [
          ["og:title", "Map"],
          ["og:description", "Gallery"],
          ["og:image", image],
          ["og:image:width", "1200"],
        ],
        touchIcon: "/touch.png",
      },
      new Map([[image, 100]]),
    );
    expect(discord.images[0].width).toBe(1200);
    expect(slack).toMatchObject({ visible: true, image: undefined });
    expect(messages).toMatchObject({
      image: undefined,
      icon: "https://example.com/touch.png",
    });
  });

  it("ignores unsafe pasted image URLs and models title-only links without inventing a Slack card", () => {
    const { discord, slack, messages } = resolveUnfurls({
      url,
      title: "Page title",
      tags: [["og:image", "javascript:alert(1)"]],
    });
    expect(discord.visible).toBe(false);
    expect(slack.visible).toBe(false);
    expect(messages).toMatchObject({ title: "Page title", image: undefined });
  });
});
