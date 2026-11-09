import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  PiCassetteTapeFill,
  PiCassetteTapeLight,
  PiGlobe,
} from "react-icons/pi";
import { FaMicrophoneAlt, FaSearch } from "react-icons/fa";
import { FaPenToSquare } from "react-icons/fa6";
import { IoCalendarNumberOutline } from "react-icons/io5";
import {
  LuChevronLeft,
  LuChevronRight,
  LuClock,
  LuUser,
  LuUsers,
} from "react-icons/lu";
import { TbLaurelWreathFilled } from "react-icons/tb";
import { useDemoLoad } from "../state/demoLoadStore";
import { useAppAccount } from "../state/appAccountStore";
import { editableDemoGame, type EditableGame } from "../state/editableGame";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { demoPlayerCount, type DemoIndexEntry } from "../stream/demoIndex";
import { useDemoIndexSuspense } from "./useDemoIndex";
import { QuietErrorBoundary } from "./QuietErrorBoundary";
import { normalizeMissionType } from "../mission";
import {
  demoTitle,
  demoTeams,
  formatDuration,
  formatRecordedTime,
  recordedDayLabel,
} from "./demoFormat";
import { missionGalleryArtUrl, missionLoadScreenUrl } from "./missionPreview";
import { PreviewTileArt } from "./PreviewTileArt";
import tileStyles from "./PreviewTile.module.css";
import { useAppNavigation } from "./useAppNavigation";
import { focusDemoSelect } from "./demoSelectFocus";
import { LoadingIndicator } from "./LoadingIndicator";
import styles from "./DemoDropScreen.module.css";
import { DEMO_CHECKPOINT_SUFFIX } from "../stream/demoCheckpoints";
import { GameDetailsDialog } from "./GameDetailsEditor";

/** Featured demos: recently indexed games with a real crowd and length. */
const FEATURED_MIN_PLAYERS = 10;
const FEATURED_MIN_DURATION_MS = 10 * 60_000;
const FEATURED_COUNT = 6;

/**
 * Loading-screen name fallbacks for renamed mission variants, tried in
 * order when the exact name has no art; the first capture group is the
 * backup name (see missionLoadScreenUrl). E.g. "DangerousCrossingLT" →
 * Load_DangerousCrossing, "Katabatic_b" → Load_Katabatic.
 */
const CARD_ART_NAME_FALLBACKS: readonly RegExp[] = [
  /^(.+)LT$/,
  /^(.+)Lak$/,
  /^(.+)_b$/,
];

function FeaturedCard({
  demo,
  onLoad,
  onEdit,
}: {
  demo: DemoIndexEntry;
  onLoad: () => void;
  onEdit?: () => void;
}) {
  const mission = demo.games[0]?.mission ?? "";
  const matchups = demoTeams(demo).filter((teams) =>
    teams.some(([id, name]) => name !== DEFAULT_TEAM_NAMES[Number(id)]),
  );
  const matchTitle = demo.games
    .map((game) => game.title)
    .filter(Boolean)
    .join(" → ");
  const gameTypes = [
    ...new Set(
      demo.games
        .map((game) => normalizeMissionType(game.gameType))
        .filter(Boolean),
    ),
  ];
  return (
    <div
      className={`${tileStyles.Tile} ${styles.FeaturedCard}`}
      data-editable={!!onEdit}
      data-has-title={!!matchTitle}
    >
      <a
        href={`?demo=${encodeURIComponent(demo.filename)}`}
        className={styles.FeaturedLink}
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          onLoad();
        }}
      >
        {/* Local load-screen art (with variant-name fallbacks), then the
          t2-maps gallery screenshot, then the generic background. */}
        <PreviewTileArt
          candidates={[
            missionLoadScreenUrl(mission, CARD_ART_NAME_FALLBACKS),
            missionGalleryArtUrl(mission),
          ]}
        >
          <PiCassetteTapeFill
            className={`${tileStyles.TilePlaceholder} ${styles.CassetteIcon}`}
          />
        </PreviewTileArt>
        <span className={`${tileStyles.TileBody} ${styles.FeaturedBody}`}>
          {matchTitle && (
            <span className={tileStyles.TileMatchTitle} title={matchTitle}>
              {matchTitle}
            </span>
          )}
          {matchups.length > 0 && (
            <span className={tileStyles.TileTeams}>
              {matchups.map((teams, gameIndex) => (
                <Fragment key={gameIndex}>
                  {gameIndex > 0 && " → "}
                  {teams.map(([id, name], teamIndex) => (
                    <Fragment key={id}>
                      {teamIndex > 0 && " vs "}
                      <span className={tileStyles.TileTeamName}>{name}</span>
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </span>
          )}
          <span className={`${tileStyles.TileTitle} ${styles.FeaturedMission}`}>
            <span className={tileStyles.TileMapTitle}>{demoTitle(demo)}</span>
            {gameTypes.map((type) => (
              <span
                key={type}
                className={tileStyles.TileTag}
                data-mission-type={type}
              >
                {type}
              </span>
            ))}
            {demo.games.some((game) => game.tournament) && (
              <TbLaurelWreathFilled
                className={tileStyles.TileTournamentIcon}
                title="Tournament mode"
                aria-label="Tournament mode"
              />
            )}
            {demo.hasCommentary && (
              <FaMicrophoneAlt
                className={tileStyles.TileCommentaryIcon}
                title="Commentary track"
                aria-label="Commentary track"
              />
            )}
          </span>
          <span className={tileStyles.TileDetails}>
            <span className={tileStyles.TileMetaItem}>
              <IoCalendarNumberOutline
                className={tileStyles.TileMetaIcon}
                title="Recorded on"
                aria-hidden
              />
              <span className={tileStyles.TileMetaText}>
                {recordedDayLabel(demo.recordedAt)}{" "}
                {formatRecordedTime(demo.recordedAt)}
              </span>
            </span>
            <span className={tileStyles.TileDuration}>
              <LuClock
                className={tileStyles.TileCompactMetaIcon}
                aria-label="Duration"
              />
              {formatDuration(demo.durationMs)}
            </span>
            <span
              className={tileStyles.TileMetaItem}
              title={demo.players.join(", ") || undefined}
            >
              <LuUsers
                className={tileStyles.TileCompactMetaIcon}
                aria-label="Players"
              />
              {demoPlayerCount(demo)}
            </span>
          </span>
          <span className={tileStyles.TileSource}>
            {demo.recorder ? (
              <span className={tileStyles.TileMetaItem}>
                <LuUser
                  className={tileStyles.TileRecorderIcon}
                  title="Recorded by"
                  aria-hidden
                />
                <span className={tileStyles.TileMetaText} title={demo.recorder}>
                  {demo.recorder}
                </span>
              </span>
            ) : null}
            {demo.server && (
              <span className={tileStyles.TileMetaItem}>
                <PiGlobe
                  className={tileStyles.TileMetaIcon}
                  title="Server"
                  aria-hidden
                />
                <span className={tileStyles.TileMetaText} title={demo.server}>
                  {demo.server}
                </span>
              </span>
            )}
          </span>
        </span>
      </a>
      {onEdit && (
        <button
          type="button"
          className={styles.EditDemoButton}
          title="Edit demo data"
          aria-label={`Edit demo data: ${matchTitle || demoTitle(demo)}`}
          aria-haspopup="dialog"
          onClick={onEdit}
        >
          <FaPenToSquare aria-hidden />
        </button>
      )}
    </div>
  );
}

/** The section's chrome, shared by the skeleton and the loaded list so
 *  the two can never drift apart (or shift the layout between them). */
function FeaturedHeader({ pager }: { pager?: ReactNode }) {
  return (
    <div className={styles.FeaturedHeader}>
      <h2 className={styles.FeaturedTitle}>Featured recent demos</h2>
      <div className={styles.FeaturedPager}>
        <button
          type="button"
          className={styles.SearchButton}
          onClick={focusDemoSelect}
        >
          <FaSearch className={styles.SearchIcon} /> Find a demo…
        </button>
        {pager}
      </div>
    </div>
  );
}

/** Placeholder cards held while the index is in flight. */
function FeaturedSkeleton() {
  return (
    <div className={`${styles.Featured} ${styles.FeaturedSkeleton}`}>
      <FeaturedHeader />
      <div
        className={styles.FeaturedGrid}
        role="status"
        aria-label="Loading featured demos"
      >
        {Array.from({ length: FEATURED_COUNT }, (_, i) => (
          <div key={i} className={styles.SkeletonTile} aria-hidden="true">
            <div className={styles.SkeletonPreview} />
            <div className={styles.SkeletonBody}>
              <div className={styles.SkeletonLine} data-line="title" />
              <div className={styles.SkeletonLine} data-line="mission" />
              <div className={styles.SkeletonLine} data-line="meta" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The featured section. Suspends on the index behind a skeleton, and
 * an index that fails to load simply leaves the section out — it is a
 * convenience, never the only way to open a demo.
 */
function FeaturedDemos() {
  return (
    <QuietErrorBoundary label="Featured demos">
      <Suspense fallback={<FeaturedSkeleton />}>
        <FeaturedList />
      </Suspense>
    </QuietErrorBoundary>
  );
}

function FeaturedList() {
  const navigation = useAppNavigation();
  const admin = useAppAccount(
    (state) => state.status === "ready" && state.user?.role === "admin",
  );
  const [editing, setEditing] = useState<EditableGame | null>(null);
  const [page, setPage] = useState(0);
  const { data: demos } = useDemoIndexSuspense();
  const matching = useMemo(
    () =>
      demos
        .filter(
          (demo) =>
            demoPlayerCount(demo) >= FEATURED_MIN_PLAYERS &&
            demo.durationMs > FEATURED_MIN_DURATION_MS,
        )
        .sort(
          (a, b) =>
            b.recordedAt.localeCompare(a.recordedAt) ||
            a.filename.localeCompare(b.filename),
        ),
    [demos],
  );
  const pageCount = Math.ceil(matching.length / FEATURED_COUNT);
  // Clamp instead of resetting state if the list shrinks under us.
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const featured = matching.slice(
    currentPage * FEATURED_COUNT,
    (currentPage + 1) * FEATURED_COUNT,
  );
  if (featured.length === 0) return null;
  return (
    <div className={styles.Featured}>
      <FeaturedHeader
        pager={
          pageCount > 1 ? (
            <>
              <button
                type="button"
                className={styles.PagerButton}
                aria-label="Previous page"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                <LuChevronLeft />
              </button>
              <button
                type="button"
                className={styles.PagerButton}
                aria-label="Next page"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                <LuChevronRight />
              </button>
            </>
          ) : null
        }
      />
      <div className={styles.FeaturedGrid}>
        {featured.map((demo) => (
          <FeaturedCard
            key={demo.filename}
            demo={demo}
            onLoad={() => navigation.selectDemo(demo.filename)}
            onEdit={
              admin
                ? () =>
                    setEditing(editableDemoGame(demo.filename, demo.games, 0))
                : undefined
            }
          />
        ))}
      </div>
      {editing && (
        <GameDetailsDialog
          game={editing}
          teams={[]}
          standalone
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * Demo-mode landing filling the content area until a recording loads:
 * a drag & drop target with a clickable cassette to browse for a .rec.
 */
export function DemoDropScreen() {
  const navigation = useAppNavigation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const phase = useDemoLoad((s) => s.phase);
  const progress = useDemoLoad((s) => s.progress);
  const loadError = useDemoLoad((s) => s.error);
  const isLoading = phase === "downloading" || phase === "parsing";

  // A file dropped outside the zone (toolbar, sidebar) would otherwise
  // navigate the page to it.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files ?? []);
      const file = files.find((file) =>
        file.name.toLowerCase().endsWith(".rec"),
      );
      if (file) {
        navigation.selectDemoFile(
          file,
          files.find(
            (candidate) =>
              candidate.name === file.name + DEMO_CHECKPOINT_SUFFIX,
          ),
        );
      }
    },
    [navigation],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      const file = files.find((file) =>
        file.name.toLowerCase().endsWith(".rec"),
      );
      if (!file) return;
      e.target.value = "";
      navigation.selectDemoFile(
        file,
        files.find(
          (candidate) => candidate.name === file.name + DEMO_CHECKPOINT_SUFFIX,
        ),
      );
    },
    [navigation],
  );

  return (
    <div
      className={styles.DropZone}
      data-drag-over={dragOver}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        // Entering a child fires dragleave on the zone — only clear the
        // highlight when the pointer actually leaves it.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDragOver(false);
        }
      }}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".rec,.checkpoints.json"
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      {isLoading ? (
        <>
          <LoadingIndicator
            isLoading
            progress={phase === "downloading" ? progress : null}
          />
          <p className={styles.LoadingHint}>
            {phase === "downloading" ? "Downloading demo…" : "Loading demo…"}
          </p>
        </>
      ) : (
        <>
          <FeaturedDemos />
          <div className={styles.DropUi}>
            <button
              type="button"
              className={styles.BrowseButton}
              aria-label="Load demo (.rec)"
              title="Load demo (.rec)"
              onClick={() => inputRef.current?.click()}
            >
              {/* The outline cassette "fills in" while dragging a file. */}
              {dragOver ? (
                <PiCassetteTapeFill aria-hidden />
              ) : (
                <PiCassetteTapeLight aria-hidden />
              )}
            </button>
            {loadError != null && (
              <p className={styles.LoadError}>{loadError}</p>
            )}
            <p className={styles.Hint}>
              Drag &amp; drop a Tribes 2 demo (.rec file) here
            </p>
            <p className={styles.SubHint}>or click the cassette to browse</p>
          </div>
        </>
      )}
    </div>
  );
}
