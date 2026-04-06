import { memo, useMemo, useCallback, useState, useDeferredValue } from "react";
import { FaLocationArrow } from "react-icons/fa6";
import { matchSorter } from "match-sorter";
import { useGameEntities } from "../state/gameEntityStore";
import { cameraTourStore } from "../state/cameraTourStore";
import type { GameEntity } from "../state/gameEntityTypes";
import { torqueToThree } from "../scene/coordinates";
import { gameEntityStore, useDebugHidden } from "../state/gameEntityStore";
import { useSettings } from "./SettingsProvider";
import styles from "./DebugEntityList.module.css";
import { FaRegMinusSquare, FaRegPlusSquare } from "react-icons/fa";

function getEntityLabel(entity: GameEntity): string {
  if (entity.renderType === "Player" && "playerName" in entity) {
    return entity.playerName ?? entity.className;
  }
  if (entity.renderType === "WayPoint" && "label" in entity) {
    return entity.label ?? entity.className;
  }
  return entity.className;
}

function getEntityDetail(
  entity: GameEntity,
): Record<string, string> | undefined {
  const fields: Record<string, string> = {};

  if ("shapeName" in entity && entity.shapeName) {
    fields.shape = entity.shapeName;
  }
  if (entity.renderType === "Player" && "skinPrefName" in entity) {
    if (entity.skinPrefName) fields.skin = entity.skinPrefName;
    else if (entity.skinName) fields.skin = entity.skinName;
  }
  if (entity.renderType === "InteriorInstance" && "interiorData" in entity) {
    fields.interior = entity.interiorData.interiorFile;
  }
  if (!fields.shape && "dataBlock" in entity && entity.dataBlock) {
    fields.dataBlock = entity.dataBlock;
  }
  if (entity.renderType === "TerrainBlock" && "terrainData" in entity) {
    fields.terrain = entity.terrainData.terrFileName;
  }
  if (entity.renderType === "WaterBlock" && "waterData" in entity) {
    fields.surface = entity.waterData.surfaceName;
  }
  if ("audioFileName" in entity && entity.audioFileName) {
    fields.audio = entity.audioFileName;
  }

  return Object.keys(fields).length > 0 ? fields : undefined;
}

function getEntityPosition(
  entity: GameEntity,
): [number, number, number] | undefined {
  if ("position" in entity && entity.position) return entity.position;
  // Scene entities store position inside their typed data.
  if (entity.renderType === "InteriorInstance" && "interiorData" in entity) {
    return torqueToThree(entity.interiorData.transform.position);
  }
  if (entity.renderType === "WaterBlock" && "waterData" in entity) {
    const pos = torqueToThree(entity.waterData.transform.position);
    const scale = entity.waterData.scale;
    // Water transform position is the corner; offset to center.
    return [pos[0] + scale.y / 2, pos[1] + scale.z / 2, pos[2] + scale.x / 2];
  }
  if (entity.renderType === "TerrainBlock") {
    return [0, 0, 0];
  }
  return undefined;
}

function EntityRow({ entity }: { entity: GameEntity }) {
  const pos = getEntityPosition(entity);
  const detail = getEntityDetail(entity);
  const label = getEntityLabel(entity);
  const hidden = useDebugHidden(entity.id);
  const { audioEnabled } = useSettings();
  const isAudioEmitter = entity.renderType === "AudioEmitter";
  const disabled = isAudioEmitter && !audioEnabled;
  const canLocate = !!pos && !hidden && !disabled;
  const handleClick = useCallback(() => {
    if (!pos) return;
    cameraTourStore
      .getState()
      .flyTo({ entityId: entity.id, label, position: pos }, "debug");
  }, [entity.id, label, pos]);

  const handleToggle = useCallback(() => {
    const store = gameEntityStore.getState();
    const entities = store.isStreaming
      ? store.streamEntities
      : store.missionEntities;
    const e = entities.get(entity.id);
    if (e) {
      // New object reference so useAllGameEntities' identity check detects the change.
      entities.set(entity.id, { ...e, debugHidden: !e.debugHidden });
      gameEntityStore.setState({ version: store.version + 1 });
    }
  }, [entity.id]);

  return (
    <div className={styles.EntityRow} data-disabled={disabled || undefined}>
      <input
        type="checkbox"
        checked={!hidden}
        onChange={handleToggle}
        disabled={disabled}
        title={hidden ? "Show entity" : "Hide entity"}
      />
      <div className={styles.EntityInfo}>
        <div>
          <span className={styles.Type}>{label}</span>{" "}
          <span className={styles.ID}>{entity.id}</span>
        </div>
        {detail && (
          <dl className={styles.Detail}>
            {Object.entries(detail).map(([key, value]) => (
              <div key={key}>
                <dt>{key}:</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {pos && (
        <button
          type="button"
          className={styles.LocateButton}
          onClick={handleClick}
          disabled={!canLocate}
          title={`Fly to ${label}`}
        >
          <FaLocationArrow />
        </button>
      )}
    </div>
  );
}

const ENTITY_MATCH_KEYS = [
  "id",
  "className",
  "label",
  "playerName",
  "skinPrefName",
  "shapeName",
  "dataBlock",
  "audioFileName",
  "interiorData.interiorFile",
  "terrainData.terrFileName",
  "waterData.surfaceName",
];

export const DebugEntityList = memo(function DebugEntityList() {
  const [filterText, setFilterText] = useState("");
  const activeFilterText = useDeferredValue(filterText.trim());

  const entities = useGameEntities();
  // useGameEntities re-renders on version bump, but the Map reference is
  // stable (mutated in place). Use version as a useMemo dep to recompute.
  const version = gameEntityStore.getState().version;

  const filteredEntities = useMemo(() => {
    const allEntities = Array.from(entities.values());

    return activeFilterText
      ? matchSorter(allEntities, activeFilterText, {
          keys: ENTITY_MATCH_KEYS,
        })
      : allEntities;

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilterText, entities, version]);

  const grouped = useMemo(() => {
    const groups = new Map<string, GameEntity[]>();

    for (const entity of filteredEntities) {
      if (
        entity.renderType === "Sky" ||
        entity.renderType === "Sun" ||
        entity.renderType === "MissionArea" ||
        entity.renderType === "None"
      )
        continue;
      const key = entity.className;
      let list = groups.get(key);
      if (!list) {
        list = [];
        groups.set(key, list);
      }
      list.push(entity);
    }
    // Sort groups by class name, entities within each group by ID.
    const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [, list] of sorted) {
      list.sort((a, b) => a.id.localeCompare(b.id));
    }
    return sorted;
  }, [filteredEntities]);

  return (
    <section
      className={styles.Container}
      data-filtered={activeFilterText ? true : undefined}
    >
      <header className={styles.Header}>
        <h4 className={styles.Title}>Entity list</h4>
        <input
          type="search"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          size={16}
          placeholder="Filter"
          className={styles.FilterInput}
        />
      </header>
      {grouped.map(([className, list]) => (
        <details
          key={className}
          className={styles.Group}
          open={activeFilterText ? true : undefined}
        >
          <summary className={styles.GroupHeader}>
            <FaRegPlusSquare className={styles.ClosedIcon} />
            <FaRegMinusSquare className={styles.OpenedIcon} /> {className}{" "}
            <span className={styles.GroupCount}>({list.length})</span>
          </summary>
          <ul className={styles.List}>
            {list.map((entity) => (
              <li key={entity.id} className={styles.ListItem}>
                <EntityRow entity={entity} />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
});
