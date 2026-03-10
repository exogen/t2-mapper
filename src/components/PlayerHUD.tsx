import { useRef, useEffect, useState, useCallback } from "react";
import { useRecording } from "./RecordingProvider";
import { useEngineSelector } from "../state";
import { textureToUrl } from "../loaders";
import { liveConnectionStore } from "../state/liveConnectionStore";
import type {
  ChatSegment,
  ChatMessage,
  StreamEntity,
  TeamScore,
  WeaponsHudSlot,
} from "../stream/types";
import styles from "./PlayerHUD.module.css";
// ── Compass ──
const COMPASS_URL = textureToUrl("gui/hud_new_compass");
const NSEW_URL = textureToUrl("gui/hud_new_NSEW");
function Compass({ yaw }: { yaw: number | undefined }) {
  if (yaw == null) return null;
  // The ring notch is the fixed heading indicator (always "forward" at top).
  // The NSEW letters rotate to show world cardinal directions relative to
  // the player's heading. Positive Torque yaw = turning right (clockwise
  // from above), so N moves counter-clockwise on the display.
  const deg = (yaw * 180) / Math.PI;
  return (
    <div className={styles.Compass}>
      <img src={COMPASS_URL} alt="" className={styles.CompassRing} />
      <img
        src={NSEW_URL}
        alt=""
        className={styles.CompassNSEW}
        style={{ transform: `rotate(${-deg}deg)` }}
      />
    </div>
  );
}
// ── Health / Energy bars ──
function HealthBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className={styles.BarTrack}>
      <div className={styles.BarFillHealth} style={{ width: `${pct}%` }} />
    </div>
  );
}
function EnergyBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className={styles.BarTrack}>
      <div className={styles.BarFillEnergy} style={{ width: `${pct}%` }} />
    </div>
  );
}
// ── Reticle ──
const RETICLE_TEXTURES: Record<string, string> = {
  weapon_sniper: "gui/hud_ret_sniper",
  weapon_shocklance: "gui/hud_ret_shocklance",
  weapon_targeting: "gui/hud_ret_targlaser",
};
function normalizeWeaponName(shape: string | undefined): string {
  if (!shape) return "";
  return shape.replace(/\.dts$/i, "").toLowerCase();
}
function Reticle() {
  const weaponShape = useEngineSelector((state) => {
    const snap = state.playback.streamSnapshot;
    if (!snap || snap.camera?.mode !== "first-person") return undefined;
    const ctrl = snap.controlPlayerGhostId;
    if (!ctrl) return undefined;
    return snap.entities.find((e: StreamEntity) => e.id === ctrl)
      ?.weaponShape;
  });
  if (weaponShape === undefined) return null;
  const weapon = normalizeWeaponName(weaponShape);
  const textureName = RETICLE_TEXTURES[weapon];
  if (textureName) {
    return (
      <div className={styles.Reticle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
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
// ── Weapon HUD (right side weapon list) ──
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
    <div
      className={`${styles.PackInvItem} ${isSelected ? styles.PackInvItemActive : styles.PackInvItemDim}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={WEAPON_HUD_ICON_URLS.get(slot.index)!}
        alt={info.label}
        className={styles.PackInvIcon}
      />
      {isInfinite ? (
        // eslint-disable-next-line @next/next/no-img-element
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
  const weaponsHud = useEngineSelector(
    (state) => state.playback.streamSnapshot?.weaponsHud,
  );
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
// ── Team Scores (bottom-left) ──
/** Default team names from serverDefaults.cs. */
const DEFAULT_TEAM_NAMES: Record<number, string> = {
  1: "Storm",
  2: "Inferno",
  3: "Starwolf",
  4: "Diamond Sword",
  5: "Blood Eagle",
  6: "Phoenix",
};
function TeamScores() {
  const teamScores = useEngineSelector(
    (state) => state.playback.streamSnapshot?.teamScores,
  );
  const playerSensorGroup = useEngineSelector(
    (state) => state.playback.streamSnapshot?.playerSensorGroup,
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
  return (
    <div className={styles.TeamScores}>
      {sorted.map((team: TeamScore) => {
        const isFriendly =
          playerSensorGroup > 0 && team.teamId === playerSensorGroup;
        const name =
          team.name ||
          (DEFAULT_TEAM_NAMES[team.teamId] ?? `Team ${team.teamId}`);
        return (
          <div key={team.teamId} className={styles.TeamRow}>
            <span
              className={
                isFriendly ? styles.TeamNameFriendly : styles.TeamNameEnemy
              }
            >
              {name}
            </span>
            <span className={styles.TeamScore}>{team.score}</span>
            <span className={styles.TeamCount}>({team.playerCount})</span>
          </div>
        );
      })}
    </div>
  );
}
// ── Chat Window (top-left) ──
/** Map a colorCode to a CSS module class name (c0–c9 GuiChatHudProfile). */
const CHAT_COLOR_CLASSES: Record<number, string> = {
  0: styles.ChatColor0,
  1: styles.ChatColor1,
  2: styles.ChatColor2,
  3: styles.ChatColor3,
  4: styles.ChatColor4,
  5: styles.ChatColor5,
  6: styles.ChatColor6,
  7: styles.ChatColor7,
  8: styles.ChatColor8,
  9: styles.ChatColor9,
};
function segmentColorClass(colorCode: number): string {
  return CHAT_COLOR_CLASSES[colorCode] ?? CHAT_COLOR_CLASSES[0];
}
function chatColorClass(msg: ChatMessage): string {
  if (msg.colorCode != null && CHAT_COLOR_CLASSES[msg.colorCode]) {
    return CHAT_COLOR_CLASSES[msg.colorCode];
  }
  // Fallback: default to \c0 (teal). Messages with detected codes (like \c2
  // for flag events) will match above; \c0 kill messages may lose their null
  // byte color code, so the correct default for server messages is c0.
  return CHAT_COLOR_CLASSES[0];
}
function ChatWindow({ isLive }: { isLive: boolean }) {
  const messages = useEngineSelector(
    (state) => state.playback.streamSnapshot?.chatMessages,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const [chatText, setChatText] = useState("");

  // Auto-scroll to bottom when new messages arrive.
  const msgCount = messages?.length ?? 0;
  useEffect(() => {
    if (msgCount > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevCountRef.current = msgCount;
  }, [msgCount]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = chatText.trim();
      if (!text) return;
      liveConnectionStore.getState().sendCommand("messageSent", text);
      setChatText("");
    },
    [chatText],
  );

  const hasMessages = !!messages?.length;

  return (
    <div className={styles.ChatContainer}>
      {hasMessages && (
        <div ref={scrollRef} className={styles.ChatWindow}>
          {messages!.map((msg: ChatMessage, i: number) => (
            <div key={msg.id} className={styles.ChatMessage}>
              {msg.segments ? (
                msg.segments.map((seg: ChatSegment, j: number) => (
                  <span key={j} className={segmentColorClass(seg.colorCode)}>
                    {seg.text}
                  </span>
                ))
              ) : (
                <span className={chatColorClass(msg)}>
                  {msg.sender ? `${msg.sender}: ` : ""}
                  {msg.text}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {isLive && (
        <form className={styles.ChatInputForm} onSubmit={handleSubmit}>
          <input
            className={styles.ChatInput}
            type="text"
            placeholder="Say something…"
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
            maxLength={255}
          />
        </form>
      )}
    </div>
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
  const backpackHud = useEngineSelector(
    (state) => state.playback.streamSnapshot?.backpackHud,
  );
  const inventoryHud = useEngineSelector(
    (state) => state.playback.streamSnapshot?.inventoryHud,
  );
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
          className={`${styles.PackInvItem} ${backpackHud!.active ? styles.PackInvItemActive : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
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
// ── Main HUD ──
export function PlayerHUD({ isLive = false }: { isLive?: boolean } = {}) {
  const recording = useRecording();
  const streamSnapshot = useEngineSelector(
    (state) => state.playback.streamSnapshot,
  );
  if (!recording && !isLive) return null;
  const status = streamSnapshot?.status;
  return (
    <div className={styles.PlayerHUD}>
      <ChatWindow isLive={isLive} />
      {status && (
        <>
          <div className={styles.TopRight}>
            <div className={styles.Bars}>
              <HealthBar value={status.health} />
              <EnergyBar value={status.energy} />
            </div>
            <Compass yaw={streamSnapshot?.camera?.yaw} />
          </div>
          <WeaponHUD />
          <PackAndInventoryHUD />
          <TeamScores />
          <Reticle />
        </>
      )}
    </div>
  );
}
