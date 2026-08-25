import { streamSnapshotStore } from "../state/streamSnapshotStore";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { stripTaggedStringMarkup } from "../stream/streamHelpers";
import type { GameEntity } from "../state/gameEntityTypes";

/**
 * Resolves which team's flag a flag-marked entity represents. Flag items
 * carry their team name as the target name. A carrier identifies the
 * carried flag by the flag image's skin: the server applies the same
 * team skin to the flag's target and to the mounted flag image
 * (CTFGame::getTeamSkin), so the skin is matched against each team's
 * flag skin from the target table — which handles servers with custom
 * team skins (e.g. beagle/dsword on Classic) — falling back to the
 * stock CTF skin names (base = team 1, baseb = team 2).
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
      teamId =
        teams?.find((t) => t.skinName === skin)?.teamId ??
        (skin === "base" ? 1 : skin === "baseb" ? 2 : null);
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

/**
 * Display name for a flag entity: "Rambo Flag" (real team name when
 * known); the target's own name or a plain "Flag" for teamless flags
 * (sensor group 0 counts as teamless — e.g. Rabbit never assigns its
 * flag a team). Shared by the follow HUD, tour panel, and callouts.
 */
export function flagLabel(entity: GameEntity): string {
  const { teamId, name } = resolveFlagTeam(entity);
  const teamName = name ? stripTaggedStringMarkup(name).trim() || null : null;
  return teamId != null && teamId > 0 && teamName
    ? `${teamName} Flag`
    : (teamName ?? "Flag");
}
