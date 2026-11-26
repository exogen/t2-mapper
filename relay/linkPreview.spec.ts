import { describe, expect, it } from "vitest";
import type { AccountPublicProfile } from "./accountTypes";
import type { DemoMetadata } from "./demoMetadata";
import { generateLinkPreview, type LinkPreviewInput } from "./linkPreview";

const demo: DemoMetadata = {
  filename: "users/12345678901234567/match #1.rec",
  bytes: 1024,
  recordedAt: "2026-11-23T23:50:00Z",
  server: "Example server",
  address: "example.com:28000",
  games: [
    {
      mission: "DX",
      gameType: "Capture the Flag",
      startMs: 0,
      tournament: false,
    },
    {
      mission: "HillSide",
      gameType: "ctf",
      startMs: 60_000,
      tournament: true,
      title: "Tournament final",
      teamNames: { 2: "Philthy Birds", 1: "Dodgy Dealers" },
    },
  ],
  mod: "Classic",
  recorder: "Recorder",
  durationMs: 4_500_000,
  players: ["one", "one alias", "two"],
  playerCount: 2,
  hasCommentary: true,
};

const clip = {
  id: "clip-123",
  title: "Flag save",
  sourceDemo: demo.filename,
  startSec: 75,
  durationMs: 12_345,
  creatorName: "Blake",
  createdAt: Date.UTC(2026, 10, 24),
  state: "ready" as const,
};

const profile: AccountPublicProfile = {
  name: "Blake",
  discordUsername: "blake",
  discordId: "12345678901234567",
  image: "https://cdn.example.com/avatar.png",
  t2AccountNames: ["blake", "[PB]blake"],
  t2Profile: null,
};

const options = {
  siteUrl: "https://play.example.com/subdir/?ownerToken=secret#camera",
  missionDisplayName: (name: string) =>
    name === "DX" ? "Dangerous Crossing" : name,
  missionImage: (name: string) => ({
    url: `https://assets.example.com/${name}.png`,
    alt: `${name} map art`,
  }),
};

describe("generateLinkPreview", () => {
  it("emits portable inline OG and Twitter tags with absolute URLs, without a hydration runtime", () => {
    const result = generateLinkPreview(
      { kind: "map", missionName: "DX", missionType: "ctf" },
      options,
    );
    expect(result.metadata.title).toBe("Dangerous Crossing (CTF)");
    expect(result.metadata.description).toBe(
      "Explore Tribes 2 maps and more on MapGenius.",
    );
    expect(result.metadata.url).toBe(
      "https://play.example.com/subdir/?mode=map&mission=DX%7Ectf",
    );
    expect(result.headHtml).toContain('property="og:type" content="website"');
    expect(result.headHtml.match(/<meta property="og:image"[^>]*>/g)).toEqual([
      '<meta property="og:image" content="https://assets.example.com/DX.png"/>',
    ]);
    expect(result.headHtml).toContain(
      'name="twitter:card" content="summary_large_image"',
    );
    expect(result.headHtml).toContain('rel="canonical"');
    expect(result.headHtml).not.toContain("<html");
    expect(result.headHtml).not.toContain("<script");
    expect(result.documentHtml).toMatch(/^<!doctype html><html/);
    expect(result.documentHtml).toContain('name="robots" content="noindex"');
    expect(result.documentHtml).not.toContain("<script");
    expect(result.documentHtml).not.toContain("secret");
    expect(result.documentHtml).not.toContain("#camera");
  });

  it("mirrors recording cards' map sequence, named matches, duration, date, and deduplicated player count", () => {
    const { metadata } = generateLinkPreview({ kind: "demo", demo }, options);
    expect(metadata.title).toBe("Dangerous Crossing (CTF) → HillSide (CTF)");
    expect(metadata.description).toBe("Recorder’s demo from Nov 23, 2026.");
    expect(metadata.tags).toEqual(["Demo", "CTF", "Tournament", "Commentary"]);
    expect(metadata.details).toEqual([
      "Tournament final",
      "Dodgy Dealers vs Philthy Birds",
      "Nov 23, 2026",
      "1h 15m",
      "2 players",
      "Recorded by Recorder",
      "Example server",
    ]);
    expect(metadata.url).toContain(
      "demo=users%2F12345678901234567%2Fmatch+%231.rec",
    );
  });

  it.each([
    ["", demo.recordedAt, "Tribes 2 demo from Nov 23, 2026."],
    ["Recorder", "unknown", "Recorder’s demo."],
    ["", "unknown", "Tribes 2 demo."],
  ])(
    "formats demo descriptions with missing recorder or date (%j, %j)",
    (recorder, recordedAt, description) => {
      expect(
        generateLinkPreview({
          kind: "demo",
          demo: { ...demo, recorder, recordedAt },
        }).metadata.description,
      ).toBe(description);
    },
  );

  it("keeps qualified demo references even when the loaded source has a different filename", () => {
    expect(
      generateLinkPreview({
        kind: "demo",
        demo,
        reference: "tribesforever:22945",
      }).metadata.url,
    ).toContain("demo=tribesforever%3A22945");
  });

  it("uses the game containing the clip start and does not advertise a WebGL clip as a playable MP4", () => {
    const { metadata, headHtml } = generateLinkPreview(
      { kind: "clip", clip, demo },
      options,
    );
    expect(metadata.title).toBe("Flag save");
    expect(metadata.description).toBe("Clipped by Blake on Nov 24, 2026.");
    expect(metadata.details).toContain("HillSide");
    expect(metadata.details).toContain("Tournament final");
    expect(metadata.details).not.toContain("Dangerous Crossing");
    expect(metadata.details).toContain("12s");
    expect(metadata.details).toContain("Clipped by Blake");
    expect(metadata.image.url).toBe("https://assets.example.com/HillSide.png");
    expect(metadata.url).toContain("clip=clip-123");
    expect(headHtml).not.toContain("og:video");
    expect(metadata.type).toBe("website");
  });

  it.each(["processing", "failed"] as const)(
    "represents a %s clip honestly without requiring a timeline",
    (state) => {
      const { metadata } = generateLinkPreview({
        kind: "clip",
        clip: { ...clip, state },
      });
      expect(metadata.details).toContain(
        state === "processing" ? "Preparing clip" : "Clip unavailable",
      );
      expect(metadata.image.url).toBe(
        "https://play.tribes2.online/icon-512.png",
      );
    },
  );

  it("shows public server facts and normalizes address-based links", () => {
    const { metadata } = generateLinkPreview(
      {
        kind: "server",
        server: {
          name: "Example server",
          address: "EXAMPLE.COM",
          mapName: "DX",
          gameType: "Capture the Flag",
          mod: "Classic",
          playerCount: 12,
          maxPlayers: 32,
          botCount: 2,
          tournament: true,
          passwordRequired: true,
        },
      },
      options,
    );
    expect(metadata.tags).toEqual([
      "Live server",
      "CTF",
      "Tournament",
      "Password required",
    ]);
    expect(metadata.details).toContain("12/32 players");
    expect(metadata.details).toContain("2 bots");
    expect(metadata.description).toBe(
      "Watch live: Dangerous Crossing (CTF) – 12/32 players",
    );
    expect(metadata.url).toBe(
      "https://play.example.com/subdir/?mode=live&address=example.com%3A28000",
    );
    expect(() =>
      generateLinkPreview({ kind: "server", server: { name: "" } }),
    ).toThrow(/address or name/);
  });

  it("uses public profile identity and lets the avatar use the default card layout", () => {
    const { metadata, headHtml } = generateLinkPreview(
      { kind: "profile", profile, demoCount: 5, clipCount: 2 },
      options,
    );
    expect(metadata.type).toBe("profile");
    expect(headHtml).not.toContain('name="twitter:card"');
    expect(metadata.details).toContain("Plays as blake, [PB]blake");
    expect(metadata.details).toContain("5 uploads");
    expect(metadata.description).toBe(
      "Blake’s profile on MapGenius – 2 clips, 5 uploads",
    );
    expect(metadata.image.url).toBe(profile.image);
    expect(headHtml).not.toContain("og:image:width");
    expect(metadata.url).toContain("user=12345678901234567");
  });

  it("always prefers a profile avatar over an explicit card image or fallback", () => {
    const { metadata, documentHtml } = generateLinkPreview(
      {
        kind: "profile",
        profile,
        image: {
          url: "https://example.com/cover.png",
          alt: "Cover",
          width: 1200,
          height: 630,
        },
      },
      {
        defaultImage: {
          url: "https://example.com/default.png",
          alt: "Default",
        },
      },
    );
    expect(metadata.image.url).toBe(profile.image);
    expect(metadata.description).toBe("Blake’s profile on MapGenius");
    expect(documentHtml).toContain(profile.image);
    expect(documentHtml).toContain('<img class="discord-thumbnail"');
    expect(documentHtml).toContain('<img class="slack-image"');
    expect(documentHtml).not.toContain("cover.png");
  });

  it.each([null, "", "   "])(
    "uses a profile fallback only when the avatar is absent (%j)",
    (image) => {
      const { metadata } = generateLinkPreview(
        { kind: "profile", profile: { ...profile, image } },
        {
          defaultImage: {
            url: "https://example.com/fallback.png",
            alt: "Fallback",
          },
        },
      );
      expect(metadata.image.url).toBe("https://example.com/fallback.png");
    },
  );

  it("uses explicit profile fallback artwork or the app icon when no avatar exists", () => {
    const absent = { ...profile, image: null };
    const explicit = generateLinkPreview({
      kind: "profile",
      profile: absent,
      image: {
        url: "https://example.com/cover.png",
        alt: "Cover",
        width: 1200,
        height: 630,
      },
    });
    expect(explicit.metadata.image.url).toBe("https://example.com/cover.png");
    expect(explicit.metadata.twitterCard).toBe("summary_large_image");
    expect(
      generateLinkPreview({ kind: "profile", profile: absent }).metadata.image
        .url,
    ).toBe("https://play.tribes2.online/icon-512.png");
  });

  it("preserves a named server selector after resolving its public address", () => {
    const { target, metadata } = generateLinkPreview({
      kind: "server",
      reference: { name: "Legacy server" },
      server: { name: "Legacy server", address: "example.com:28000" },
    });
    expect(target).toEqual({ kind: "server", name: "Legacy server" });
    expect(metadata.description).toBe("Watch live");
    expect(metadata.url).toBe(
      "https://play.tribes2.online/?mode=live&name=Legacy+server",
    );
  });

  it("escapes user-authored text in tags, visible content, and generated-code inspection", () => {
    const attack = '"><script>alert("bad")</script><img src=x onerror=bad>';
    const { headHtml, documentHtml } = generateLinkPreview({
      kind: "clip",
      clip: { ...clip, title: attack },
    });
    expect(headHtml).toContain("&lt;script&gt;");
    expect(headHtml).not.toContain("<script>");
    expect(headHtml).not.toContain('content=""><script>');
    expect(documentHtml).not.toContain("<script>");
    expect(documentHtml).not.toContain("<img src=x");
  });

  it("only publishes image URLs using HTTP(S), and rejects credentials or fabricated invalid dimensions", () => {
    const input: LinkPreviewInput = { kind: "map", missionName: "DX" };
    for (const url of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg/>",
      "https://user:secret@example.com/a.png",
    ]) {
      expect(() =>
        generateLinkPreview({ ...input, image: { url, alt: "" } }),
      ).toThrow(/HTTP/);
    }
    expect(() =>
      generateLinkPreview({
        ...input,
        image: { url: "art.png", alt: "", width: -1 },
      }),
    ).toThrow(/dimensions/);
    const { metadata } = generateLinkPreview(
      {
        ...input,
        image: { url: "art.png", alt: "DX", width: 1200, height: 630 },
      },
      options,
    );
    expect(metadata.image.url).toBe("https://play.example.com/subdir/art.png");
  });

  it("preserves retail wall dates without depending on machine timezone and omits invalid dates", () => {
    const { metadata } = generateLinkPreview({
      kind: "demo",
      demo: {
        ...demo,
        recordedAt: "2026-11-23T23:50:00",
        recordedAtTimezone: "unknown",
      },
    });
    expect(metadata.details).toContain("Nov 23, 2026");
    expect(
      generateLinkPreview({
        kind: "clip",
        clip: { ...clip, createdAt: NaN },
      }).metadata.details.join(" "),
    ).not.toContain("Invalid Date");
  });

  it("uses compact, Unicode-safe titles and descriptions without empty placeholders", () => {
    const { metadata } = generateLinkPreview({
      kind: "map",
      missionName: "🙂".repeat(100),
      description: "long ".repeat(200),
    });
    expect(Array.from(metadata.title)).toHaveLength(70);
    expect(Array.from(metadata.description)).toHaveLength(300);
    expect(metadata.title).not.toContain("�");
    expect(metadata.description).not.toContain("undefined");
  });

  it.each([
    ["home", "MapGenius"],
    ["maps", "Explore Tribes 2 maps"],
    ["demos", "Tribes 2 demos"],
    ["servers", "Live Tribes 2 servers"],
    ["clips", "Recent Tribes 2 clips"],
    ["replays", "Tribes 2 replays"],
  ] as const)("renders the %s index without entity data", (page, title) => {
    const { metadata } = generateLinkPreview({ kind: "page", page });
    expect(metadata.title).toBe(title);
    expect(metadata.description).toBe(
      "Explore maps, watch demos, and spectate live on MapGenius.",
    );
    expect(metadata.type).toBe("website");
  });

  it("uses the local icon in the simulation and the public icon in metadata", () => {
    const { headHtml, documentHtml } = generateLinkPreview(
      { kind: "page", page: "home" },
      { ...options, previewIconSrc: () => "../preview-assets/icon-512.png" },
    );

    expect(headHtml).toContain(
      'property="og:image" content="https://play.example.com/subdir/icon-512.png"',
    );
    expect(headHtml).not.toContain("preview-assets");
    expect(documentHtml).toContain(
      'class="discord-thumbnail" src="../preview-assets/icon-512.png"',
    );
  });
});
