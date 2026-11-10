import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { FaSearch } from "react-icons/fa";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { useDemoLoad } from "../state/demoLoadStore";
import { demoPlayerCount } from "../stream/demoIndex";
import { useDemoIndexSuspense } from "./useDemoIndex";
import { QuietErrorBoundary } from "./QuietErrorBoundary";
import { useAppNavigation } from "./useAppNavigation";
import { useNavigationQueryState } from "./useQueryParams";
import { focusDemoSelect } from "./demoSelectFocus";
import { LoadingIndicator } from "./LoadingIndicator";
import { DEMO_CHECKPOINT_SUFFIX } from "../stream/demoCheckpoints";
import { DemoCard } from "./DemoCard";
import { DemoDropZone } from "./DemoDropZone";
import UserDemos from "./UserDemos";
import styles from "./DemoDropScreen.module.css";

/** Featured demos: recently indexed games with a real crowd and length. */
const FEATURED_MIN_PLAYERS = 10;
const FEATURED_MIN_DURATION_MS = 10 * 60_000;
const FEATURED_COUNT = 6;

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
    <div
      className={`${styles.Featured} ${styles.FeaturedSkeleton}`}
      data-demo-cards
    >
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
    <div className={styles.Featured} data-demo-cards>
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
          <DemoCard key={demo.filename} demo={demo} />
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

  const [{ user, demo }] = useNavigationQueryState();
  return user !== null && !demo ? (
    <UserDemos key={user} userId={user} />
  ) : (
    <DemoLanding />
  );
}

function DemoLanding() {
  const navigation = useAppNavigation();
  const phase = useDemoLoad((s) => s.phase);
  const progress = useDemoLoad((s) => s.progress);
  const loadError = useDemoLoad((s) => s.error);
  const isLoading = phase === "downloading" || phase === "parsing";
  const handleFiles = useCallback(
    (files: File[]) => {
      const file = files.find((file) =>
        file.name.toLowerCase().endsWith(".rec"),
      );
      if (!file) return;
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
    <DemoDropZone
      intent="load"
      onFiles={handleFiles}
      hidePicker={isLoading}
      feedback={
        loadError != null ? (
          <p className={styles.LoadError}>{loadError}</p>
        ) : undefined
      }
    >
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
        <FeaturedDemos />
      )}
    </DemoDropZone>
  );
}
