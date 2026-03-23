import { useMemo } from "react";
import { useGameEntities } from "../state/gameEntityStore";
import { useEngineSelector } from "../state/engineStore";
import { cameraTourStore, useCameraTour } from "../state/cameraTourStore";
import {
  categorizeEntities,
  type TourCategory,
  type TourTarget,
} from "./mapTourCategories";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import styles from "./MapTourPanel.module.css";
import { BsPlayFill } from "react-icons/bs";
import { HiMiniArrowLeftEndOnRectangle } from "react-icons/hi2";

const ALL_FEATURES_TOUR = "__all__";

function selectTourState(state: {
  animation: {
    targets: TourTarget[];
    categoryName: string | null;
    currentIndex: number;
  } | null;
}) {
  if (!state.animation) return null;
  return {
    targets: state.animation.targets,
    categoryName: state.animation.categoryName,
    currentIndex: state.animation.currentIndex,
  };
}

function tourStateEqual(
  a: ReturnType<typeof selectTourState>,
  b: ReturnType<typeof selectTourState>,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.categoryName === b.categoryName &&
    a.currentIndex === b.currentIndex &&
    a.targets === b.targets
  );
}

export function MapTourPanel() {
  const entities = useGameEntities();
  const datablocks = useEngineSelector(
    (state) => state.runtime.runtime?.state.datablocks,
  );
  const categories = useMemo(
    () => categorizeEntities(entities, datablocks),
    [entities, datablocks],
  );
  const tourState = useCameraTour(selectTourState, tourStateEqual);

  const allTargets = useMemo(() => {
    // Build a lookup from target → category index for sorting by type.
    const categoryIndex = new Map<TourTarget, number>();
    for (let i = 0; i < categories.length; i++) {
      for (const target of categories[i].targets) {
        categoryIndex.set(target, i);
      }
    }
    // Sort by [team, type, name] with "no team" (undefined/0) last.
    return categories
      .flatMap((c) => c.targets)
      .sort((a, b) => {
        const aTeam = a.teamId != null && a.teamId > 0 ? a.teamId : Infinity;
        const bTeam = b.teamId != null && b.teamId > 0 ? b.teamId : Infinity;
        if (aTeam !== bTeam) return aTeam - bTeam;
        const aCat = categoryIndex.get(a) ?? 0;
        const bCat = categoryIndex.get(b) ?? 0;
        if (aCat !== bCat) return aCat - bCat;
        return a.label.localeCompare(b.label);
      });
  }, [categories]);

  if (categories.length === 0) {
    return (
      <div className={styles.Root}>
        <p className={styles.Empty}>No map features found</p>
      </div>
    );
  }

  const isTouringAll =
    tourState !== null && tourState.categoryName === ALL_FEATURES_TOUR;

  const handleTourAllClick = () => {
    if (isTouringAll) {
      cameraTourStore.getState().cancel();
    } else {
      cameraTourStore.getState().startTour(allTargets, ALL_FEATURES_TOUR);
    }
  };

  return (
    <div className={styles.Root}>
      <button
        type="button"
        className={styles.TourAllButton}
        data-active={isTouringAll}
        onClick={handleTourAllClick}
      >
        {isTouringAll ? (
          <>
            <HiMiniArrowLeftEndOnRectangle className={styles.ExitIcon} /> Exit
            tour
          </>
        ) : (
          <>
            <BsPlayFill className={styles.PlayIcon} />{" "}
            <span className={styles.ButtonLabel}>Tour all features</span>
          </>
        )}
      </button>
      {categories.map((category) => (
        <CategoryGroup
          key={category.name}
          category={category}
          tourState={tourState}
        />
      ))}
    </div>
  );
}

function CategoryGroup({
  category,
  tourState,
}: {
  category: TourCategory;
  tourState: ReturnType<typeof selectTourState>;
}) {
  const isTouringCategory =
    tourState !== null && tourState.categoryName === category.name;

  const handleTourClick = () => {
    if (isTouringCategory) {
      cameraTourStore.getState().cancel();
    } else {
      cameraTourStore.getState().startTour(category.targets, category.name);
    }
  };

  return (
    <>
      <div className={styles.CategoryHeader}>
        <span>{category.name}</span>
        <span className={styles.CategoryCount}>
          ({category.targets.length})
        </span>
        <button
          type="button"
          className={styles.TourButton}
          data-active={isTouringCategory}
          onClick={handleTourClick}
        >
          {isTouringCategory ? (
            <>
              <HiMiniArrowLeftEndOnRectangle className={styles.ExitIcon} /> Exit
              tour
            </>
          ) : (
            <>
              <BsPlayFill className={styles.PlayIcon} /> Tour all
            </>
          )}
        </button>
      </div>
      <div className={styles.ItemList}>
        {category.targets.map((target, index) => {
          const isActive =
            (isTouringCategory && tourState!.currentIndex === index) ||
            (tourState !== null &&
              tourState.targets[tourState.currentIndex]?.entityId ===
                target.entityId);
          return (
            <button
              key={target.entityId}
              type="button"
              className={styles.ItemRow}
              data-active={isActive}
              onClick={() => cameraTourStore.getState().flyTo(target)}
            >
              <BsPlayFill className={styles.PlayIcon} />{" "}
              <span className={styles.ItemLabel}>{target.label}</span>
              {target.teamId != null && target.teamId > 0 && (
                <span className={styles.TeamBadge} data-team={target.teamId}>
                  {DEFAULT_TEAM_NAMES[target.teamId] ?? `Team ${target.teamId}`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
