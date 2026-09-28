export type PlayerBodyType = "male" | "female" | "bioderm";

type DataBlock = Record<string, unknown>;

/** Uses selected armor data, including the two genders sharing heavy_male. */
export function resolvePlayerBodyType(
  player: { shapeName?: string; dataBlock?: string; dataBlockId?: number },
  getDataBlock?: (id: number) => DataBlock | undefined,
): PlayerBodyType {
  const shape = player.shapeName?.toLowerCase() ?? "";
  const name = player.dataBlock?.toLowerCase() ?? "";
  if (shape.includes("bioderm") || name.includes("bioderm")) return "bioderm";
  if (shape.includes("female") || name.includes("female")) return "female";

  // Datablock script names are not transmitted. In stock player.cs,
  // HeavyFemaleHumanArmor inherits HeavyMaleHumanArmor and overrides only
  // waterBreathSound. That is PlayerData.sounds[19] on the wire (confirmed
  // across all nine armor datablocks in a recording). This identifies the
  // selected armor independently of the player's name, skin or voice pack.
  const data =
    player.dataBlockId == null ? undefined : getDataBlock?.(player.dataBlockId);
  const breathId = Array.isArray(data?.sounds) ? data.sounds[19] : undefined;
  const filename =
    typeof breathId === "number"
      ? getDataBlock?.(breathId)?.filename
      : undefined;
  if (typeof filename === "string") {
    const breath = filename
      .replace(/\\/g, "/")
      .toLowerCase()
      .replace(/\.(wav|m4a|ogg)$/, "");
    if (breath.endsWith("/breath_fem_uw")) return "female";
    if (breath.endsWith("/breath_bio_uw")) return "bioderm";
  }
  // Unknown/custom armor without the stock discriminator follows its mesh.
  return "male";
}
