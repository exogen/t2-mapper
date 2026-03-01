import {
  Fragment,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Combobox,
  ComboboxItem,
  ComboboxList,
  ComboboxPopover,
  ComboboxProvider,
  ComboboxGroup,
  ComboboxGroupLabel,
  useComboboxStore,
} from "@ariakit/react";
import { matchSorter } from "match-sorter";
import { getMissionInfo, getMissionList, getSourceAndPath } from "../manifest";
import orderBy from "lodash.orderby";
import styles from "./MissionSelect.module.css";

const excludeMissions = new Set([
  "SkiFree",
  "SkiFree_Daily",
  "SkiFree_Randomizer",
]);

const sourceGroupNames: Record<string, string> = {
  "missions.vl2": "Official",
  "TR2final105-client.vl2": "Team Rabbit 2",
  "z_mappacks/CTF/Classic_maps_v1.vl2": "Classic",
  "z_mappacks/CTF/DynamixFinalPack.vl2": "Official",
  "z_mappacks/CTF/KryMapPack_b3EDIT.vl2": "KryMapPack",
  "z_mappacks/CTF/S5maps.vl2": "S5",
  "z_mappacks/CTF/S8maps.vl2": "S8",
  "z_mappacks/CTF/TWL-MapPack.vl2": "TWL",
  "z_mappacks/CTF/TWL-MapPackEDIT.vl2": "TWL",
  "z_mappacks/CTF/TWL2-MapPack.vl2": "TWL2",
  "z_mappacks/CTF/TWL2-MapPackEDIT.vl2": "TWL2",
  "z_mappacks/TWL_T2arenaOfficialMaps.vl2": "Arena",
  "z_mappacks/xPack2.vl2": "xPack2",
  "z_mappacks/z_DMP2-V0.6.vl2": "DMP2 (Discord Map Pack)",
  "z_mappacks/zDMP-4.7.3DX.vl2": "DMP (Discord Map Pack)",
  "z_mappacks/zDMP-4.7.3DX-ServerOnly.vl2": "DMP (Discord Map Pack)",
};

const dirGroupNames: Record<string, string> = {
  "z_mappacks/DM": "DM",
  "z_mappacks/LCTF": "LCTF",
  "z_mappacks/Lak": "LakRabbit",
};

interface MissionItem {
  resourcePath: string;
  missionName: string;
  displayName: string;
  sourcePath: string;
  groupName: string | null;
  missionTypes: string[];
}

const getDirName = (sourcePath: string) => {
  const match = sourcePath.match(/^(.*)(\/[^/]+)$/);
  return match ? match[1] : "";
};

const allMissions: MissionItem[] = getMissionList()
  .filter((name) => !excludeMissions.has(name))
  .map((missionName) => {
    const missionInfo = getMissionInfo(missionName);
    const [sourcePath] = getSourceAndPath(missionInfo.resourcePath);
    const sourceDir = getDirName(sourcePath);
    const groupName =
      sourceGroupNames[sourcePath] ?? dirGroupNames[sourceDir] ?? null;
    return {
      resourcePath: missionInfo.resourcePath,
      missionName,
      displayName: missionInfo.displayName,
      sourcePath,
      groupName,
      missionTypes: missionInfo.missionTypes,
    };
  });

const missionsByName = new Map(allMissions.map((m) => [m.missionName, m]));

function groupMissions(missions: MissionItem[]) {
  const groupMap = new Map<string | null, MissionItem[]>();

  for (const mission of missions) {
    const group = groupMap.get(mission.groupName) ?? [];
    group.push(mission);
    groupMap.set(mission.groupName, group);
  }

  groupMap.forEach((groupMissions, groupName) => {
    groupMap.set(
      groupName,
      orderBy(
        groupMissions,
        [(m) => (m.displayName || m.missionName).toLowerCase()],
        ["asc"],
      ),
    );
  });

  return orderBy(
    Array.from(groupMap.entries()),
    [
      ([groupName]) =>
        groupName === "Official" ? 0 : groupName == null ? 2 : 1,
      ([groupName]) => (groupName ? groupName.toLowerCase() : ""),
    ],
    ["asc", "asc"],
  );
}

const defaultGroups = groupMissions(allMissions);

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

function MissionItemContent({ mission }: { mission: MissionItem }) {
  return (
    <>
      <span className={styles.ItemHeader}>
        <span className={styles.ItemName}>
          {mission.displayName || mission.missionName}
        </span>
        {mission.missionTypes.length > 0 && (
          <span className={styles.ItemTypes}>
            {mission.missionTypes.map((type) => (
              <span
                key={type}
                className={styles.ItemType}
                data-mission-type={type}
              >
                {type}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className={styles.ItemMissionName}>{mission.missionName}</span>
    </>
  );
}

export function MissionSelect({
  value,
  missionType,
  onChange,
  disabled,
}: {
  value: string;
  missionType: string;
  onChange: ({
    missionName,
    missionType,
  }: {
    missionName: string;
    missionType: string | undefined;
  }) => void;
  disabled?: boolean;
}) {
  const [searchValue, setSearchValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const missionTypeRef = useRef<string | null>(missionType);

  const combobox = useComboboxStore({
    resetValueOnHide: true,
    selectedValue: value,
    setSelectedValue: (newValue) => {
      if (newValue) {
        let newMissionType = missionTypeRef.current;
        const availableMissionTypes = getMissionInfo(newValue).missionTypes;
        if (
          !newMissionType ||
          !availableMissionTypes.includes(newMissionType)
        ) {
          newMissionType = availableMissionTypes[0];
        }
        onChange({
          missionName: newValue,
          missionType: newMissionType,
        });
        inputRef.current?.blur();
      }
    },
    setValue: (value) => {
      startTransition(() => setSearchValue(value));
    },
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        inputRef.current?.focus();
        combobox.show();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [combobox]);

  const selectedMission = missionsByName.get(value);

  // When searching, return flat list sorted by relevance; otherwise return grouped
  const filteredResults = useMemo(() => {
    if (!searchValue)
      return { type: "grouped" as const, groups: defaultGroups };
    const matches = matchSorter(allMissions, searchValue, {
      keys: ["displayName", "missionName", "missionTypes", "groupName"],
    });
    return { type: "flat" as const, missions: matches };
  }, [searchValue]);

  const displayValue = selectedMission
    ? selectedMission.displayName || selectedMission.missionName
    : value;

  const noResults =
    filteredResults.type === "flat"
      ? filteredResults.missions.length === 0
      : filteredResults.groups.length === 0;

  const renderItem = (mission) => {
    return (
      <ComboboxItem
        key={mission.missionName}
        value={mission.missionName}
        className={styles.Item}
        focusOnHover
        onClick={(event) => {
          if (event.target && event.target instanceof HTMLElement) {
            const missionType = event.target.dataset.missionType;
            if (missionType) {
              missionTypeRef.current = missionType;
              const isOnlyMissionTypeChange = mission.missionName === value;
              if (isOnlyMissionTypeChange) {
                // Need to trigger change ourselves, because Combobox sees this
                // as no change.
                onChange({
                  missionName: mission.missionName,
                  missionType,
                });
              }
            } else {
              missionTypeRef.current = null;
            }
          } else {
            missionTypeRef.current = null;
          }
        }}
      >
        <MissionItemContent mission={mission} />
      </ComboboxItem>
    );
  };

  return (
    <ComboboxProvider store={combobox}>
      <div className={styles.InputWrapper}>
        <Combobox
          ref={inputRef}
          autoSelect
          disabled={disabled}
          placeholder={displayValue}
          className={styles.Input}
          onFocus={() => {
            try {
              document.exitPointerLock();
            } catch {}
            combobox.show();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !combobox.getState().open) {
              inputRef.current?.blur();
            }
          }}
        />
        <div className={styles.SelectedValue}>
          <span className={styles.SelectedName}>{displayValue}</span>
          {missionType && (
            <span className={styles.ItemType} data-mission-type={missionType}>
              {missionType}
            </span>
          )}
        </div>
        <kbd className={styles.Shortcut}>{isMac ? "⌘K" : "^K"}</kbd>
      </div>
      <ComboboxPopover
        gutter={4}
        fitViewport
        autoFocusOnHide={false}
        className={styles.Popover}
      >
        <ComboboxList className={styles.List}>
          {filteredResults.type === "flat"
            ? filteredResults.missions.map(renderItem)
            : filteredResults.groups.map(([groupName, missions]) =>
                groupName ? (
                  <ComboboxGroup key={groupName} className={styles.Group}>
                    <ComboboxGroupLabel className={styles.GroupLabel}>
                      {groupName}
                    </ComboboxGroupLabel>
                    {missions.map(renderItem)}
                  </ComboboxGroup>
                ) : (
                  <Fragment key="ungrouped">
                    {missions.map(renderItem)}
                  </Fragment>
                ),
              )}
          {noResults && (
            <div className={styles.NoResults}>No missions found</div>
          )}
        </ComboboxList>
      </ComboboxPopover>
    </ComboboxProvider>
  );
}
