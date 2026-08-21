import {
  Activity,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Combobox,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxItem,
  ComboboxList,
  ComboboxPopover,
  ComboboxProvider,
  useComboboxStore,
  useStoreState,
} from "@ariakit/react";
import { useQuery } from "@tanstack/react-query";
import { matchSorter } from "match-sorter";
import { IoMdCloseCircle } from "react-icons/io";
import { LuUsers } from "react-icons/lu";
import {
  DEMOS_BASE_URL,
  demoDownloadUrl,
  fetchDemoIndex,
  type DemoIndexEntry,
} from "../stream/demoIndex";
import { loadDemoUrl } from "../stream/demoFileLoader";
import { normalizeMissionType } from "../mission";
import styles from "./MissionSelect.module.css";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

/**
 * Coarse length like "56m" or "1h 15m" — deliberately not clock-shaped,
 * so it can't be confused with the recording's time of day.
 */
function formatDuration(durationMs: number): string {
  const totalMin = Math.round(durationMs / 60_000);
  if (totalMin < 1) return "<1m";
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hours === 0) return `${min}m`;
  return min === 0 ? `${hours}h` : `${hours}h ${min}m`;
}

function formatRecordedTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function recordedDayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function demoTitle(demo: DemoIndexEntry): string {
  return demo.games.map((game) => game.mission).join(" → ") || "Warmup only";
}

function DemoItemContent({ demo }: { demo: DemoIndexEntry }) {
  const gameTypes = [
    ...new Set(
      demo.games
        .map((game) => normalizeMissionType(game.gameType))
        .filter(Boolean),
    ),
  ];
  return (
    <>
      <span className={styles.ItemHeader}>
        <span className={styles.ItemName}>{demoTitle(demo)}</span>
        {gameTypes.length > 0 && (
          <span className={styles.ItemTypes}>
            {gameTypes.map((type) => (
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
      <span className={styles.ItemMissionName}>
        {demo.server} · {formatRecordedTime(demo.recordedAt)} ·{" "}
        {formatDuration(demo.durationMs)} ·{" "}
        <LuUsers className={styles.ItemPlayersIcon} aria-label="Players" />{" "}
        {demo.players.length}
      </span>
    </>
  );
}

/**
 * Newest first, grouped by calendar day (Map preserves the sorted
 * first-appearance insertion order, so days run newest to oldest).
 */
function groupDemos(
  demos: DemoIndexEntry[],
): Array<[string, DemoIndexEntry[]]> {
  const sorted = [...demos].sort(
    (a, b) =>
      b.recordedAt.localeCompare(a.recordedAt) ||
      a.filename.localeCompare(b.filename),
  );
  const byDay = new Map<string, DemoIndexEntry[]>();
  for (const demo of sorted) {
    const day = recordedDayLabel(demo.recordedAt);
    const group = byDay.get(day) ?? [];
    group.push(demo);
    byDay.set(day, group);
  }
  return [...byDay.entries()];
}

/**
 * Demo-mode counterpart of MissionSelect: browse the published demo
 * index and stream a selection straight into the demo player, exactly
 * as if the .rec had been uploaded.
 */
export function DemoSelect() {
  const [latestSearchValue, setSearchValue] = useState("");
  const searchValue = useDeferredValue(latestSearchValue);
  const [selectedFilename, setSelectedFilename] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const enabled = DEMOS_BASE_URL !== "";
  const {
    data: demos,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["demoIndex"],
    queryFn: fetchDemoIndex,
    enabled,
    staleTime: 60_000,
  });

  const combobox = useComboboxStore({
    resetValueOnHide: true,
    selectedValue: selectedFilename,
    setSelectedValue: (newValue) => {
      if (newValue) {
        setSelectedFilename(newValue);
        void loadDemoUrl(demoDownloadUrl(newValue));
        inputRef.current?.blur();
      }
    },
    setValue: (value) => {
      setSearchValue(value);
    },
  });

  const isOpen = useStoreState(combobox, "open");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyK" && (e.metaKey || e.ctrlKey)) {
        e.stopPropagation();
        e.preventDefault();
        inputRef.current?.focus();
        combobox.show();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [combobox]);

  const demosByFilename = useMemo(
    () => new Map((demos ?? []).map((demo) => [demo.filename, demo])),
    [demos],
  );
  const selectedDemo = demosByFilename.get(selectedFilename);

  // When searching, return a flat list sorted by relevance; otherwise
  // return newest-first grouped by server.
  const filteredResults = useMemo(() => {
    const all = demos ?? [];
    if (!searchValue) {
      return { type: "grouped" as const, groups: groupDemos(all) };
    }
    const matches = matchSorter(all, searchValue, {
      keys: [
        (demo) => demo.games.map((game) => game.mission),
        // Both forms so "CTF" and "capture the flag" each match.
        (demo) => demo.games.map((game) => game.gameType),
        (demo) => demo.games.map((game) => normalizeMissionType(game.gameType)),
        "server",
        "players",
        "recorder",
        "filename",
      ],
    });
    return { type: "flat" as const, demos: matches };
  }, [demos, searchValue]);

  const emptyMessage = !enabled
    ? "Demo index not configured (DEMOS_BASE_URL)"
    : isPending
      ? "Loading demos…"
      : isError
        ? "Couldn't load the demo list"
        : demos?.length === 0
          ? "No demos indexed yet"
          : null;

  const noResults =
    emptyMessage == null &&
    (filteredResults.type === "flat"
      ? filteredResults.demos.length === 0
      : filteredResults.groups.length === 0);

  const renderItem = (demo: DemoIndexEntry) => (
    <ComboboxItem
      key={demo.filename}
      value={demo.filename}
      className={styles.Item}
      focusOnHover
    >
      <DemoItemContent demo={demo} />
    </ComboboxItem>
  );

  return (
    <ComboboxProvider store={combobox}>
      <Activity mode={isOpen ? "visible" : "hidden"}>
        <div className={styles.Backdrop} />
      </Activity>
      <div
        className={styles.InputWrapper}
        onKeyDown={(event) => {
          if (!event.metaKey) {
            event.stopPropagation();
          }
        }}
      >
        <Combobox
          ref={inputRef}
          autoSelect
          placeholder={selectedDemo ? undefined : "Choose a demo…"}
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
        {selectedDemo && (
          <div className={styles.SelectedValue}>
            <span className={styles.SelectedName}>
              {demoTitle(selectedDemo)}
            </span>
          </div>
        )}
        <kbd className={styles.Shortcut}>{isMac ? "⌘K" : "^K"}</kbd>
      </div>
      <button
        type="button"
        className={styles.CloseButton}
        data-open={isOpen}
        onClick={() => {
          combobox.hide();
        }}
      >
        <IoMdCloseCircle />
      </button>
      <ComboboxPopover
        gutter={4}
        fitViewport
        sameWidth
        fixed
        autoFocusOnHide={false}
        className={styles.Popover}
        wrapperProps={{
          className: styles.PopoverWrapper,
        }}
        onKeyDown={(event) => {
          if (!event.metaKey) {
            event.stopPropagation();
          }
        }}
      >
        <ComboboxList className={styles.List}>
          {emptyMessage != null ? (
            <div className={styles.NoResults}>{emptyMessage}</div>
          ) : filteredResults.type === "flat" ? (
            filteredResults.demos.map(renderItem)
          ) : (
            filteredResults.groups.map(([day, dayDemos]) => (
              <ComboboxGroup key={day} className={styles.Group}>
                <ComboboxGroupLabel className={styles.GroupLabel}>
                  {day}
                </ComboboxGroupLabel>
                {dayDemos.map(renderItem)}
              </ComboboxGroup>
            ))
          )}
          {noResults && <div className={styles.NoResults}>No demos found</div>}
        </ComboboxList>
      </ComboboxPopover>
    </ComboboxProvider>
  );
}
