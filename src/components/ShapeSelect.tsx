import { startTransition, useEffect, useMemo, useRef, useState } from "react";
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
import { getResourceList, getSourceAndPath } from "../manifest";
import orderBy from "lodash.orderby";
import styles from "./MissionSelect.module.css";

interface ShapeItem {
  /** Manifest resource key (lowercased path like "shapes/beacon.glb"). */
  resourceKey: string;
  /** Display name (e.g. "beacon.dts"). */
  displayName: string;
  /** The .dts shape name to pass to shapeToUrl (e.g. "beacon.dts"). */
  shapeName: string;
  /** Source vl2 archive. */
  sourcePath: string;
  /** Group label for the combobox. */
  groupName: string;
}

const sourceGroupNames: Record<string, string> = {
  "shapes.vl2": "Shapes",
  "TR2final105-client.vl2": "Team Rabbit 2",
};

const allShapes: ShapeItem[] = getResourceList()
  .filter((key) => key.startsWith("shapes/") && key.endsWith(".dts"))
  .map((resourceKey) => {
    const [sourcePath, actualPath] = getSourceAndPath(resourceKey);
    const fileName = actualPath.split("/").pop() ?? actualPath;
    const groupName = sourceGroupNames[sourcePath] ?? (sourcePath || "Loose");
    return {
      resourceKey,
      displayName: fileName,
      shapeName: fileName,
      sourcePath,
      groupName,
    };
  });

const shapesByName = new Map(allShapes.map((s) => [s.shapeName, s]));

function groupShapes(shapes: ShapeItem[]) {
  const groupMap = new Map<string, ShapeItem[]>();

  for (const shape of shapes) {
    const group = groupMap.get(shape.groupName) ?? [];
    group.push(shape);
    groupMap.set(shape.groupName, group);
  }

  groupMap.forEach((groupShapes, groupName) => {
    groupMap.set(
      groupName,
      orderBy(groupShapes, [(s) => s.displayName.toLowerCase()], ["asc"]),
    );
  });

  return orderBy(
    Array.from(groupMap.entries()),
    [
      ([groupName]) => (groupName === "Shapes" ? 0 : 1),
      ([groupName]) => groupName.toLowerCase(),
    ],
    ["asc", "asc"],
  );
}

const defaultGroups = groupShapes(allShapes);

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export function ShapeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (shapeName: string) => void;
}) {
  const [searchValue, setSearchValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const combobox = useComboboxStore({
    placement: "bottom-start",
    resetValueOnHide: true,
    selectedValue: value,
    setSelectedValue: (newValue) => {
      if (newValue) {
        onChange(newValue);
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

  const selectedShape = shapesByName.get(value);

  const filteredResults = useMemo(() => {
    if (!searchValue)
      return { type: "grouped" as const, groups: defaultGroups };
    const matches = matchSorter(allShapes, searchValue, {
      keys: ["displayName", "groupName"],
    });
    return { type: "flat" as const, shapes: matches };
  }, [searchValue]);

  const displayValue = selectedShape?.displayName ?? value;

  const noResults =
    filteredResults.type === "flat"
      ? filteredResults.shapes.length === 0
      : filteredResults.groups.length === 0;

  const renderItem = (shape: ShapeItem) => {
    return (
      <ComboboxItem
        key={shape.shapeName}
        value={shape.shapeName}
        className={styles.Item}
        focusOnHover
      >
        <span className={styles.ItemName}>{shape.displayName}</span>
      </ComboboxItem>
    );
  };

  return (
    <ComboboxProvider store={combobox}>
      <div className={styles.InputWrapper}>
        <Combobox
          ref={inputRef}
          autoSelect
          placeholder={displayValue}
          className={styles.Input}
          onFocus={() => {
            try {
              document.exitPointerLock();
            } catch {
              /* expected */
            }
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
        </div>
        <kbd className={styles.Shortcut}>{isMac ? "⌘K" : "^K"}</kbd>
      </div>
      <ComboboxPopover
        portal
        gutter={4}
        autoFocusOnHide={false}
        className={styles.Popover}
      >
        <ComboboxList className={styles.List}>
          {filteredResults.type === "flat"
            ? filteredResults.shapes.map(renderItem)
            : filteredResults.groups.map(([groupName, shapes]) => (
                <ComboboxGroup key={groupName} className={styles.Group}>
                  <ComboboxGroupLabel className={styles.GroupLabel}>
                    {groupName}
                  </ComboboxGroupLabel>
                  {shapes.map(renderItem)}
                </ComboboxGroup>
              ))}
          {noResults && <div className={styles.NoResults}>No shapes found</div>}
        </ComboboxList>
      </ComboboxPopover>
    </ComboboxProvider>
  );
}
