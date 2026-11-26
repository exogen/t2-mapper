import type { DemoMetadata } from "../../relay/demoMetadata";
import type { LinkPreviewInput } from "../../relay/linkPreview";

/** Fixed examples for local authoring; no account or server lookups are made. */
const demo: DemoMetadata = {
  filename: "example-grand-final.rec",
  bytes: 2_400_000,
  recordedAt: "2026-11-14T21:00:00.000Z",
  server: "Example Community Server",
  address: "example.invalid:28000",
  games: [
    {
      mission: "RiverDance",
      gameType: "CTF",
      startMs: 0,
      tournament: true,
      title: "Example Cup — Grand Final",
      teamNames: { 1: "Example Red", 2: "Example Blue" },
    },
    {
      mission: "Katabatic",
      gameType: "CTF",
      startMs: 1_200_000,
      tournament: true,
      title: "Example Cup — Deciding Map",
      teamNames: { 1: "Example Red", 2: "Example Blue" },
    },
  ],
  mod: "Classic",
  recorder: "Example Recorder",
  durationMs: 2_400_000,
  players: ["Example Player", "Example Teammate"],
  playerCount: 24,
  hasCommentary: true,
};

export const linkPreviewFixtures: readonly LinkPreviewInput[] = [
  { kind: "map", missionName: "RiverDance", missionType: "CTF" },
  { kind: "demo", demo },
  {
    kind: "server",
    server: {
      address: "example.invalid:28000",
      name: "Example Community Server",
      mapName: "RiverDance",
      gameType: "Capture the Flag",
      mod: "Classic",
      playerCount: 24,
      maxPlayers: 32,
      botCount: 0,
      tournament: false,
      passwordRequired: false,
    },
  },
  {
    kind: "profile",
    profile: {
      discordId: "123456789012345678",
      discordUsername: "example.player",
      name: "Example Player",
      image: "https://cdn.discordapp.com/embed/avatars/0.png",
      t2AccountNames: ["Example Player", "Example Alias"],
      t2Profile: {
        bodyType: "male",
        skin: "base",
        armor: "Light",
        pack: "pack_energy",
        weapon: "disc",
        loadoutSource: "inv",
        bestMap: { mission: "Katabatic", score: 142 },
        lastSeenAt: "2026-11-14T21:00:00.000Z",
      },
    },
    demoCount: 12,
    clipCount: 3,
  },
  {
    kind: "clip",
    clip: {
      id: "12345678-1234-4123-8123-123456789abc",
      title: "Example: a last-second flag save",
      sourceDemo: demo.filename,
      startSec: 1_250,
      durationMs: 18_000,
      creatorName: "Example Player",
      createdAt: Date.parse("2026-11-14T22:00:00.000Z"),
      state: "ready",
    },
    demo,
  },
  ...(["home", "maps", "demos", "servers", "clips", "replays"] as const).map(
    (page) => ({ kind: "page", page }) as const,
  ),
];
