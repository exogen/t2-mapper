/**
 * Generate a two-announcer commentary script for a demo, from its
 * .cast.json plan sidecar plus the demo stream itself (mission info,
 * scores, match clock — read node-natively, no browser).
 *
 *   npm run generate-commentary -- <demo.rec> [cast.json] [options]
 *     --out <file>       output (default <demo>.commentary.json)
 *     --model <id>       OpenAI model (default gpt-5.4)
 *     --style <file>     style guide (default scripts/commentary/style.md)
 *     --window <sec>     target seconds per generation window (default 50)
 *     --air <0..1>       target air-time fraction (default 0.8)
 *     --from/--to <sec>  demo-time range (default: 60s before match start)
 *     --limit <n>        generate only the first n windows (cost control)
 *     --txt              also write a flat transcript
 *     --dry-run          print the first window's prompt and exit
 *
 * Output is a timed dialogue cue file aimed at ElevenLabs' Text to
 * Dialogue API (Eleven v3): per-cue speaker + text with inline audio
 * tags + energy, with word budgets sized so each cue fits its slot at
 * ~2.6 words/sec. A later render script maps cues onto dialogue
 * requests (≤2000 chars each) and assembles audio aligned to atSec.
 *
 * Windows are cached under <out>.windows/ so reruns resume.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { createDemoStreamingRecording } from "../src/stream/demoStreaming";
import { spokenMapName, spokenName } from "../src/director/dataset";
import { scanDemoTimeline } from "../src/stream/demoTimelineScanner";
import type { Shot, ShotPlan } from "../src/director/types";
import type { ShotScene } from "../src/director/scene";

const WORDS_PER_SEC = 2.6;
// Roster reads render much slower than flowing speech — TTS gives name
// lists a deliberate pace — so pre-match windows budget fewer words.
const PRESTART_WORDS_PER_SEC = 1.5;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    model: { type: "string", default: "gpt-5.4" },
    style: { type: "string", default: "scripts/commentary/style.md" },
    window: { type: "string", default: "50" },
    air: { type: "string", default: "0.8" },
    from: { type: "string" },
    to: { type: "string" },
    limit: { type: "string" },
    txt: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false, short: "h" },
  },
});

if (values.help || positionals.length < 1) {
  console.error(
    "usage: npm run generate-commentary -- <demo.rec> [cast.json] [--out f] [--model id] [--dry-run] ...",
  );
  process.exit(values.help ? 0 : 1);
}

const recPath = positionals[0];
const castPath = positionals[1] ?? `${recPath}.cast.json`;
const outPath = values.out ?? `${recPath}.commentary.json`;
const windowSec = parseFloat(values.window!);
const airTime = parseFloat(values.air!);

interface Cue {
  atSec: number;
  speaker: "rip" | "doc";
  text: string;
  energy: "low" | "medium" | "high" | "max";
}

interface WindowBrief {
  index: number;
  startSec: number;
  endSec: number;
  clock: string;
  timeRemaining: string | null;
  preStart: boolean;
  /** Players on the server (assigned to a team) at this window. */
  playersOnServer: number;
  score: { team: string; score: number; caps?: number; grabs?: number }[];
  topScorers: { name: string; team: string; score: number }[];
  wordBudget: number;
  shots: unknown[];
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Scene facts for the prompt: trimmed, and with the future stripped —
 *  the booth must not know outcomes before they happen. */
function shotBrief(shot: Shot): unknown {
  const scene = shot.scene as ShotScene | undefined;
  return {
    startSec: Math.round(shot.startSec * 10) / 10,
    endSec: Math.round(shot.endSec * 10) / 10,
    // Lineup sweeps: how many names FIT the shot (~1.7s per name, read
    // as separate sentences) — the read should fill the shot, not stop
    // early into dead air.
    namesToRead:
      scene?.topic === "lineup"
        ? Math.floor((shot.endSec - shot.startSec) / 1.7)
        : undefined,
    camera: shot.reason,
    topic: scene?.topic,
    summary: scene?.summary,
    playersOnScreen: scene?.players.slice(0, 6).map((p) => ({
      name: p.name,
      team: p.team,
      armor: p.armor,
      clan: p.clan,
      pack: p.pack,
      doing: p.doing,
      moving: p.moving,
      frame: p.frame,
      speed: p.speed,
      health: p.health,
    })),
    events: scene?.events.map((e) => ({
      atSec: Math.round(e.timeSec * 10) / 10,
      type: e.type,
      detail: e.detail,
      dropKind: e.dropKind,
      actors: e.actors,
    })),
    flags: scene?.flags.map(({ future: _future, ...flag }) => flag),
  };
}

async function callOpenAI(
  model: string,
  system: string,
  user: string,
): Promise<Cue[]> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "commentary_cues",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["cues"],
            properties: {
              cues: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["atSec", "speaker", "text", "energy"],
                  properties: {
                    atSec: { type: "number" },
                    speaker: { type: "string", enum: ["rip", "doc"] },
                    text: { type: "string" },
                    energy: {
                      type: "string",
                      enum: ["low", "medium", "high", "max"],
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 400);
    if (text.includes("insufficient_quota")) {
      throw new Error(
        "OpenAI account has no credits remaining — add credits and re-run (windows already generated are cached).",
      );
    }
    const err = new Error(`OpenAI ${res.status}: ${text}`);
    (err as { retryable?: boolean }).retryable =
      res.status === 429 || res.status >= 500;
    throw err;
  }
  const body = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return (JSON.parse(body.choices[0].message.content) as { cues: Cue[] }).cues;
}

/** Retry transient failures (rate limits, 5xx) with backoff. */
async function callOpenAIWithRetry(
  model: string,
  system: string,
  user: string,
): Promise<Cue[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOpenAI(model, system, user);
    } catch (err) {
      if (attempt >= 4 || !(err as { retryable?: boolean }).retryable) {
        throw err;
      }
      const delay = 2000 * 2 ** attempt;
      console.warn(`  retrying in ${delay / 1000}s: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

function buildUserPrompt(
  brief: WindowBrief,
  tail: Cue[],
  isFirst: boolean,
): string {
  const parts: string[] = [];
  if (isFirst) {
    parts.push(
      'This is the TOP of the broadcast. Open the show per the style guide: welcome the audience, have the hosts introduce themselves by name (a quick "I\'m Rip" / "and I\'m Doc"), name the server (the venue), the map, and the game type, read the teams, and build toward the start. Do not re-introduce the show in later windows.',
    );
  } else {
    parts.push(
      "Continue the SAME ongoing conversation. The previous lines (already spoken, do not repeat or rephrase them):",
      JSON.stringify(tail.slice(-12)),
    );
  }
  parts.push(
    `Write the booth's dialogue for demo time ${brief.startSec}s to ${brief.endSec}s.`,
    brief.preStart
      ? `The match has NOT started yet — there is no score to mention. ${brief.playersOnServer > 0 ? `There are ${brief.playersOnServer} players on the server — include that count in the opening map/server announcement.` : "The player count is unknown — do not state one."} LINEUP COVERAGE RULES: roster names may be read ONLY during shots whose topic is "lineup" (the camera is sweeping that exact group). For each lineup shot, one cue timed AT that shot\'s startSec reading names from THAT shot\'s playersOnScreen in the order given: announce EXACTLY the shot\'s namesToRead count (fewer only if the team has fewer players left unannounced) — the read should fill the shot with no trailing dead air. Separate the names with PERIODS, each name its own short sentence ("Irvin. Friendo. Carpenter. sake.") — never a comma list, so the delivery breathes between names; occasionally mention the skin a player is wearing. Never read names over any other shot: before the first lineup shot, do the welcome and anticipation only, and open the roster with a quick intro line ("On the field today:", "For Storm we\'ve got:", or similar) rather than starting the names cold. Announce each player at most ONCE across the whole lineup read: if a name already called appears in another shot, skip it. NEVER claim a team's read is complete ("the rest of X", "rounding out X") unless every name in that team's knownPlayers list (in the match info) has been announced — with big rosters you will not get to everyone, so close with open phrasing ("more Storm:", "also on Inferno:") instead.`
      : `Match clock ${brief.clock}${brief.timeRemaining ? `, ${brief.timeRemaining} remaining` : ""}. Score: ${
          brief.score
            .map((s) =>
              s.caps != null
                ? `${s.team} ${s.caps} caps (${s.grabs} grabs)`
                : `${s.team} ${s.score}`,
            )
            .join(" — ") || "0 — 0"
        }.${
          brief.topScorers.length > 0
            ? ` Top scorers: ${brief.topScorers
                .map((p) => `${p.name} (${p.team}) ${p.score}`)
                .join(", ")}.`
            : ""
        }`,
    `What the camera shows in this window (each shot with its timing and on-screen facts):`,
    JSON.stringify(brief.shots),
    `Budget: at most ${brief.wordBudget} words TOTAL across all cues — a HARD cap; when the action is dense, write fewer, punchier cues rather than exceeding it (target ~${Math.round((brief.preStart ? Math.max(airTime, 0.95) : airTime) * 100)}% air-time${brief.preStart ? "" : "; leave breathing room, especially after big moments"}). Every cue's atSec must lie within [${brief.startSec}, ${brief.endSec}) and cues must be in order, spaced so each fits at ~2.6 words/sec before the next begins. React to events AT their atSec, never before.`,
  );
  return parts.join("\n\n");
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY && !values["dry-run"]) {
    console.error("OPENAI_API_KEY is not set");
    process.exit(1);
  }
  const style = fs.readFileSync(values.style!, "utf8");
  // Reference material rides along in the system prompt: the glossary,
  // example commentary, and strategy guides in resources/ next to the
  // style file. Each document is wrapped in an explicit
  // <reference-document name="..."> tag — the docs contain their own
  // markdown headings, so heading-based boundaries would blur where one
  // ends and the next begins — and an index lists them up front. The
  // prompt prefix is identical for every window, so OpenAI's prompt
  // caching absorbs most of the repeated cost.
  const resourcesDir = path.join(path.dirname(values.style!), "resources");
  const resourceNames = fs.existsSync(resourcesDir)
    ? fs
        .readdirSync(resourcesDir)
        .filter((f) => f.endsWith(".md"))
        .sort((a, b) => {
          const sa = fs.statSync(path.join(resourcesDir, a)).size;
          const sb = fs.statSync(path.join(resourcesDir, b)).size;
          return sa - sb;
        })
    : [];
  const resources =
    resourceNames.length > 0
      ? [
          `## Reference library\n\nThe ${resourceNames.length} documents below are each wrapped in a <reference-document name="..."> tag:\n${resourceNames
            .map((f) => `- ${f.replace(/\.md$/, "")}`)
            .join("\n")}`,
          ...resourceNames.map((f) => {
            const name = f.replace(/\.md$/, "");
            const content = fs
              .readFileSync(path.join(resourcesDir, f), "utf8")
              .trim();
            return `<reference-document name="${name}">\n${content}\n</reference-document>`;
          }),
        ]
      : [];
  const castDoc = JSON.parse(fs.readFileSync(castPath, "utf8")) as {
    format?: string;
    plan?: ShotPlan;
  };
  const plan: ShotPlan =
    castDoc.format === "castgenius-plan" && castDoc.plan
      ? castDoc.plan
      : (castDoc as unknown as ShotPlan);
  if (!plan?.shots?.length) {
    console.error(`${castPath}: no shots in plan`);
    process.exit(1);
  }

  console.log("Reading the demo stream (mission, clock, scores)...");
  const buf = fs.readFileSync(recPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const recording = await createDemoStreamingRecording(ab);
  const playback = recording.streamingPlayback;
  const timeline = await scanDemoTimeline(ab, null);
  const matchStart = timeline.events.find(
    (e) => e.type === "match-start",
  )?.timeSec;
  const matchEnd = timeline.events.find((e) => e.type === "match-end")?.timeSec;

  const fromSec =
    values.from != null
      ? parseFloat(values.from)
      : Math.max(0, (matchStart ?? 75) - 75);
  const toSec = values.to != null ? parseFloat(values.to) : recording.duration;

  // Windows: consecutive shots grouped to ~windowSec, split at sequence
  // boundaries when close, so conversations align with stories.
  const shots = plan.shots.filter(
    (s) => s.endSec > fromSec && s.startSec < toSec,
  );
  const windows: Shot[][] = [];
  let current: Shot[] = [];
  for (const shot of shots) {
    const start = current[0]?.startSec ?? shot.startSec;
    const sameSeq =
      current.length === 0 ||
      shot.scene?.sequenceId === current[current.length - 1].scene?.sequenceId;
    if (current.length > 0 && shot.endSec - start > windowSec && !sameSeq) {
      windows.push(current);
      current = [];
    }
    current.push(shot);
  }
  if (current.length > 0) windows.push(current);

  // Mission context, from the demo itself.
  playback.stepToTime(Math.min(fromSec + 5, recording.duration));
  const first = playback.getSnapshot();
  const match = {
    // Speak the mission's DISPLAY name (demo header) over its slug,
    // cleaned of release prefixes/suffixes for the booth.
    map: spokenMapName(
      playback.missionDisplayName ?? recording.missionName ?? "",
    ),
    gameType: recording.gameType ?? plan.gameMode,
    server: recording.serverDisplayName ?? null,
    // Known roster per team, aggregated from every scene in the plan —
    // the completeness reference for lineup reads ("the rest of X" is
    // only true if every one of these was named).
    teams: (first.teamScores ?? [])
      .filter((t) => t.teamId > 0)
      .map((t) => ({
        name: t.name,
        knownPlayers: [
          ...new Set(
            plan.shots.flatMap(
              (shot) =>
                shot.scene?.players
                  .filter((p) => p.team === t.name)
                  .map((p) => p.name) ?? [],
            ),
          ),
        ],
      })),
    durationSec: Math.round(recording.duration),
    matchStartSec: matchStart ?? null,
    /** First lineup shot — the renderer right-anchors the intro audio
     *  to end here, however long the intro rendered. */
    lineupStartSec:
      plan.shots.find((shot) => shot.scene?.topic === "lineup")?.startSec ??
      null,
  };
  // The intro is right-anchored to air just before the first lineup,
  // so its player count must be the roster THERE — the demo's opening
  // seconds routinely undercount while players are still connecting.
  // Floor of a few seconds: a demo that opens straight on the lineup
  // has an empty roster at t=0 (the stream hasn't delivered it yet).
  const introAirSec = Math.min(
    Math.max(match.lineupStartSec ?? matchStart ?? fromSec, fromSec + 5),
    recording.duration,
  );
  playback.stepToTime(introAirSec);
  let introPlayerCount = playback.getSnapshot().playerRoster?.length ?? 0;
  // The roster streams in over the demo's first seconds — an intro that
  // airs at t≈0 must wait for it rather than announce zero players.
  for (
    let probe = introAirSec + 5;
    introPlayerCount === 0 && probe <= introAirSec + 30;
    probe += 5
  ) {
    playback.stepToTime(Math.min(probe, recording.duration));
    introPlayerCount = playback.getSnapshot().playerRoster?.length ?? 0;
  }

  // Tribes 2 CTF team score = 100 × caps + 1 × grabs; the caps ARE the
  // score people talk about, so the booth gets them decoded.
  const isCtf = /ctf|capture/i.test(match.gameType ?? "");
  // Nicknames: a user-maintained map of display name → allowed short
  // forms (scripts/commentary/nicknames.json), filtered to players who
  // actually appear in this cast so the prompt carries no strangers.
  const nicknamesFile = path.join(
    path.dirname(values.style!),
    "nicknames.json",
  );
  // Roster display names, keyed lowercase — file keys match
  // case-insensitively (decorated or stripped), and the prompt always
  // labels entries with the in-game display name.
  const rosterDisplay = new Map<string, string>();
  for (const shot of plan.shots) {
    for (const p of shot.scene?.players ?? []) {
      rosterDisplay.set(p.name.toLowerCase(), p.name);
    }
  }
  const nicknames: Record<string, string[]> = {};
  if (fs.existsSync(nicknamesFile)) {
    const all = JSON.parse(fs.readFileSync(nicknamesFile, "utf8")) as Record<
      string,
      string[]
    >;
    for (const [name, list] of Object.entries(all)) {
      const display =
        rosterDisplay.get(name.toLowerCase()) ??
        rosterDisplay.get(spokenName(name).toLowerCase());
      if (display) nicknames[display] = list;
    }
  }
  const system = [
    style,
    ...(Object.keys(nicknames).length > 0
      ? [
          `## Nicknames\n\nKnown short forms for players in this match — use them for variety AFTER a player's first full-name mention (lineup reads always use full names). NEVER invent a nickname that is not listed here.\n${Object.entries(
            nicknames,
          )
            .map(([name, list]) => `- ${name}: ${list.join(", ")}`)
            .join("\n")}`,
        ]
      : []),
    ...resources,
    "## This match",
    JSON.stringify(match),
    "Return ONLY the cues JSON for the requested window.",
  ].join("\n\n");
  console.log(
    `system prompt: style + ${resourceNames.length} reference docs + ${Object.keys(nicknames).length} nicknamed players (${Math.round(system.length / 1024)}KB)`,
  );

  const cacheDir = `${outPath}.windows`;
  fs.mkdirSync(cacheDir, { recursive: true });
  const limit = values.limit ? parseInt(values.limit, 10) : Infinity;
  const allCues: Cue[] = [];
  for (let i = 0; i < Math.min(windows.length, limit); i++) {
    const group = windows[i];
    const startSec = Math.max(fromSec, group[0].startSec);
    const endSec = Math.min(toSec, group[group.length - 1].endSec);
    playback.stepToTime(startSec);
    const snap = playback.getSnapshot();
    const preStart = matchStart != null && startSec < matchStart;
    // Lineup coverage runs nearly wall-to-wall; in-match keeps air room.
    const windowAir = preStart ? Math.max(airTime, 0.95) : airTime;
    const brief: WindowBrief = {
      index: i,
      startSec: Math.round(startSec * 10) / 10,
      endSec: Math.round(endSec * 10) / 10,
      clock:
        matchStart != null
          ? clock(Math.max(0, startSec - matchStart))
          : clock(startSec),
      timeRemaining:
        matchStart != null && matchEnd != null && startSec >= matchStart
          ? clock(Math.max(0, matchEnd - startSec))
          : null,
      preStart,
      // ALL connected players (observers included) — the number a
      // browser shows for the server, not the teamed subset. Pre-start
      // windows air at the lineup, so they use the count from there.
      playersOnServer:
        (preStart ? introPlayerCount : 0) || (snap.playerRoster?.length ?? 0),
      score:
        snap.teamScores
          ?.filter((t) => t.teamId > 0)
          .map((t) => ({
            team: t.name,
            score: t.score,
            ...(isCtf && t.score >= 0
              ? { caps: Math.floor(t.score / 100), grabs: t.score % 100 }
              : {}),
          })) ?? [],
      topScorers: preStart
        ? []
        : (snap.playerRoster ?? [])
            .filter((p) => p.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 4)
            .map((p) => ({
              name: spokenName(p.name),
              team:
                snap.teamScores?.find((t) => t.teamId === p.teamId)?.name ?? "",
              score: p.score,
            })),
      wordBudget: Math.round(
        (endSec - startSec) *
          (preStart ? PRESTART_WORDS_PER_SEC : WORDS_PER_SEC) *
          windowAir,
      ),
      shots: group.map(shotBrief),
    };
    const user = buildUserPrompt(brief, allCues, i === 0);
    if (values["dry-run"]) {
      console.log("=== SYSTEM ===\n" + system.slice(0, 2000) + "\n...");
      console.log("=== USER (window 0) ===\n" + user);
      return;
    }
    const cacheFile = path.join(cacheDir, `${String(i).padStart(3, "0")}.json`);
    let cues: Cue[];
    if (fs.existsSync(cacheFile)) {
      // The cache is deliberately not invalidated by prompt changes
      // (each window's prompt chains on the previous windows' cues, so
      // that would cascade-regenerate everything) — but flag it.
      const cachedAt = fs.statSync(cacheFile).mtimeMs;
      const stale =
        cachedAt < fs.statSync(values.style!).mtimeMs ||
        cachedAt < fs.statSync(new URL(import.meta.url)).mtimeMs ||
        resourceNames.some(
          (f) => cachedAt < fs.statSync(path.join(resourcesDir, f)).mtimeMs,
        );
      cues = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as Cue[];
      console.log(
        `[${i + 1}/${windows.length}] cached (${cues.length} cues)${
          stale
            ? " — STALE: written before the current style/script; delete from " +
              cacheDir +
              " to regenerate"
            : ""
        }`,
      );
    } else {
      const sanitize = (raw: Cue[]) =>
        raw
          .filter(
            (c) => c.atSec >= brief.startSec - 1 && c.atSec < brief.endSec + 1,
          )
          .sort((a, b) => a.atSec - b.atSec);
      const countWords = (list: Cue[]) =>
        list.reduce((n, c) => n + c.text.split(/\s+/).length, 0);
      cues = sanitize(await callOpenAIWithRetry(values.model!, system, user));
      let words = countWords(cues);
      let retried = "";
      // The model routinely blows the cap in dense windows; overdense
      // speech can't fit its clock time and desyncs the rendered
      // audio, so enforce with one corrective rewrite.
      if (words > brief.wordBudget * 1.1) {
        const fix = `${user}\n\nYour previous attempt is below. It totals ${words} words — OVER the hard cap of ${brief.wordBudget}. Rewrite this window at or under the cap: keep the essential calls at their exact atSec, and drop or shorten the least important lines rather than compressing all of them.\n\n${JSON.stringify(cues)}`;
        cues = sanitize(await callOpenAIWithRetry(values.model!, system, fix));
        words = countWords(cues);
        retried = " (after rewrite)";
      }
      fs.writeFileSync(cacheFile, JSON.stringify(cues, null, 2));
      console.log(
        `[${i + 1}/${windows.length}] ${brief.startSec}-${brief.endSec}s: ${cues.length} cues, ${words}/${brief.wordBudget} words${retried}`,
      );
    }
    allCues.push(...cues);
  }

  const doc = {
    format: "castgenius-commentary",
    version: 1,
    demo: path.basename(recPath),
    match,
    airTimeTarget: airTime,
    voices: [
      {
        speaker: "rip",
        name: "Rip",
        role: "play-by-play",
        // ElevenLabs voice — energetic play-by-play.
        voiceId: "FmJ4FDkdrYIKzBTruTkV",
      },
      {
        speaker: "doc",
        name: "Doc",
        role: "color",
        // ElevenLabs voice — measured color analyst.
        voiceId: "nzFihrBIvB34imQBuxub",
      },
    ],
    cues: allCues,
  };
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
  console.log(`wrote ${outPath} (${allCues.length} cues)`);
  if (values.txt) {
    const txt = allCues
      .map((c) => `[${clock(c.atSec)}] ${c.speaker.toUpperCase()}: ${c.text}`)
      .join("\n");
    fs.writeFileSync(outPath.replace(/\.json$/, ".txt"), txt);
  }
}

void main();
