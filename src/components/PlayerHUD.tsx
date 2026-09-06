import { useRef } from "react";
import { useStore } from "zustand";
import { FaHand } from "react-icons/fa6";
import { ImArrowDownRight, ImHome } from "react-icons/im";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { useDataSource } from "../state/gameEntityStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { textureToUrl } from "../loaders";
import type { StreamEntity, TeamScore, WeaponsHudSlot } from "../stream/types";
import styles from "./PlayerHUD.module.css";
import { ChatWindow } from "./ChatWindow";
import { CompassDial } from "./CompassDial";
import { useCameraHeadingRotor } from "./MapCompass";
import { formatHudClock, useMatchClockMs } from "./useMatchClock";
import { useSettings } from "./SettingsProvider";
import { useCommandCircuit } from "../state/commandCircuitStore";

function Compass({ commandCircuitActive }: { commandCircuitActive: boolean }) {
  const isWatcher = useLiveSelector((s) => s.role === "watcher");
  const dataSource = useDataSource();
  const cameraMode = useStore(streamPlaybackStore, (s) => s.cameraMode);
  const yaw = useStreamSnapshot((snap) => snap?.camera?.yaw);
  const matchClockMs = useMatchClockMs();
  // Watch mode (always) and demo camera overrides (free-fly / follow /
  // first-person / flag follow): the view camera is client-controlled,
  // so the stream camera's yaw is the RECORDER's view, not what's on
  // screen — track the render camera instead.
  if (isWatcher || (dataSource === "demo" && cameraMode !== "original")) {
    return (
      <LocalCameraCompass
        commandCircuitActive={commandCircuitActive}
        matchClockMs={matchClockMs}
      />
    );
  }
  if (yaw == null) return null;
  // The notch is the fixed heading indicator (always "forward" at top).
  // The NSEW letters rotate to show world cardinal directions relative to
  // the player's heading. Positive Torque yaw = turning right (clockwise
  // from above), so N moves counter-clockwise on the display. The command
  // circuit map can't rotate (screen-up is always north), so its compass
  // is pinned north-up like explore mode's.
  const deg = commandCircuitActive ? 0 : (yaw * 180) / Math.PI;
  return (
    <div className={styles.Compass}>
      <CompassDial deg={deg}>
        {matchClockMs != null && (
          <span className={styles.CompassClock}>
            {formatHudClock(matchClockMs)}
          </span>
        )}
      </CompassDial>
    </div>
  );
}

function LocalCameraCompass({
  commandCircuitActive,
  matchClockMs,
}: {
  commandCircuitActive: boolean;
  matchClockMs: number | null | undefined;
}) {
  const rotorRef = useRef<SVGGElement>(null);
  useCameraHeadingRotor(rotorRef);
  const clock =
    matchClockMs != null ? (
      <span className={styles.CompassClock}>
        {formatHudClock(matchClockMs)}
      </span>
    ) : null;
  return (
    <div className={styles.Compass}>
      {commandCircuitActive ? (
        // The command circuit map can't rotate — pin north-up.
        <CompassDial deg={0}>{clock}</CompassDial>
      ) : (
        <CompassDial rotorRef={rotorRef}>{clock}</CompassDial>
      )}
    </div>
  );
}

function HealthBar({ followed }: { followed: FollowedPlayer | null }) {
  const recorderHealth = useStreamSnapshot((snap) => snap?.status?.health);
  const health = followed ? followed.health : recorderHealth;
  if (health == null) return null;
  const pct = Math.max(0, Math.min(100, health * 100));
  return (
    <div className={styles.BarTrack}>
      <div className={styles.BarFillHealth} style={{ width: `${pct}%` }} />
    </div>
  );
}

function EnergyBar({ followed }: { followed: FollowedPlayer | null }) {
  const energy = useStreamSnapshot((snap) => snap?.status?.energy);
  if (followed && followed.energy == null) {
    return (
      <div className={styles.BarTrack}>
        <div className={styles.BarFillUnknown} />
      </div>
    );
  }
  const shown = followed ? followed.energy : energy;
  if (shown == null) return null;
  const pct = Math.max(0, Math.min(100, shown * 100));
  return (
    <div className={styles.BarTrack}>
      <div className={styles.BarFillEnergy} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Heat a target must have for missiles to lock (missileLauncher.cs
 *  minSeekHeat). Above this, the bar flashes as a warning. */
const MISSILE_LOCK_HEAT = 0.7;

function HeatBar({ followed }: { followed: FollowedPlayer | null }) {
  const heat = useStreamSnapshot((snap) => snap?.status?.heat);
  // Heat is never ghosted for other players.
  if (followed) {
    return (
      <div className={styles.BarTrackHeat}>
        <div className={styles.BarFillUnknown} />
      </div>
    );
  }
  if (heat == null) return null;
  const pct = Math.max(0, Math.min(100, heat * 100));
  const targetable = heat >= MISSILE_LOCK_HEAT;
  return (
    <div className={styles.BarTrackHeat}>
      <div
        className={targetable ? styles.BarFillHeatFlash : styles.BarFillHeat}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Maps normalized weapon shape names to reticle textures from $WeaponsHudData. */
const RETICLE_TEXTURES: Record<string, string> = {
  weapon_energy: "gui/ret_blaster",
  weapon_plasma: "gui/ret_plasma",
  weapon_chaingun: "gui/ret_chaingun",
  weapon_disc: "gui/ret_disc",
  weapon_grenade_launcher: "gui/ret_grenade",
  weapon_sniper: "gui/hud_ret_sniper",
  weapon_elf: "gui/ret_elf",
  weapon_mortar: "gui/ret_mortor",
  weapon_missile: "gui/ret_missile",
  weapon_targeting: "gui/hud_ret_targlaser",
  weapon_shocklance: "gui/hud_ret_shocklance",
};

function normalizeWeaponName(shape: string | undefined): string {
  if (!shape) return "";
  return shape.replace(/\.dts$/i, "").toLowerCase();
}

/**
 * The crosshair of whoever's eyes the view is looking through: the
 * recorder's in the recorded first-person view, the followed player's in
 * first-person follow. Any other camera has no reticle.
 */
function Reticle() {
  const cameraMode = useStore(streamPlaybackStore, (s) => s.cameraMode);
  const followEntityId = useStore(streamPlaybackStore, (s) => s.followEntityId);
  const weaponShape = useStreamSnapshot((snap) => {
    if (!snap) return undefined;
    let viewedId: string | undefined;
    if (cameraMode === "firstPersonOverride") {
      viewedId = followEntityId ?? undefined;
    } else if (
      cameraMode === "original" &&
      snap.camera?.mode === "first-person"
    ) {
      viewedId = snap.controlPlayerGhostId ?? undefined;
    }
    if (!viewedId) return undefined;
    const entity = snap.entities.find((e: StreamEntity) => e.id === viewedId);
    if (!entity) return undefined;
    return entity.imageSlots?.[0]?.shapeName ?? "";
  });
  if (weaponShape === undefined) return null;
  const weapon = normalizeWeaponName(weaponShape);
  const textureName = RETICLE_TEXTURES[weapon];
  if (textureName) {
    return (
      <div className={styles.Reticle}>
        <img
          src={textureToUrl(textureName)}
          alt=""
          className={styles.ReticleImage}
        />
      </div>
    );
  }
  return null;
}

/** Maps $WeaponsHudData indices to simple icon textures (no baked background)
 *  and labels. The mortar's is spelled hud_mortor in the game files. */
const WEAPON_HUD_SLOTS: Record<number, { icon: string; label: string }> = {
  0: { icon: "gui/hud_blaster", label: "Blaster" },
  1: { icon: "gui/hud_plasma", label: "Plasma" },
  2: { icon: "gui/hud_chaingun", label: "Chaingun" },
  3: { icon: "gui/hud_disc", label: "Spinfusor" },
  4: { icon: "gui/hud_grenlaunch", label: "GL" },
  5: { icon: "gui/hud_sniper", label: "Laser Rifle" },
  6: { icon: "gui/hud_elfgun", label: "ELF Gun" },
  7: { icon: "gui/hud_mortor", label: "Mortar" },
  8: { icon: "gui/hud_missiles", label: "Missile" },
  9: { icon: "gui/hud_targetlaser", label: "Targeting" },
  10: { icon: "gui/hud_shocklance", label: "Shocklance" },
  // TR2 variants reuse the same icons.
  11: { icon: "gui/hud_disc", label: "Spinfusor" },
  12: { icon: "gui/hud_grenlaunch", label: "GL" },
  13: { icon: "gui/hud_chaingun", label: "Chaingun" },
  14: { icon: "gui/hud_targetlaser", label: "Targeting" },
  15: { icon: "gui/hud_targetlaser", label: "Targeting" },
  16: { icon: "gui/hud_shocklance", label: "Shocklance" },
  17: { icon: "gui/hud_mortor", label: "Mortar" },
};

// Precompute URLs so we don't call textureToUrl on every render.
const WEAPON_HUD_ICON_URLS = new Map(
  Object.entries(WEAPON_HUD_SLOTS).map(([idx, w]) => [
    Number(idx),
    textureToUrl(w.icon),
  ]),
);

/** Targeting laser HUD indices (standard + TR2 variants). */
const TARGETING_LASER_INDICES = new Set([9, 14, 15]);
const INFINITY_ICON_URL = textureToUrl("gui/hud_infinity");

function WeaponSlotIcon({
  slot,
  isSelected,
}: {
  slot: WeaponsHudSlot;
  isSelected: boolean;
}) {
  const info = WEAPON_HUD_SLOTS[slot.index];
  if (!info) return null;
  const isInfinite = slot.ammo < 0;
  return (
    <div className={styles.PackInvItem} data-active={isSelected}>
      <img
        src={WEAPON_HUD_ICON_URLS.get(slot.index)!}
        alt={info.label}
        className={styles.PackInvIcon}
      />
      {isInfinite ? (
        <img
          src={INFINITY_ICON_URL}
          alt="\u221E"
          className={styles.PackInvInfinity}
        />
      ) : (
        <span className={styles.PackInvCount}>{slot.ammo}</span>
      )}
    </div>
  );
}

/** A followed player's HUD: the one weapon in their hands, count unknown. */
function FollowedWeaponHUD({ weaponShape }: { weaponShape: string }) {
  const index = WEAPON_SHAPE_HUD_INDEX[weaponShape];
  const info = index != null ? WEAPON_HUD_SLOTS[index] : undefined;
  if (index == null || !info) return null;
  return (
    <div className={styles.WeaponHUD}>
      <div className={styles.PackInvItem} data-active="true">
        <img
          src={WEAPON_HUD_ICON_URLS.get(index)!}
          alt={info.label}
          className={styles.PackInvIcon}
        />
        <span className={styles.PackInvCount} data-unknown="true">
          {UNKNOWN_COUNT}
        </span>
      </div>
    </div>
  );
}

function WeaponHUD({ followed }: { followed: FollowedPlayer | null }) {
  const weaponsHud = useStreamSnapshot((snap) => snap?.weaponsHud);
  if (followed) return <FollowedWeaponHUD weaponShape={followed.weaponShape} />;
  if (!weaponsHud || !weaponsHud.slots.length) return null;
  const weapons: WeaponsHudSlot[] = [];
  const targeting: WeaponsHudSlot[] = [];
  for (const slot of weaponsHud.slots) {
    if (TARGETING_LASER_INDICES.has(slot.index)) {
      targeting.push(slot);
    } else {
      weapons.push(slot);
    }
  }
  return (
    <div className={styles.WeaponHUD}>
      {weapons.map((slot) => (
        <WeaponSlotIcon
          key={slot.index}
          slot={slot}
          isSelected={slot.index === weaponsHud.activeIndex}
        />
      ))}
      {targeting.length > 0 && <div className={styles.WeaponSeparator} />}
      {targeting.map((slot) => (
        <WeaponSlotIcon
          key={slot.index}
          slot={slot}
          isSelected={slot.index === weaponsHud.activeIndex}
        />
      ))}
    </div>
  );
}

function TeamScores() {
  const teamScores = useStreamSnapshot((snap) => snap?.teamScores);
  const playerSensorGroup = useStreamSnapshot(
    (snap) => snap?.playerSensorGroup,
  );
  const observerCount = useStreamSnapshot(
    (snap) => snap?.playerRoster?.filter((p) => p.teamId <= 0).length ?? 0,
  );
  if (!teamScores?.length) return null;
  // Sort: friendly team first (if known), then by teamId.
  const sorted = [...teamScores].sort((a, b) => {
    if (playerSensorGroup) {
      if (a.teamId === playerSensorGroup) return -1;
      if (b.teamId === playerSensorGroup) return 1;
    }
    return a.teamId - b.teamId;
  });
  // Flag state column only applies to flag game modes (CTF).
  const hasFlags = sorted.some((team) => team.flagStatus != null);
  return (
    <table className={styles.TeamScores}>
      <tbody>
        {observerCount > 0 && (
          <tr>
            <td className={styles.ObserverCount} colSpan={hasFlags ? 4 : 3}>
              {observerCount} {observerCount === 1 ? "observer" : "observers"}
            </td>
          </tr>
        )}
        {sorted.map((team: TeamScore) => {
          const isFriendly =
            playerSensorGroup != null &&
            playerSensorGroup > 0 &&
            team.teamId === playerSensorGroup;
          const name =
            team.name ||
            (DEFAULT_TEAM_NAMES[team.teamId] ?? `Team ${team.teamId}`);
          return (
            <tr key={team.teamId} className={styles.TeamRow}>
              <td
                className={
                  isFriendly ? styles.TeamNameFriendly : styles.TeamNameEnemy
                }
              >
                {name}
              </td>
              <td className={styles.TeamCount}>
                ({team.playerCount.toLocaleString()})
              </td>
              <td className={styles.TeamScore}>
                {team.score.toLocaleString()}
              </td>
              {hasFlags && (
                <td className={styles.TeamFlag} data-status={team.flagStatus}>
                  {team.flagStatus === "held" ? (
                    <>
                      <FaHand size={10} />
                      {team.flagCarrier ?? "Held"}
                    </>
                  ) : team.flagStatus === "field" ? (
                    <>
                      <ImArrowDownRight size={9} />
                      Dropped
                    </>
                  ) : (
                    <>
                      <ImHome size={10} />
                      Home
                    </>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Backpack + Inventory HUD (bottom-right) ──
/** Maps $BackpackHudData indices to icon textures. */
const BACKPACK_ICONS: Record<number, string> = {
  0: "gui/hud_new_packammo",
  1: "gui/hud_new_packcloak",
  2: "gui/hud_new_packenergy",
  3: "gui/hud_new_packrepair",
  4: "gui/hud_new_packsatchel",
  5: "gui/hud_new_packshield",
  6: "gui/hud_new_packinventory",
  7: "gui/hud_new_packmotionsens",
  8: "gui/hud_new_packradar",
  9: "gui/hud_new_packturretout",
  10: "gui/hud_new_packturretin",
  11: "gui/hud_new_packsensjam",
  12: "gui/hud_new_packturret",
  13: "gui/hud_new_packturret",
  14: "gui/hud_new_packturret",
  15: "gui/hud_new_packturret",
  16: "gui/hud_new_packturret",
  17: "gui/hud_new_packturret",
  18: "gui/hud_satchel_unarmed",
  19: "gui/hud_new_packenergy",
};
/** Mounted pack shape (imageSlots[$BackpackSlot=2]) → $BackpackHudData index. */
const PACK_SHAPE_HUD_INDEX: Record<string, number> = {
  pack_upgrade_ammo: 0,
  pack_upgrade_cloaking: 1,
  pack_upgrade_energy: 2,
  pack_upgrade_repair: 3,
  pack_upgrade_satchel: 4,
  pack_upgrade_shield: 5,
  pack_deploy_inventory: 6,
  pack_deploy_sensor_motion: 7,
  pack_deploy_sensor_pulse: 8,
  pack_deploy_turreto: 9,
  pack_deploy_turreti: 10,
  pack_upgrade_sensorjammer: 11,
  pack_barrel_aa: 12,
  pack_barrel_missile: 14,
  pack_barrel_fusion: 15,
  pack_barrel_elf: 16,
  pack_barrel_mortar: 17,
};
const BACKPACK_SLOT = 2;

/** Normalized weapon shape name → $WeaponsHudData index (hud.cs). */
const WEAPON_SHAPE_HUD_INDEX: Record<string, number> = {
  weapon_energy: 0,
  weapon_plasma: 1,
  weapon_chaingun: 2,
  weapon_disc: 3,
  weapon_grenade_launcher: 4,
  weapon_sniper: 5,
  weapon_elf: 6,
  weapon_mortar: 7,
  weapon_missile: 8,
  weapon_targeting: 9,
  weapon_shocklance: 10,
};

/** What the ghost tells us about a player who is not the recorder. */
interface FollowedPlayer {
  /** From the DamageMask damage level; undefined until the first update. */
  health: number | undefined;
  /** Every Player ghost carries its energy (5 bits); undefined until then. */
  energy: number | undefined;
  /** Normalized shape of the mounted weapon (imageSlots[0]), "" if none. */
  weaponShape: string;
  /** $BackpackHudData index of the mounted pack, or -1. */
  packIndex: number;
  /** The pack image's trigger is down: the ghost's own activation state,
   *  the same transition that fires the pack's onActivate script. */
  packActive: boolean;
}

function followedPlayerEquals(
  a: FollowedPlayer | null,
  b: FollowedPlayer | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.health === b.health &&
    a.energy === b.energy &&
    a.weaponShape === b.weaponShape &&
    a.packIndex === b.packIndex &&
    a.packActive === b.packActive
  );
}

/**
 * The player HUD's subject while following someone other than the
 * recorder. The stream's HUD commands (ammo, inventory, pack text) are
 * the recorder's own and never sent for anyone else; a followed player's
 * health, energy, held weapon and pack (with its activation) are read
 * off their ghost instead, and everything else is shown as unknown.
 */
function useFollowedPlayer(): FollowedPlayer | null {
  const followEntityId = useStore(streamPlaybackStore, (s) => s.followEntityId);
  return useStreamSnapshot((snap) => {
    if (
      !snap ||
      !followEntityId ||
      followEntityId === snap.controlPlayerGhostId
    )
      return null;
    const entity = snap.entities.find((e) => e.id === followEntityId);
    if (!entity) return null;
    const packSlot = entity.imageSlots?.[BACKPACK_SLOT];
    const pack = packSlot?.shapeName;
    return {
      health: entity.health,
      energy: entity.energy,
      weaponShape: normalizeWeaponName(entity.imageSlots?.[0]?.shapeName),
      packIndex: pack
        ? (PACK_SHAPE_HUD_INDEX[pack.toLowerCase().replace(/\.dts$/, "")] ?? -1)
        : -1,
      packActive: !!packSlot?.imageState?.triggerDown,
    };
  }, followedPlayerEquals);
}

/** Count text for a value the stream never carries for this player. */
const UNKNOWN_COUNT = "\u2014";

// Precompute URLs.
const BACKPACK_ICON_URLS = new Map(
  Object.entries(BACKPACK_ICONS).map(([idx, tex]) => [
    Number(idx),
    textureToUrl(tex),
  ]),
);
/** Simple icons per inventory display slot (no baked-in background). */
const INVENTORY_SLOT_ICONS: Record<number, { icon: string; label: string }> = {
  0: { icon: "gui/hud_handgren", label: "Grenade" },
  1: { icon: "gui/hud_mine", label: "Mine" },
  2: { icon: "gui/hud_beacon", label: "Beacon" },
  3: { icon: "gui/hud_medpack", label: "Repair Kit" },
};
const INVENTORY_ICON_URLS = new Map(
  Object.entries(INVENTORY_SLOT_ICONS).map(([slot, info]) => [
    Number(slot),
    textureToUrl(info.icon),
  ]),
);
function PackAndInventoryHUD({
  followed,
}: {
  followed: FollowedPlayer | null;
}) {
  const recorderBackpackHud = useStreamSnapshot((snap) => snap?.backpackHud);
  const backpackHud = followed
    ? { packIndex: followed.packIndex, active: followed.packActive, text: "" }
    : recorderBackpackHud;
  const inventoryHud = useStreamSnapshot((snap) => snap?.inventoryHud);
  const hasPack = backpackHud && backpackHud.packIndex >= 0;
  // An active pack is shown by highlighting its box (see the stylesheet)
  // rather than the stock client's *_armed bitmaps.
  const packIconUrl = hasPack
    ? BACKPACK_ICON_URLS.get(backpackHud.packIndex)
    : undefined;
  // Build count lookup from snapshot data.
  const countBySlot = new Map<number, number>();
  if (inventoryHud) {
    for (const s of inventoryHud.slots) {
      countBySlot.set(s.slot, s.count);
    }
  }
  // Always show all inventory slot types, defaulting to 0.
  const allSlotIds = Object.keys(INVENTORY_SLOT_ICONS)
    .map(Number)
    .sort((a, b) => a - b);
  if (!followed && !hasPack && !countBySlot.size) return null;
  return (
    <div className={styles.PackInventoryHUD}>
      {packIconUrl && (
        <div
          className={styles.PackInvItem}
          data-active={backpackHud!.active ?? false}
        >
          <img src={packIconUrl} alt="" className={styles.PackInvIcon} />
          <span className={styles.PackInvCount}>
            {backpackHud!.text || "\u00A0"}
          </span>
        </div>
      )}
      {allSlotIds.map((slotId) => {
        const info = INVENTORY_SLOT_ICONS[slotId];
        const iconUrl = INVENTORY_ICON_URLS.get(slotId);
        if (!info || !iconUrl) return null;
        return (
          <div
            key={slotId}
            className={styles.PackInvItem}
            data-unknown={!!followed}
          >
            <img
              src={iconUrl}
              alt={info.label}
              className={styles.PackInvIcon}
            />
            <span className={styles.PackInvCount} data-unknown={!!followed}>
              {followed ? UNKNOWN_COUNT : (countBySlot.get(slotId) ?? 0)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function PlayerHUD() {
  const hasControlPlayer = useStreamSnapshot(
    (snap) => !!snap?.controlPlayerGhostId,
  );
  const cameraMode = useStore(streamPlaybackStore, (s) => s.cameraMode);
  const followEntityId = useStore(streamPlaybackStore, (s) => s.followEntityId);

  // Following (orbit or first-person) puts the followed player on the HUD
  // whatever the recorder was — an observer recording has no control
  // player of its own. Otherwise the HUD is the recorder's, hidden in
  // free-fly where the camera is disconnected from them.
  const following =
    cameraMode === "orbitOverride" || cameraMode === "firstPersonOverride";
  const showPlayerElements = following
    ? !!followEntityId
    : hasControlPlayer && cameraMode !== "freeFly";
  const followed = useFollowedPlayer();
  const { showChat, showReticle, showCompass } = useSettings();
  const commandCircuitActive = useCommandCircuit((s) => s.active);

  return (
    <div className={styles.PlayerHUD}>
      {showChat && <ChatWindow />}
      {showPlayerElements && (
        <div className={styles.Bars}>
          <HealthBar followed={followed} />
          <EnergyBar followed={followed} />
          <HeatBar followed={followed} />
        </div>
      )}
      {showCompass && <Compass commandCircuitActive={commandCircuitActive} />}
      {showPlayerElements && (
        <>
          <WeaponHUD followed={followed} />
          <PackAndInventoryHUD followed={followed} />
          {showReticle && !commandCircuitActive && <Reticle />}
        </>
      )}
      <TeamScores />
    </div>
  );
}
