import { Checkbox } from "./Checkbox";
import {
  Activity,
  Fragment,
  useDeferredValue,
  useEffect,
  useId,
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
import { FaMicrophoneAlt } from "react-icons/fa";
import { IoMdCloseCircle } from "react-icons/io";
import { IoCalendarNumberOutline } from "react-icons/io5";
import { LuClock, LuUser, LuUsers } from "react-icons/lu";
import { MdVerified } from "react-icons/md";
import { PiGlobe } from "react-icons/pi";
import { TbLaurelWreathFilled } from "react-icons/tb";
import {
  DEMOS_BASE_URL,
  demoPlayerCount,
  isMapGeniusDemo,
  type DemoIndexEntry,
} from "../stream/demoIndex";
import { useDemoIndex } from "./useDemoIndex";
import { useComboboxShortcut } from "./useComboboxShortcut";
import { registerDemoSelectFocus } from "./demoSelectFocus";
import { searchDemos } from "./demoSearch";
import { useDemoQueryState } from "./useQueryParams";
import { useAppNavigation } from "./useAppNavigation";
import {
  demoSummary,
  demoTitle,
  formatDuration,
  formatRecordedTime,
  recordedDayLabel,
} from "./demoFormat";
import styles from "./MissionSelect.module.css";
import demoStyles from "./DemoSelect.module.css";

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

function DemoItemContent({ demo }: { demo: DemoIndexEntry }) {
  const { matchups, matchTitle, gameTypes, tournament } = demoSummary(demo);
  return (
    <>
      <span className={demoStyles.Header}>
        <span className={demoStyles.MapTitle}>{demoTitle(demo)}</span>
        {gameTypes.map((type) => (
          <span key={type} className={demoStyles.Tag} data-mission-type={type}>
            {type}
          </span>
        ))}
        {tournament && (
          <TbLaurelWreathFilled
            className={demoStyles.TournamentIcon}
            title="Tournament mode"
            aria-label="Tournament mode"
          />
        )}
        {demo.hasCommentary && (
          <FaMicrophoneAlt
            className={demoStyles.CommentaryIcon}
            title="Commentary track"
            aria-label="Commentary track"
          />
        )}
      </span>
      {matchTitle && (
        <span className={demoStyles.MatchTitle} title={matchTitle}>
          {matchTitle}
        </span>
      )}
      {matchups.length > 0 && (
        <span className={demoStyles.Teams}>
          {matchups.map((teams, gameIndex) => (
            <Fragment key={gameIndex}>
              {gameIndex > 0 && " → "}
              {teams.map(([id, name], teamIndex) => (
                <Fragment key={id}>
                  {teamIndex > 0 && " vs "}
                  <span className={demoStyles.TeamName}>{name}</span>
                </Fragment>
              ))}
            </Fragment>
          ))}
        </span>
      )}
      <span className={demoStyles.Details}>
        <span className={demoStyles.MetaItem}>
          <IoCalendarNumberOutline
            className={demoStyles.MetaIcon}
            title="Recorded on"
            aria-hidden
          />
          <span className={demoStyles.MetaText}>
            {recordedDayLabel(demo.recordedAt, demo.recordedAtTimezone)}{" "}
            {formatRecordedTime(demo.recordedAt, demo.recordedAtTimezone)}
          </span>
        </span>
        <span className={`${demoStyles.MetaItem} ${demoStyles.Duration}`}>
          <LuClock
            className={`${demoStyles.MetaIcon} ${demoStyles.CompactMetaIcon}`}
            aria-label="Duration"
          />
          {formatDuration(demo.durationMs)}
        </span>
        <span
          className={demoStyles.MetaItem}
          title={demo.players.join(", ") || undefined}
        >
          <LuUsers
            className={`${demoStyles.MetaIcon} ${demoStyles.CompactMetaIcon}`}
            aria-label="Players"
          />
          {demoPlayerCount(demo)}
        </span>
      </span>
      <span className={`${demoStyles.Details} ${demoStyles.Source}`}>
        {demo.recorder ? (
          <span className={demoStyles.MetaItem}>
            {isMapGeniusDemo(demo) ? (
              <MdVerified
                className={demoStyles.MetaIcon}
                title="Recorded by MapGenius"
                aria-hidden
              />
            ) : (
              <LuUser
                className={`${demoStyles.MetaIcon} ${demoStyles.RecorderIcon}`}
                title="Recorded by"
                aria-hidden
              />
            )}
            <span className={demoStyles.MetaText} title={demo.recorder}>
              {demo.recorder}
            </span>
          </span>
        ) : null}
        {demo.server && (
          <span className={demoStyles.MetaItem}>
            <PiGlobe
              className={demoStyles.MetaIcon}
              title="Server"
              aria-hidden
            />
            <span className={demoStyles.MetaText} title={demo.server}>
              {demo.server}
            </span>
          </span>
        )}
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
    const day = recordedDayLabel(demo.recordedAt, demo.recordedAtTimezone);
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
  const [demoParam] = useDemoQueryState();
  const selectedFilename = demoParam ?? "";
  const navigation = useAppNavigation();
  const [tournamentOnly, setTournamentOnly] = useState(false);
  const [commentaryOnly, setCommentaryOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedValueId = useId();

  const enabled = DEMOS_BASE_URL !== "";

  const { data: demos, isPending, isError, refetch } = useDemoIndex();

  const combobox = useComboboxStore({
    resetValueOnHide: true,
    selectedValue: selectedFilename,
    setSelectedValue: (newValue) => {
      if (newValue) {
        navigation.selectDemo(newValue);
        inputRef.current?.blur();
      }
    },
    setValue: (value) => {
      setSearchValue(value);
    },
  });

  const isOpen = useStoreState(combobox, "open");

  // Keep cached demos usable immediately while each opening refreshes the list.
  useEffect(() => {
    if (enabled && isOpen) void refetch();
  }, [enabled, isOpen, refetch]);

  // The demo landing page's search button focuses this input (focusing
  // also opens the popover via the input's onFocus).
  useEffect(() => {
    registerDemoSelectFocus(() => inputRef.current?.focus());
    return () => registerDemoSelectFocus(null);
  }, []);

  useComboboxShortcut(inputRef, combobox);

  const demosByFilename = useMemo(
    () => new Map((demos ?? []).map((demo) => [demo.filename, demo])),
    [demos],
  );
  const selectedDemo = demosByFilename.get(selectedFilename);

  // Search controls inclusion; demos always stay newest-first, grouped by day.
  const filteredGroups = useMemo(() => {
    const all = (demos ?? []).filter(
      (demo) =>
        (!tournamentOnly || demo.games.some((game) => game.tournament)) &&
        (!commentaryOnly || demo.hasCommentary === true),
    );
    return groupDemos(searchDemos(all, searchValue));
  }, [demos, searchValue, tournamentOnly, commentaryOnly]);

  const emptyMessage = !enabled
    ? "Demo index not configured (DEMOS_BASE_URL)"
    : isPending && demos === undefined
      ? "Loading demos…"
      : isError && demos === undefined
        ? "Couldn't load the demo list"
        : demos?.length === 0
          ? "No demos indexed yet"
          : null;

  const noResults = emptyMessage == null && filteredGroups.length === 0;

  const renderItem = (demo: DemoIndexEntry) => (
    <ComboboxItem
      key={demo.filename}
      value={demo.filename}
      className={demoStyles.Item}
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
          aria-label="Choose a demo"
          aria-describedby={selectedDemo ? selectedValueId : undefined}
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
          <div
            id={selectedValueId}
            className={styles.SelectedValue}
            aria-hidden
          >
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
        aria-label="Close demo picker"
        data-open={isOpen}
        onClick={() => {
          combobox.hide();
        }}
      >
        <IoMdCloseCircle aria-hidden />
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
              <Checkbox
                className={styles.FilterCheckbox}
                checked={tournamentOnly}
                onChange={(event) => setTournamentOnly(event.target.checked)}
              />
              <TbLaurelWreathFilled className={styles.FilterIcon} />
              <span className={styles.FilterLabel}>Tournament mode only</span>
            </label>
            <label className={styles.Filter}>
              <Checkbox
                className={styles.FilterCheckbox}
                checked={commentaryOnly}
                onChange={(event) => setCommentaryOnly(event.target.checked)}
              />
              <FaMicrophoneAlt className={styles.FilterMicIcon} />
              <span className={styles.FilterLabel}>Has commentary</span>
            </label>
          </div>
        )}
        <ComboboxList className={styles.List} aria-label="Demos">
          {emptyMessage != null ? (
            <div className={styles.NoResults} role="status">
              {emptyMessage}
            </div>
          ) : (
            filteredGroups.map(([day, dayDemos]) => (
              <ComboboxGroup key={day} className={styles.Group}>
                <ComboboxGroupLabel className={styles.GroupLabel}>
                  {day}
                </ComboboxGroupLabel>
                {dayDemos.map(renderItem)}
              </ComboboxGroup>
            ))
          )}
          {noResults && (
            <div className={styles.NoResults} role="status">
              No demos found
            </div>
          )}
        </ComboboxList>
      </ComboboxPopover>
    </ComboboxProvider>
  );
}
