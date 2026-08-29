/**
 * Render a commentary cue file (generate-game-commentary.ts output) to
 * a single audio track synced to the demo clock, via ElevenLabs'
 * Text to Dialogue API (Eleven v3).
 *
 *   npm run render-commentary -- <commentary.json> [options]
 *     --out <file>      output audio (default <input minus .json>.mp3)
 *     --limit <n>       render only the first n dialogue bursts
 *     --seed <n>        generation seed (default 7)
 *     --stability <x>   Eleven v3 stability: 0 creative (default, most
 *                       expressive), 0.5 natural, 1 robust
 *     --tempo <x>       per-burst time-stretch factor (default 1.0;
 *                       the API has no speed control — ~1.08 makes the
 *                       booth talk faster without pitch shift)
 *     --pronunciations <file>  respellings JSON (default
 *                       scripts/commentary/pronunciations.json)
 *
 * Pronunciations: the JSON maps written name → spoken respelling
 * ({"Piata": "pinata"}), matched case-insensitively, longest first.
 * It's applied only to the text SENT to ElevenLabs — transcripts keep
 * exact display names.
 *
 * NEVER CUT INSIDE A RENDERED REQUEST. v3 renders a dialogue request
 * as one continuous conversation (scripted pauses between cues do not
 * exist in the audio, and there is no way to ask for exact silences),
 * so cues are grouped into BURSTS at every scripted breather: a burst
 * ends wherever the script leaves ≥2.5s of rest after a line's
 * expected speech (or at the API's character limit). Each burst
 * renders as one multi-speaker request — natural handoffs — and is
 * placed WHOLE at its first cue's demo time; silence between bursts is
 * real silence, not a cut. Tempo/fit stretching applies per burst,
 * after anchoring, so it never shifts an anchor. Per-cue timestamps
 * from the API are kept for the drift report (and future captions),
 * not for cutting.
 *
 * Bursts cache under <out>.chunks/ (audio + timing, keyed by content
 * hash) — reruns re-render nothing. Requires ELEVENLABS_API_KEY
 * (loaded via the npm script) and ffmpeg.
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const CHUNK_MAX_CHARS = 1800;
// A burst ends where the script leaves at least this much rest after a
// line's expected speech — the request boundary IS the pause.
const BURST_REST_SPLIT_SEC = 2.5;
// A burst that would overrun the gap to the next burst is
// time-stretched to fit, up to this — beyond it speech sounds rushed,
// so it overlaps the next burst instead (bounded crosstalk).
const MAX_FIT_TEMPO = 1.3;
// Placement search bounds: a burst may be delayed up to this many
// seconds beyond its first cue when that lines up its LATER cues
// better, but no cue may ever play more than EARLY_TOLERANCE before
// its scripted moment — reacting before an event is a spoiler, worse
// than reacting late.
const MAX_PLACEMENT_DELAY_SEC = 3;
const EARLY_TOLERANCE_SEC = 0.75;
// Pre-match lineup cues are read against specific on-screen shots, so
// they get STRICT per-cue placement: sliced at their measured
// boundaries and placed exactly at atSec. Short fades keep the cuts
// clean; the minimum breath separates back-to-back lines.
const STRICT_EDGE_FADE_SEC = 0.06;
const STRICT_MIN_GAP_SEC = 0.12;
// The intro (everything before the first lineup shot) is RIGHT-ANCHORED
// to end this close to the first lineup read, however long it rendered.
const INTRO_END_PAD_SEC = 0.5;
const WORDS_PER_SEC = 2.6;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    limit: { type: "string" },
    seed: { type: "string", default: "7" },
    stability: { type: "string", default: "0" },
    tempo: { type: "string", default: "1" },
    /** Per-speaker gain in dB ("doc=2.5" or "doc=2.5,rip=-1"): evens
     *  out voices mastered at different loudness. Assembly-only, like
     *  tempo — cached ElevenLabs chunks are reused unchanged. */
    gain: { type: "string", default: "doc=2.5" },
    pronunciations: {
      type: "string",
      default: fileURLToPath(
        new URL("commentary/pronunciations.json", import.meta.url),
      ),
    },
    help: { type: "boolean", default: false, short: "h" },
  },
});

if (values.help || positionals.length < 1) {
  console.error(
    "usage: npm run render-commentary -- <commentary.json> [--out f] [--limit n]",
  );
  process.exit(values.help ? 0 : 1);
}

interface Cue {
  atSec: number;
  speaker: string;
  text: string;
  energy: string;
  /** Index into doc.cues, so placement edits can be written back. */
  idx?: number;
}
interface CommentaryDoc {
  format: string;
  voices: { speaker: string; voiceId: string | null }[];
  match?: { matchStartSec?: number | null; lineupStartSec?: number | null };
  cues: Cue[];
}

/** Per-cue [start, end) positions within a burst's rendered audio. */
interface ChunkTiming {
  starts: number[];
  ends: number[];
}

interface TimestampResponse {
  audio_base64: string;
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
  voice_segments?: {
    voice_id: string;
    start_time_seconds: number;
    end_time_seconds: number;
    dialogue_input_index?: number;
  }[];
}

const inputPath = positionals[0];
const outPath = values.out ?? inputPath.replace(/\.json$/, "") + ".mp3";
const doc = JSON.parse(fs.readFileSync(inputPath, "utf8")) as CommentaryDoc;
if (doc.format !== "castgenius-commentary") {
  console.error(`${inputPath}: not a castgenius-commentary file`);
  process.exit(1);
}
const voiceFor = new Map(doc.voices.map((v) => [v.speaker, v.voiceId]));
for (const v of doc.voices) {
  if (!v.voiceId) {
    console.error(`voice "${v.speaker}" has no voiceId`);
    process.exit(1);
  }
}

// Per-speaker assembly gain (--gain "doc=2.5"): applied in the ffmpeg
// graph over each cue's measured window, so one voice can be evened up
// against the others sharing the same dialogue burst.
const speakerGainDb = new Map<string, number>();
for (const part of (values.gain ?? "").split(",")) {
  const m = part.trim().match(/^([^=]+)=(-?\d+(?:\.\d+)?)$/);
  if (m) speakerGainDb.set(m[1].trim().toLowerCase(), parseFloat(m[2]));
}
// Padding around a cue's measured speech window, so breaths and
// lead-ins ride with the line (windows merge when they touch).
const GAIN_WINDOW_PAD_SEC = 0.15;

/**
 * Volume filter chain for a rendered chunk, boosting the time windows
 * where a gain-adjusted speaker talks. Windows are in raw chunk time,
 * so this must precede any atempo in the filter chain. Returns "" or
 * a chain ending in "," ready to prefix the rest of the filters.
 */
function gainFilterFor(r: {
  cues: Cue[];
  timing: ChunkTiming;
  duration: number;
}): string {
  const filters: string[] = [];
  for (const [speaker, db] of speakerGainDb) {
    const windows: [number, number][] = [];
    r.cues.forEach((cue, j) => {
      if (cue.speaker.toLowerCase() !== speaker) return;
      const start = Math.max(0, r.timing.starts[j] - GAIN_WINDOW_PAD_SEC);
      const end = Math.min(r.duration, r.timing.ends[j] + GAIN_WINDOW_PAD_SEC);
      const last = windows[windows.length - 1];
      if (last && start <= last[1]) last[1] = Math.max(last[1], end);
      else windows.push([start, end]);
    });
    if (windows.length === 0) continue;
    const whole =
      windows.length === 1 &&
      windows[0][0] <= 0.01 &&
      windows[0][1] >= r.duration - 0.01;
    filters.push(
      whole
        ? `volume=${db}dB`
        : `volume=${db}dB:enable='${windows
            .map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`)
            .join("+")}'`,
    );
  }
  return filters.length > 0 ? `${filters.join(",")},` : "";
}
if (!process.env.ELEVENLABS_API_KEY) {
  console.error("ELEVENLABS_API_KEY is not set");
  process.exit(1);
}
try {
  execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.error("ffmpeg/ffprobe not found on PATH — install ffmpeg");
  process.exit(1);
}

function loadPronunciations(file: string): [string, RegExp, string][] {
  if (!fs.existsSync(file)) return [];
  const map = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
    string,
    string
  >;
  return Object.entries(map)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([from, to]) => [
      from,
      new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
      to,
    ]);
}

/**
 * The spoken form of a cue: the pronunciation file's respellings,
 * nothing else. Only ever applied to the text sent to the TTS API.
 */
function spokenForm(
  text: string,
  overrides: [string, RegExp, string][],
): string {
  let out = text;
  for (const [, pattern, to] of overrides) {
    out = out.replace(pattern, to);
  }
  return out;
}

/** Group cues into dialogue bursts (one uncut request each). */
function chunkCues(cues: Cue[]): Cue[][] {
  const chunks: Cue[][] = [];
  let current: Cue[] = [];
  let chars = 0;
  let expectedEnd = 0;
  for (const cue of cues) {
    const rest = current.length > 0 ? cue.atSec - expectedEnd : 0;
    if (
      current.length > 0 &&
      (chars + cue.text.length > CHUNK_MAX_CHARS || rest > BURST_REST_SPLIT_SEC)
    ) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(cue);
    chars += cue.text.length;
    expectedEnd = cue.atSec + cue.text.split(/\s+/).length / WORDS_PER_SEC;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Per-cue timings from the API's timestamp metadata (for the drift
 * report and future captions — never for cutting): voice_segments map
 * straight back to input cues via dialogue_input_index; cues a merged
 * segment swallowed fall back to character-offset lookup in the
 * alignment (the characters are the inputs' texts concatenated).
 */
function cueTimings(
  chunk: Cue[],
  res: TimestampResponse,
  audioDuration: number,
): ChunkTiming {
  const starts = new Array<number>(chunk.length).fill(-1);
  const ends = new Array<number>(chunk.length).fill(-1);
  for (const seg of res.voice_segments ?? []) {
    const j = seg.dialogue_input_index;
    if (j == null || j < 0 || j >= chunk.length) continue;
    if (starts[j] < 0 || seg.start_time_seconds < starts[j]) {
      starts[j] = seg.start_time_seconds;
    }
    if (seg.end_time_seconds > ends[j]) ends[j] = seg.end_time_seconds;
  }
  const align = res.alignment;
  if (starts.some((s) => s < 0) && align) {
    let offset = 0;
    for (let j = 0; j < chunk.length; j++) {
      const len = chunk[j].text.length;
      if (starts[j] < 0 && offset + len <= align.characters.length) {
        starts[j] = align.character_start_times_seconds[offset];
        ends[j] = align.character_end_times_seconds[offset + len - 1];
      }
      offset += len;
    }
  }
  for (let j = 0; j < chunk.length; j++) {
    if (starts[j] < 0) {
      console.warn(
        `  no timing for cue ${j} ("${chunk[j].text.slice(0, 40)}…")`,
      );
      starts[j] = j > 0 ? ends[j - 1] : 0;
      ends[j] =
        j + 1 < chunk.length && starts[j + 1] >= 0
          ? starts[j + 1]
          : audioDuration;
    }
  }
  return { starts, ends };
}

async function renderChunk(
  chunk: Cue[],
  mp3File: string,
  timingFile: string,
): Promise<void> {
  // Transient API failures (rate limits, 5xx) killed whole render runs
  // before this retry existed — same policy as the OpenAI caller.
  for (let attempt = 0; ; attempt++) {
    try {
      return await renderChunkOnce(chunk, mp3File, timingFile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const transient = /ElevenLabs (429|5\d\d)/.test(msg);
      if (attempt >= 4 || !transient) throw err;
      const delay = 2000 * 2 ** attempt;
      console.warn(`  retrying in ${delay / 1000}s: ${msg.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

async function renderChunkOnce(
  chunk: Cue[],
  mp3File: string,
  timingFile: string,
): Promise<void> {
  const res = await fetch(
    "https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128",
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model_id: "eleven_v3",
        seed: parseInt(values.seed!, 10),
        settings: { stability: parseFloat(values.stability!) },
        inputs: chunk.map((cue) => ({
          text: cue.text,
          voice_id: voiceFor.get(cue.speaker),
        })),
      }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `ElevenLabs ${res.status}: ${(await res.text()).slice(0, 400)}`,
    );
  }
  const body = (await res.json()) as TimestampResponse;
  fs.writeFileSync(mp3File, Buffer.from(body.audio_base64, "base64"));
  const timing = cueTimings(chunk, body, durationOf(mp3File));
  fs.writeFileSync(timingFile, JSON.stringify(timing));
}

function durationOf(file: string): number {
  return parseFloat(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ])
      .toString()
      .trim(),
  );
}

async function main(): Promise<void> {
  const overrides = loadPronunciations(values.pronunciations!);
  const spokenCues = doc.cues.map((c, idx) => ({
    ...c,
    idx,
    text: spokenForm(c.text, overrides),
  }));
  const chunks = chunkCues(spokenCues);
  const limit = values.limit ? parseInt(values.limit, 10) : chunks.length;
  const tempo = parseFloat(values.tempo!);
  const cacheDir = `${outPath}.chunks`;
  fs.mkdirSync(cacheDir, { recursive: true });
  console.log(`${doc.cues.length} cues → ${chunks.length} dialogue bursts`);

  const rendered: {
    file: string;
    cues: Cue[];
    timing: ChunkTiming;
    duration: number;
  }[] = [];
  for (let i = 0; i < Math.min(chunks.length, limit); i++) {
    const chunk = chunks[i];
    // Cache key includes generation params and the spoken text, so
    // edited cues or pronunciations re-render — tempo is assembly-only.
    const key = crypto
      .createHash("sha1")
      .update(
        chunk.map((c) => `${voiceFor.get(c.speaker)}:${c.text}`).join("\n"),
      )
      .digest("hex")
      .slice(0, 8);
    const base = path.join(
      cacheDir,
      `${String(i).padStart(3, "0")}.${key}.seed${values.seed}.st${values.stability}`,
    );
    const mp3File = `${base}.mp3`;
    const timingFile = `${base}.timing.json`;
    if (!fs.existsSync(mp3File) || !fs.existsSync(timingFile)) {
      await renderChunk(chunk, mp3File, timingFile);
    }
    const timing = JSON.parse(
      fs.readFileSync(timingFile, "utf8"),
    ) as ChunkTiming;
    rendered.push({
      file: mp3File,
      cues: chunk,
      timing,
      duration: durationOf(mp3File),
    });
  }

  if (rendered.length === 0) {
    console.error("nothing to assemble (no cues, or --limit 0)");
    process.exit(1);
  }

  // Assemble. Two regimes:
  // - PRE-MATCH (lineup) cues are read against specific on-screen
  //   shots, so they get strict per-cue placement: sliced at their
  //   measured boundaries (faded edges) and placed exactly at atSec,
  //   with catch-up stretch when a line ran long.
  // - IN-MATCH bursts play WHOLE at their optimized anchor — no cuts.
  // In both regimes a global no-overlap rule holds: a late clip pushes
  // the next one later; two clips never sound at once.
  const strictBefore = doc.match?.matchStartSec ?? null;
  const lineupStart = doc.match?.lineupStartSec ?? null;
  // Intro bursts (all cues before the first lineup shot) get RIGHT-
  // ANCHORED as one back-to-back block ending INTRO_END_PAD before the
  // lineup: a fixed intro slot left dead air whenever the rendered
  // speech came up short. The cue times this produces are written back
  // to the commentary file so the app starts playback where the intro
  // actually begins.
  const introIdx = new Set<number>();
  let introCursor = 0;
  if (lineupStart != null) {
    let total = 0;
    rendered.forEach((r, i) => {
      if (r.cues[r.cues.length - 1].atSec < lineupStart) {
        introIdx.add(i);
        total += r.duration / tempo + STRICT_MIN_GAP_SEC;
      }
    });
    introCursor = Math.max(0, lineupStart - INTRO_END_PAD_SEC - total);
  }
  const cueTimeEdits = new Map<number, number>();
  const inputs = rendered.flatMap((r) => ["-i", r.file]);
  const parts: string[] = [];
  const mixIns: string[] = [];
  let n = 0;
  let scheduleEnd = 0;
  let worstDrift = 0;
  let worstLate = 0;
  rendered.forEach((r, i) => {
    if (introIdx.has(i)) {
      const placed = Math.max(introCursor, scheduleEnd + STRICT_MIN_GAP_SEC);
      const fileStart = placed - r.timing.starts[0] / tempo;
      scheduleEnd = fileStart + r.duration / tempo;
      introCursor = scheduleEnd + STRICT_MIN_GAP_SEC;
      r.cues.forEach((cue, j) => {
        if (cue.idx != null) {
          cueTimeEdits.set(
            cue.idx,
            placed + (r.timing.starts[j] - r.timing.starts[0]) / tempo,
          );
        }
      });
      console.log(
        `[${i + 1}/${rendered.length}] intro block → ${placed.toFixed(1)}s (right-anchored to lineup at ${lineupStart?.toFixed(1)}s)`,
      );
      const stretch = tempo !== 1 ? `atempo=${tempo},` : "";
      parts.push(
        `[${i}]${gainFilterFor(r)}${stretch}adelay=${Math.max(0, Math.round(fileStart * 1000))}:all=1[c${n}]`,
      );
      mixIns.push(`[c${n}]`);
      n++;
      return;
    }
    if (
      strictBefore != null &&
      r.cues[r.cues.length - 1].atSec < strictBefore
    ) {
      const labels = r.cues.map((_, j) => `[s${i}_${j}]`).join("");
      parts.push(`[${i}]asplit=${r.cues.length}${labels}`);
      r.cues.forEach((cue, j) => {
        const rawStart = r.timing.starts[j];
        const rawEnd = Math.max(r.timing.ends[j], rawStart + 0.05);
        const raw = rawEnd - rawStart;
        const start = Math.max(cue.atSec, scheduleEnd + STRICT_MIN_GAP_SEC);
        const nextTarget =
          j + 1 < r.cues.length
            ? r.cues[j + 1].atSec
            : i + 1 < rendered.length
              ? rendered[i + 1].cues[0].atSec
              : Number.POSITIVE_INFINITY;
        let rate = tempo;
        if (start + raw / rate > nextTarget - STRICT_MIN_GAP_SEC) {
          rate = Math.min(
            MAX_FIT_TEMPO,
            raw / Math.max(0.5, nextTarget - STRICT_MIN_GAP_SEC - start),
          );
        }
        worstLate = Math.max(worstLate, start - cue.atSec);
        scheduleEnd = start + raw / rate;
        const fadeOutAt = Math.max(0, raw - STRICT_EDGE_FADE_SEC).toFixed(3);
        // A sliced cue has a single speaker, so its gain needs no
        // enable windows — a flat volume on the slice covers it.
        const sliceGain = speakerGainDb.get(cue.speaker.toLowerCase());
        parts.push(
          `[s${i}_${j}]atrim=start=${rawStart.toFixed(3)}:end=${rawEnd.toFixed(3)},asetpts=PTS-STARTPTS,` +
            `${sliceGain ? `volume=${sliceGain}dB,` : ""}` +
            `afade=t=in:d=${STRICT_EDGE_FADE_SEC},afade=t=out:st=${fadeOutAt}:d=${STRICT_EDGE_FADE_SEC},` +
            `${rate !== 1 ? `atempo=${rate},` : ""}adelay=${Math.round(start * 1000)}:all=1[c${n}]`,
        );
        mixIns.push(`[c${n}]`);
        n++;
      });
      console.log(
        `[${i + 1}/${rendered.length}] at ${r.cues[0].atSec.toFixed(1)}s: ${r.cues.length} lineup cues, strict per-cue placement`,
      );
      return;
    }
    const first = r.cues[0].atSec;
    const nextAt =
      i + 1 < rendered.length
        ? rendered[i + 1].cues[0].atSec
        : Number.POSITIVE_INFINITY;
    // Placement search: v3 paces the burst its own way, so anchoring
    // the first cue exactly can put all the error on the later cues.
    // Try bounded delay × stretch combinations and keep the one with
    // the least worst-case cue error, under the constraints: no cue
    // early beyond tolerance, and the burst may not spill its slot.
    let best = { delay: 0, rate: tempo, err: Number.POSITIVE_INFINITY };
    for (let rate = tempo; rate <= MAX_FIT_TEMPO + 1e-9; rate += 0.02) {
      for (
        let delay = 0;
        delay <= MAX_PLACEMENT_DELAY_SEC + 1e-9;
        delay += 0.25
      ) {
        if (first + delay + r.duration / rate > nextAt) continue;
        let err = delay;
        let early = 0;
        for (let j = 1; j < r.cues.length; j++) {
          const d =
            first +
            delay +
            (r.timing.starts[j] - r.timing.starts[0]) / rate -
            r.cues[j].atSec;
          err = Math.max(err, Math.abs(d));
          early = Math.max(early, -d);
        }
        if (early > EARLY_TOLERANCE_SEC) continue;
        if (err < best.err) best = { delay, rate, err };
      }
    }
    if (!Number.isFinite(best.err)) {
      // Nothing satisfies the slot — fall back to first-cue anchor
      // with a hard fit-stretch (bounded overlap into the next burst).
      const rate = Math.min(
        MAX_FIT_TEMPO,
        Math.max(tempo, (r.duration / (nextAt - first)) * 1.01),
      );
      best = { delay: 0, rate, err: 0 };
      for (let j = 1; j < r.cues.length; j++) {
        const d =
          first +
          (r.timing.starts[j] - r.timing.starts[0]) / rate -
          r.cues[j].atSec;
        best.err = Math.max(best.err, Math.abs(d));
      }
    }
    // No-overlap rule: never start while the previous clip still plays.
    const atSec = Math.max(
      first + best.delay,
      scheduleEnd + STRICT_MIN_GAP_SEC,
    );
    worstLate = Math.max(worstLate, atSec - first);
    worstDrift = Math.max(worstDrift, best.err);
    const shaped =
      best.delay > 0 || best.rate !== tempo
        ? ` (${best.delay > 0 ? `+${best.delay.toFixed(2)}s` : ""}${
            best.rate !== tempo ? ` ×${best.rate.toFixed(2)}` : ""
          } → ±${best.err.toFixed(1)}s)`
        : "";
    console.log(
      `[${i + 1}/${rendered.length}] at ${atSec.toFixed(1)}s: ${r.cues.length} cues, ${(r.duration / best.rate).toFixed(1)}s${
        Number.isFinite(nextAt) ? ` / ${(nextAt - first).toFixed(1)}s slot` : ""
      }${shaped}`,
    );
    const stretch = best.rate !== 1 ? `atempo=${best.rate},` : "";
    // The first cue's SPEECH must land at the anchor, not the file
    // start — v3 renders a beat of lead-in before the first word, and
    // the optimizer measures cues relative to it, so an uncompensated
    // delay would shift the whole burst late by that lead-in.
    const fileStart = atSec - r.timing.starts[0] / best.rate;
    scheduleEnd = fileStart + r.duration / best.rate;
    const delayMs = Math.max(0, Math.round(fileStart * 1000));
    parts.push(
      `[${i}]${gainFilterFor(r)}${stretch}adelay=${delayMs}:all=1[c${n}]`,
    );
    mixIns.push(`[c${n}]`);
    n++;
  });
  console.log(
    `worst in-burst cue drift ${worstDrift.toFixed(1)}s` +
      (worstLate > 0.5
        ? `, worst clip pushed ${worstLate.toFixed(1)}s late by the no-overlap rule`
        : ""),
  );
  // asetpts after the mix regenerates clean monotonic timestamps —
  // the delayed inputs otherwise upset the mp3 muxer.
  const mix = `${mixIns.join("")}amix=inputs=${mixIns.length}:normalize=0,asetpts=N/SR/TB[out]`;
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      ...inputs,
      "-filter_complex",
      [...parts, mix].join(";"),
      "-map",
      "[out]",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "128k",
      outPath,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const total = durationOf(outPath);
  if (cueTimeEdits.size > 0) {
    // Persist the intro's true start times so the app (which reads the
    // first cue's atSec) begins playback where the audio begins. A
    // fresh generator run rebuilds these from the windows; this edit
    // re-applies on every render.
    for (const [idx, at] of cueTimeEdits) {
      doc.cues[idx].atSec = Math.round(at * 10) / 10;
    }
    fs.writeFileSync(inputPath, JSON.stringify(doc, null, 2));
    console.log(`updated ${cueTimeEdits.size} intro cue times in ${inputPath}`);
  }
  console.log(
    `wrote ${outPath} (${(total / 60).toFixed(1)} min, ${rendered.length} uncut bursts anchored to the demo clock)`,
  );
}

void main();
