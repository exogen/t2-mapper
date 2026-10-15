/**
 * The checks an upgraded relay recording must pass before it replaces the
 * original (upgradeRelayDemo.ts). Tribes2.exe must play it to the end; it
 * must hold the original's packets and send markers in order, each packet
 * changed only where the upgrade says it changes them (the move ack, a
 * welcome page's message type), and its moves less only the cut and the
 * dropped ticks; upgrading it again must change nothing; and the demo
 * browser must describe it as it described the original.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  BitStream,
  BlockTypePacket,
  BlockTypeSendPacket,
  DemoParser,
  type NetStringEventData,
  type RemoteCommandEventData,
} from "t2-demo-parser";
import type { DemoStreamEntry } from "../../relay/demoStart.js";
import { DEMO_TICK_MS } from "../../relay/demoWriter.js";
import {
  JOIN_GAME_OVER_WINDOW_MS,
  MESSAGE_TYPE_ID_OFFSET,
  TAG_ID_BITS,
  isGameOverMessage,
} from "../../relay/joinGameOver.js";
import { NetStringTable, hasGameOverAnnouncement } from "../../relay/shared.js";
import { analyzeDemo } from "./analyzeDemo.js";
import { playLikeTribes2, type Tribes2Playback } from "./tribes2Playback.js";
import {
  formatDemoTime,
  moveAckOffset,
  readBlocks,
  recordedEntries,
  upgradeRelayDemo,
  type RelayDemoUpgrade,
} from "./upgradeRelayDemo.js";

export interface RelayDemoValidation {
  problems: string[];
  playback: Tribes2Playback;
}

function changedBits(a: Uint8Array, b: Uint8Array): number[] {
  const bits: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] ^ b[i];
    if (diff === 0) continue;
    for (let bit = 0; bit < 8; bit++)
      if (diff & (1 << bit)) bits.push(i * 8 + bit);
  }
  return bits;
}

/**
 * What would keep Tribes2.exe from playing a relay recording through.
 */
export function playbackProblems(playback: Tribes2Playback): string[] {
  const problems: string[] = [];
  if (playback.stalledAtMs !== undefined)
    problems.push(`playback stalls at ${formatDemoTime(playback.stalledAtMs)}`);
  if (playback.moveUnderflowAtMs !== undefined)
    problems.push(
      `a move ack pops an empty queue at ${formatDemoTime(playback.moveUnderflowAtMs)}`,
    );
  if (playback.notifyUnderflowAtMs !== undefined)
    problems.push(
      `a packet ack pops no notify at ${formatDemoTime(playback.notifyUnderflowAtMs)}`,
    );
  if (playback.dispatchMismatches > 0)
    problems.push(
      `${playback.dispatchMismatches} packets dispatched differently from the recording, ` +
        `first at ${formatDemoTime(playback.firstDispatchMismatchMs!)}`,
    );
  if (playback.parseFaults > 0)
    problems.push(`${playback.parseFaults} dispatched packets fail to parse`);
  if (playback.strayInfoBlocks > 0)
    problems.push(
      `${playback.strayInfoBlocks} Info blocks that follow no packet`,
    );
  if (playback.authCommands.length > 0)
    problems.push(
      `handshake commands remain: ${playback.authCommands.join(", ")}`,
    );
  for (const { atMs, announced } of playback.debriefScreens)
    if (!announced && atMs < JOIN_GAME_OVER_WINDOW_MS)
      problems.push(
        `a welcome page leaves the debrief screen up at ${formatDemoTime(atMs)}`,
      );
  return problems;
}

/**
 * Check `upgraded`, which upgradeRelayDemo wrote from `original` with
 * `report`.
 */
export async function validateRelayDemoUpgrade(
  original: Uint8Array,
  upgraded: Uint8Array,
  report: RelayDemoUpgrade,
  filename: string,
): Promise<RelayDemoValidation> {
  const playback = await playLikeTribes2(upgraded);
  const problems = playbackProblems(playback);
  const problem = (message: string) => problems.push(message);

  const upgradedParser = new DemoParser(upgraded);
  const { header, initialBlock } = await upgradedParser.load();
  const { header: originalHeader } = await new DemoParser(original).load();
  if (initialBlock.warnings.length > 0)
    problem(`start block warnings: ${initialBlock.warnings.join("; ")}`);
  if (!initialBlock.phase2Valid) problem("start block does not parse");
  if (header.demoLengthMs !== report.newLengthMs)
    problem(
      `header length ${header.demoLengthMs} ms, expected ${report.newLengthMs}`,
    );

  const originalEntries = recordedEntries(
    readBlocks(original, originalHeader.initialBlockSize),
  );
  const upgradedEntries = recordedEntries(
    readBlocks(upgraded, header.initialBlockSize),
  );
  const originalRest = originalEntries.filter((entry) => entry.kind !== "move");
  const upgradedRest = upgradedEntries.filter((entry) => entry.kind !== "move");
  const skipped = originalRest.length - upgradedRest.length;
  if (skipped < 0) problem("more packets and sends than the original");
  // A recording with no handshake keeps its start; one with a handshake
  // that stays fails on its commands above.
  if (report.generation === "current" && skipped !== 0)
    problem(`${skipped} leading packets and sends left out`);

  // Each kept packet against its original, parsed in order so a changed
  // message type can be checked against the string table.
  const strings = new NetStringTable(initialBlock.taggedStrings);
  // Counted by packet, as upgradeRelayDemo reports them.
  let rewrittenPages = 0;
  let index = 0;
  for (
    let block = upgradedParser.nextBlock();
    block && skipped >= 0;
    block = upgradedParser.nextBlock()
  ) {
    if (block.type !== BlockTypePacket && block.type !== BlockTypeSendPacket)
      continue;
    const upgradedEntry = upgradedRest[index];
    const originalEntry = originalRest[skipped + index];
    index++;
    if (upgradedEntry.kind !== originalEntry.kind) {
      problem(
        `entry ${index - 1} is a ${upgradedEntry.kind}, originally a ${originalEntry.kind}`,
      );
      break;
    }
    if (upgradedEntry.kind !== "packet" || originalEntry.kind !== "packet")
      continue;
    if (
      report.generation === "current" &&
      upgradedEntry.dispatched !== originalEntry.dispatched
    )
      problem(`packet ${index - 1} dispatch changed`);
    if (upgradedEntry.data.length !== originalEntry.data.length) {
      problem(`packet ${index - 1} changed size`);
      continue;
    }
    const changed = changedBits(originalEntry.data, upgradedEntry.data);
    const allowed: [number, number][] = [];
    let hasPage = false;
    if (report.generation === "unacked-moves" && upgradedEntry.dispatched) {
      const ackAt = moveAckOffset(upgradedEntry.data);
      allowed.push([ackAt, ackAt + 32]);
    }
    const parsed =
      block.parsed && "events" in block.parsed ? block.parsed : undefined;
    for (const event of parsed?.events ?? []) {
      const data = event.parsedData;
      if (data?.type === "NetStringEvent") {
        strings.apply(data as NetStringEventData);
        continue;
      }
      if (data?.type !== "RemoteCommandEvent") continue;
      const from = event.dataBitsStart + MESSAGE_TYPE_ID_OFFSET;
      const to = from + TAG_ID_BITS;
      if (!changed.some((bit) => bit >= from && bit < to)) continue;
      // Only a welcome page's type, swapped for its own command's tag.
      const { argv } = data as RemoteCommandEventData;
      const [command, , body] = argv.map((arg) => strings.resolve(arg));
      const originalType = strings.get(
        new BitStream(originalEntry.data, from).readInt(TAG_ID_BITS),
      );
      if (
        argv[0] === argv[1] &&
        isGameOverMessage(command, originalType) &&
        !hasGameOverAnnouncement(body)
      ) {
        allowed.push([from, to]);
        hasPage = true;
      }
    }
    if (hasPage) rewrittenPages++;
    const stray = changed.filter(
      (bit) => !allowed.some(([from, to]) => bit >= from && bit < to),
    );
    if (stray.length > 0)
      problem(
        `packet ${index - 1} changed ${stray.length} bits outside the move ack and a welcome page's type`,
      );
  }
  if (rewrittenPages !== report.gameOversRewritten)
    problem(
      `${rewrittenPages} welcome pages rewritten, report says ${report.gameOversRewritten}`,
    );

  const moves = (entries: DemoStreamEntry[]) =>
    entries.filter((entry) => entry.kind === "move").length;
  const upgradedMoves = moves(upgradedEntries);
  const cutMoves = report.cutMs / DEMO_TICK_MS;
  const keptMoves = moves(originalEntries) - cutMoves;
  if (upgradedMoves * DEMO_TICK_MS !== report.newLengthMs)
    problem(
      `${upgradedMoves} moves, report says ${report.newLengthMs / DEMO_TICK_MS}`,
    );
  if (keptMoves - upgradedMoves !== report.droppedTicks)
    problem(
      `${keptMoves - upgradedMoves} moves dropped, report says ${report.droppedTicks}`,
    );

  // Moves are only ever dropped: before each packet or send, no more than
  // the original kept.
  const movesBefore = (entries: DemoStreamEntry[]) => {
    const counts: number[] = [];
    let count = 0;
    for (const entry of entries) {
      if (entry.kind === "move") count++;
      else counts.push(count);
    }
    return counts;
  };
  const upgradedBefore = movesBefore(upgradedEntries);
  const originalBefore = movesBefore(originalEntries);
  for (let i = 0; i < upgradedBefore.length && skipped >= 0; i++) {
    if (upgradedBefore[i] > originalBefore[skipped + i] - cutMoves) {
      problem(`moves before entry ${i} exceed the original's`);
      break;
    }
  }

  const scratch = await fs.mkdtemp(
    path.join(os.tmpdir(), "relay-demo-recheck-"),
  );
  try {
    const again = await upgradeRelayDemo(
      upgraded,
      path.join(scratch, filename),
    );
    if (again.generation !== "current" || again.gameOversRewritten !== 0)
      problem(
        `upgrading again changes it (${again.generation}, ${again.gameOversRewritten} pages)`,
      );
  } catch (error) {
    problem(`upgrading again fails: ${String(error)}`);
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }

  const before = await analyzeDemo(original, filename);
  const after = await analyzeDemo(upgraded, filename);
  const described = (m: typeof before) =>
    JSON.stringify({
      server: m.server,
      address: m.address,
      mod: m.mod,
      recorder: m.recorder,
      recordedAt: m.recordedAt,
      playerCount: m.playerCount,
      games: m.games.map(
        ({ mission, missionSequence, gameType, tournament }) => ({
          mission,
          missionSequence,
          gameType,
          tournament,
        }),
      ),
    });
  if (described(before) !== described(after))
    problem("the demo browser describes it differently");
  // Only a name the cut leaves out can go: one a player had for part of
  // the handshake before a rename, whose player stays under the new name.
  const names = new Set(before.players);
  const invented = after.players.filter((name) => !names.has(name));
  if (invented.length > 0)
    problem(`players the original never had: ${invented.join(", ")}`);
  if (after.durationMs !== report.newLengthMs)
    problem(
      `analyzed duration ${after.durationMs} ms, expected ${report.newLengthMs}`,
    );

  return { problems, playback };
}
