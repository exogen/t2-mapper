import { casterStore } from "./casterStore";
import { streamSnapshotStore } from "./streamSnapshotStore";
import { DEFAULT_TEAM_NAMES, formatTargetName } from "../stringUtils";
import { stripTaggedStringMarkup } from "../stream/streamHelpers";
import type { GameEntity } from "./gameEntityTypes";
import type { FlagTargetInfo } from "../stream/types";

/**
 * Resolves which team's flag a flag-marked entity represents. Flag items
 * carry their team name as the target name. A carrier identifies the
 * carried flag by the flag image's skin: the server applies the same
 * team skin to the flag's target and to the mounted flag image
 * (CTFGame::getTeamSkin), so the skin is matched against each team's
 * flag skin from the target table, including custom team skins.
 * A generic "base" skin does not establish team ownership (Rabbit).
 */
export function resolveFlagTeam(entity: GameEntity): {
  teamId: number | null;
  name: string | null;
} {
  const teams = streamSnapshotStore.getState().snapshot?.teamScores;
  if (entity.renderType === "Player") {
    const slot = entity.imageSlots?.find((s) =>
      s?.shapeName?.toLowerCase().startsWith("flag"),
    );
    const skin = slot?.skinName?.toLowerCase();
    let teamId: number | null = null;
    if (skin) {
      teamId = teams?.find((t) => t.skinName === skin)?.teamId ?? null;
    }
    return {
      teamId,
      name: teamId
        ? (teams?.find((t) => t.teamId === teamId)?.name ??
          DEFAULT_TEAM_NAMES[teamId] ??
          null)
        : null,
    };
  }
  // Flag items carry the team directly: their target's sensor group is
  // set to flag.team by the server (CTFGame.cs setTargetSensorGroup).
  const teamId = ("teamId" in entity ? entity.teamId : undefined) ?? null;
  const name = teamId
    ? (teams?.find((t) => t.teamId === teamId)?.name ??
      ("playerName" in entity ? (entity.playerName ?? null) : null) ??
      DEFAULT_TEAM_NAMES[teamId] ??
      null)
    : "playerName" in entity
      ? (entity.playerName ?? null)
      : null;
  return { teamId, name };
}

/** Find the flag's own target without depending on its item ghost being visible. */
function originalFlagTarget(entity: GameEntity): FlagTargetInfo | undefined {
  const targets = streamSnapshotStore.getState().snapshot?.flagTargets;
  if (!targets?.length) return undefined;
  if (entity.renderType !== "Player") {
    return targets.find(
      (target) => "targetId" in entity && target.targetId === entity.targetId,
    );
  }
  // CTF mounts the flag image using its team's target skin. Single-flag
  // modes need no team association, including when joining during a pickup.
  if (targets.length === 1) return targets[0];
  const skin = entity.imageSlots
    ?.find((slot) => slot?.shapeName?.toLowerCase().startsWith("flag"))
    ?.skinName?.toLowerCase();
  if (!skin) return undefined;
  const matches = targets.filter((target) => target.skinName === skin);
  return matches.length === 1 ? matches[0] : undefined;
}

/** Explicitly select the flag's own label or its current carrier's target label.
 *  Original labels honor team-name overrides. Map-only flags without target
 *  metadata retain the explorer's team-qualified label. */
export function flagLabel(
  entity: GameEntity,
  kind: "original" | "contextual",
  teamNames = casterStore.getState().settings?.teamNames,
): string {
  const targetName =
    "playerName" in entity
      ? (entity.playerRawName ?? entity.playerName)
      : undefined;
  const targetType =
    "targetTypeName" in entity ? entity.targetTypeName : undefined;
  if (kind === "contextual" && entity.renderType === "Player") {
    return stripTaggedStringMarkup(
      formatTargetName(targetName, targetType),
    ).trim();
  }
  const original = originalFlagTarget(entity);
  if (original) {
    const customName =
      original.teamId != null ? teamNames?.[original.teamId] : undefined;
    return stripTaggedStringMarkup(
      formatTargetName(customName || original.name, original.typeName),
    ).trim();
  }
  // Missing original metadata must never turn an objective label into a
  // player's name. The target table will supply the label once it arrives.
  if (entity.renderType === "Player") return "Flag";
  const { teamId, name } = resolveFlagTeam(entity);
  const customName = teamId != null ? teamNames?.[teamId] : undefined;
  const hasTargetInfo =
    entity.ghostIndex != null ||
    ("targetId" in entity && entity.targetId != null) ||
    targetName != null ||
    targetType != null;
  return stripTaggedStringMarkup(
    formatTargetName(
      customName || (hasTargetInfo ? targetName : name),
      targetType ?? (hasTargetInfo ? "" : "Flag"),
    ),
  ).trim();
}
