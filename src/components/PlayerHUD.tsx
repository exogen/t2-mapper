import { useRef } from "react";
import { useStore } from "zustand";
import { FaHand } from "react-icons/fa6";
import { ImArrowDownRight, ImHome } from "react-icons/im";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { textureToUrl } from "../loaders";
import type { StreamEntity, TeamScore, WeaponsHudSlot } from "../stream/types";
import styles from "./PlayerHUD.module.css";
import { ChatWindow } from "./ChatWindow";
import { CompassDial } from "./CompassDial";
import { useCameraHeadingRotor } from "./MapCompass";
import { useSettings } from "./SettingsProvider";
import { useCommandCircuit } from "../state/commandCircuitStore";

function formatClockHud(clockMs: number): string {
  const absSec = Math.abs(clockMs) / 1000;
  const displaySec = clockMs < 0 ? Math.ceil(absSec) : Math.floor(absSec);
  const mins = Math.floor(displaySec / 60);
  const secs = displaySec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function Compass({ commandCircuitActive }: { commandCircuitActive: boolean }) {
  const isWatcher = useLiveSelector((s) => s.role === "watcher");
  const yaw = useStreamSnapshot((snap) => snap?.camera?.yaw);
  const matchClockMs = useStreamSnapshot((snap) => snap?.matchClockMs);
  // Watch mode: the view camera is client-controlled (free-fly/orbit), so
  // the stream camera's yaw is meaningless — track the render camera.
  if (isWatcher) {
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
            {formatClockHud(matchClockMs)}
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
        {formatClockHud(matchClockMs)}
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

function HealthBar() {
  const health = useStreamSnapshot((snap) => snap?.status?.health);
  if (health == null) return null;
  const pct = Math.max(0, Math.min(100, health * 100));
  return (
    <div className={styles.BarTrack}>
      <div className={styles.BarFillHealth} style={{ width: `${pct}%` }} />
    </div>
  );
}

function EnergyBar() {
  const energy = useStreamSnapshot((snap) => snap?.status?.energy);
  if (energy == null) return null;
  const pct = Math.max(0, Math.min(100, energy * 100));
  return (
    <div className={styles.BarTrack}>
      <div className={styles.BarFillEnergy} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Heat a target must have for missiles to lock (missileLauncher.cs
 *  minSeekHeat). Above this, the bar flashes as a warning. */
const MISSILE_LOCK_HEAT = 0.7;

function HeatBar() {
  const heat = useStreamSnapshot((snap) => snap?.status?.heat);
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

function Reticle() {
  const weaponShape = useStreamSnapshot((snap) => {
    if (!snap || snap.camera?.mode !== "first-person") return undefined;
    const ctrl = snap.controlPlayerGhostId;
    if (!ctrl) return undefined;
    return snap.entities.find((e: StreamEntity) => e.id === ctrl)
      ?.imageSlots?.[0]?.shapeName;
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
  return (
    <div className={styles.Reticle}>
      <div className={styles.ReticleDot} />
    </div>
  );
}

/** Maps $WeaponsHudData indices to simple icon textures (no baked background)
 *  and labels. Mortar uses hud_new_ because no simple variant exists. */
const WEAPON_HUD_SLOTS: Record<number, { icon: string; label: string }> = {
  0: { icon: "gui/hud_blaster", label: "Blaster" },
  1: { icon: "gui/hud_plasma", label: "Plasma" },
  2: { icon: "gui/hud_chaingun", label: "Chaingun" },
  3: { icon: "gui/hud_disc", label: "Spinfusor" },
  4: { icon: "gui/hud_grenlaunch", label: "GL" },
  5: { icon: "gui/hud_sniper", label: "Laser Rifle" },
  6: { icon: "gui/hud_elfgun", label: "ELF Gun" },
  7: { icon: "gui/hud_new_mortar", label: "Mortar" },
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
  17: { icon: "gui/hud_new_mortar", label: "Mortar" },
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

function WeaponHUD() {
  const weaponsHud = useStreamSnapshot((snap) => snap?.weaponsHud);
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
                <td className={styles.TeamFlag}>
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
/** Pack indices that have an armed/activated icon variant. */
const BACKPACK_ARMED_ICONS: Record<number, string> = {
  1: "gui/hud_new_packcloak_armed",
  3: "gui/hud_new_packrepair_armed",
  4: "gui/hud_satchel_armed",
  5: "gui/hud_new_packshield_armed",
  11: "gui/hud_new_packsensjam_armed",
};
// Precompute URLs.
const BACKPACK_ICON_URLS = new Map(
  Object.entries(BACKPACK_ICONS).map(([idx, tex]) => [
    Number(idx),
    textureToUrl(tex),
  ]),
);
const BACKPACK_ARMED_ICON_URLS = new Map(
  Object.entries(BACKPACK_ARMED_ICONS).map(([idx, tex]) => [
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
function PackAndInventoryHUD() {
  const backpackHud = useStreamSnapshot((snap) => snap?.backpackHud);
  const inventoryHud = useStreamSnapshot((snap) => snap?.inventoryHud);
  const hasPack = backpackHud && backpackHud.packIndex >= 0;
  // Resolve pack icon.
  let packIconUrl: string | undefined;
  if (hasPack) {
    const armedUrl = backpackHud.active
      ? BACKPACK_ARMED_ICON_URLS.get(backpackHud.packIndex)
      : undefined;
    packIconUrl = armedUrl ?? BACKPACK_ICON_URLS.get(backpackHud.packIndex);
  }
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
  if (!hasPack && !countBySlot.size) return null;
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
          <div key={slotId} className={styles.PackInvItem}>
            <img
              src={iconUrl}
              alt={info.label}
              className={styles.PackInvIcon}
            />
            <span className={styles.PackInvCount}>
              {countBySlot.get(slotId) ?? 0}
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

  // In free-fly mode the camera is disconnected from the player, so
  // player-specific HUD elements (health, energy, weapons, etc.) are hidden.
  const showPlayerElements = hasControlPlayer && cameraMode !== "freeFly";
  const { showChat, showReticle, showCompass } = useSettings();
  const commandCircuitActive = useCommandCircuit((s) => s.active);

  return (
    <div className={styles.PlayerHUD}>
      {showChat && <ChatWindow />}
      {showPlayerElements && (
        <div className={styles.Bars}>
          <HealthBar />
          <EnergyBar />
          <HeatBar />
        </div>
      )}
      {showCompass && <Compass commandCircuitActive={commandCircuitActive} />}
      {showPlayerElements && (
        <>
          <WeaponHUD />
          <PackAndInventoryHUD />
          {showReticle && !commandCircuitActive && <Reticle />}
        </>
      )}
      <TeamScores />
    </div>
  );
}
