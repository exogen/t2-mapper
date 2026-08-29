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
import { matchSorter } from "match-sorter";
import { FaMicrophoneAlt } from "react-icons/fa";
import { IoMdCloseCircle } from "react-icons/io";
import { LuUsers } from "react-icons/lu";
import { TbLaurelWreathFilled } from "react-icons/tb";
import {
  DEMOS_BASE_URL,
  demoDownloadUrl,
  type DemoIndexEntry,
} from "../stream/demoIndex";
import { loadDemoUrl } from "../stream/demoFileLoader";
import { useDemoLoad } from "../state/demoLoadStore";
import { useDemoIndex } from "./useDemoIndex";
import { registerDemoSelectFocus } from "./demoSelectFocus";
import { useDemoQueryState } from "./useQueryParams";
import { useRecording } from "./usePlayback";
import { normalizeMissionType } from "../mission";
import {
  demoTitle,
  formatDuration,
  formatRecordedTime,
  missionDisplayName,
  recordedDayLabel,
} from "./demoFormat";
import styles from "./MissionSelect.module.css";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

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
        {demo.games.some((game) => game.tournament) && (
          <TbLaurelWreathFilled
            className={styles.ItemTournamentIcon}
            title="Tournament mode"
            aria-label="Tournament mode"
          />
        )}
        {demo.hasCommentary && (
          <FaMicrophoneAlt
            className={styles.ItemCommentaryIcon}
            title="Commentary track"
            aria-label="Commentary track"
          />
        )}
      </span>
      <span className={styles.ItemMissionName}>
        {demo.server} · {formatRecordedTime(demo.recordedAt)} ·{" "}
        <span title={demo.players.join(", ") || undefined}>
          <LuUsers className={styles.ItemPlayersIcon} aria-label="Players" />{" "}
          {demo.players.length}
        </span>{" "}
        · {formatDuration(demo.durationMs)}
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
  const [tournamentOnly, setTournamentOnly] = useState(false);
  const [commentaryOnly, setCommentaryOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const enabled = DEMOS_BASE_URL !== "";

  // The `?demo=<filename>` param is the single trigger for loading a
  // published demo: the dropdown selection writes it and a shared link
  // arrives with it already set. This effect loads whatever it names.
  const [demoParam, setDemoParam] = useDemoQueryState();
  const loadedDemoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !demoParam || loadedDemoRef.current === demoParam) return;
    loadedDemoRef.current = demoParam;
    setSelectedFilename(demoParam);
    void loadDemoUrl(demoDownloadUrl(demoParam));
  }, [demoParam, enabled]);

  // Keep the selection and the ?demo link tied to the loaded indexed
  // demo. Drop both when the demo is ejected (demo→none) or replaced by a
  // local upload — a local file has no source URL and can't be linked to,
  // so a lingering ?demo would misdescribe what's playing.
  const recording = useRecording();
  const sourceUrl = useDemoLoad((s) => s.sourceUrl);
  const hadDemoRef = useRef(false);
  useEffect(() => {
    const hasDemo = recording?.source === "demo";
    const localUpload = hasDemo && sourceUrl === null;
    if ((hadDemoRef.current && !hasDemo) || localUpload) {
      setSelectedFilename("");
      loadedDemoRef.current = null;
      void setDemoParam(null);
    }
    hadDemoRef.current = hasDemo;
  }, [recording, sourceUrl, setDemoParam]);
  const { data: demos, isPending, isError } = useDemoIndex();

  const combobox = useComboboxStore({
    resetValueOnHide: true,
    selectedValue: selectedFilename,
    setSelectedValue: (newValue) => {
      if (newValue) {
        // Route through the URL param; the effect above does the load,
        // so dropdown picks and shared links share one code path.
        void setDemoParam(newValue);
        inputRef.current?.blur();
      }
    },
    setValue: (value) => {
      setSearchValue(value);
    },
  });

  const isOpen = useStoreState(combobox, "open");

  // The demo landing page's search button focuses this input (focusing
  // also opens the popover via the input's onFocus).
  useEffect(() => {
    registerDemoSelectFocus(() => inputRef.current?.focus());
    return () => registerDemoSelectFocus(null);
  }, []);

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
    const all = (demos ?? []).filter(
      (demo) =>
        (!tournamentOnly || demo.games.some((game) => game.tournament)) &&
        (!commentaryOnly || demo.hasCommentary === true),
    );
    if (!searchValue) {
      return { type: "grouped" as const, groups: groupDemos(all) };
    }
    const matches = matchSorter(all, searchValue, {
      keys: [
        // Both the internal name and the display name, so "DX_Ice" and
        // "Dangerous Crossing" each match.
        (demo) => demo.games.map((game) => game.mission),
        (demo) => demo.games.map((game) => missionDisplayName(game.mission)),
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
  }, [demos, searchValue, tournamentOnly, commentaryOnly]);

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
      data-tournament={
        demo.games.some((game) => game.tournament) ? "" : undefined
      }
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
        {emptyMessage == null && (
          <div
            className={styles.FilterBar}
            // Keep combobox (virtual) focus so the popover stays open and
            // typing still works after toggling.
            onMouseDown={(event) => event.preventDefault()}
          >
            <label className={styles.Filter}>
              <input
                type="checkbox"
                className={styles.FilterCheckbox}
                checked={tournamentOnly}
                onChange={(event) => setTournamentOnly(event.target.checked)}
              />
              <TbLaurelWreathFilled className={styles.FilterIcon} />
              <span className={styles.FilterLabel}>Tournament mode only</span>
            </label>
            <label className={styles.Filter}>
              <input
                type="checkbox"
                className={styles.FilterCheckbox}
                checked={commentaryOnly}
                onChange={(event) => setCommentaryOnly(event.target.checked)}
              />
              <FaMicrophoneAlt className={styles.FilterMicIcon} />
              <span className={styles.FilterLabel}>Has commentary</span>
            </label>
          </div>
        )}
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
