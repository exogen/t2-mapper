import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PiCassetteTapeFill, PiCassetteTapeLight } from "react-icons/pi";
import { FaSearch } from "react-icons/fa";
import { LuChevronLeft, LuChevronRight, LuUser, LuUsers } from "react-icons/lu";
import { TbLaurelWreathFilled } from "react-icons/tb";
import { useDemoLoad } from "../state/demoLoadStore";
import { loadDemoFile } from "../stream/demoFileLoader";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { useDemoIndex } from "./useDemoIndex";
import { normalizeMissionType } from "../mission";
import {
  demoTitle,
  formatDuration,
  formatRecordedTime,
  recordedDayLabel,
} from "./demoFormat";
import {
  missionLoadScreenUrl,
  RawPreviewImage,
  TILE_FALLBACK_ART_URL,
} from "./missionPreview";
import tileStyles from "./PreviewTile.module.css";
import { useDemoQueryState } from "./useQueryParams";
import { focusDemoSelect } from "./demoSelectFocus";
import { LoadingIndicator } from "./LoadingIndicator";
import styles from "./DemoDropScreen.module.css";

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
}: {
  demo: DemoIndexEntry;
  onLoad: () => void;
}) {
  const missionArtUrl = missionLoadScreenUrl(
    demo.games[0]?.mission ?? "",
    CARD_ART_NAME_FALLBACKS,
  );
  const previewUrl = missionArtUrl ?? TILE_FALLBACK_ART_URL;
  const gameTypes = [
    ...new Set(
      demo.games
        .map((game) => normalizeMissionType(game.gameType))
        .filter(Boolean),
    ),
  ];
  return (
    <button type="button" className={tileStyles.Tile} onClick={onLoad}>
      <span
        className={tileStyles.TilePreview}
        data-default-image={missionArtUrl == null}
        aria-hidden
      >
        {previewUrl && (
          <RawPreviewImage
            src={previewUrl}
            alt=""
            className={tileStyles.TileImage}
          />
        )}
        <PiCassetteTapeFill className={tileStyles.TilePlaceholder} />
      </span>
      <span className={tileStyles.TileBody}>
        <span className={tileStyles.TileTitle}>
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
        </span>
        <span className={tileStyles.TileMeta}>
          {demo.server} · {recordedDayLabel(demo.recordedAt)} ·{" "}
          {formatRecordedTime(demo.recordedAt)}
        </span>
        <span className={tileStyles.TileMeta}>
          {demo.recorder ? (
            <>
              <LuUser className={tileStyles.TileMetaIcon} title="Recorded by" />{" "}
              {demo.recorder} ·{" "}
            </>
          ) : null}
          <span title={demo.players.join(", ") || undefined}>
            <LuUsers className={tileStyles.TileMetaIcon} aria-label="Players" />{" "}
            {demo.players.length} players
          </span>{" "}
          · {formatDuration(demo.durationMs)}
        </span>
      </span>
    </button>
  );
}

function FeaturedDemos() {
  const [, setDemoParam] = useDemoQueryState();
  const [page, setPage] = useState(0);
  const { data: demos } = useDemoIndex();
  const matching = useMemo(
    () =>
      (demos ?? [])
        .filter(
          (demo) =>
            demo.players.length >= FEATURED_MIN_PLAYERS &&
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
          {pageCount > 1 && (
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
          )}
        </div>
      </div>
      <div className={styles.FeaturedGrid}>
        {featured.map((demo) => (
          <FeaturedCard
            key={demo.filename}
            demo={demo}
            // Route through the ?demo param — the same code path as the
            // demo dropdown and shared links (DemoSelect's effect loads it).
            onLoad={() => void setDemoParam(demo.filename)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Demo-mode landing filling the content area until a recording loads:
 * a drag & drop target with a clickable cassette to browse for a .rec.
 */
export function DemoDropScreen() {
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith(".rec")) {
      void loadDemoFile(file);
    }
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      void loadDemoFile(file);
    },
    [],
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
        accept=".rec"
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
