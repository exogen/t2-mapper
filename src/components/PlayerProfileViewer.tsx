import { useEffect, useRef } from "react";
import type { T2ProfileView } from "../../relay/accountTypes";
import styles from "./PlayerProfileViewer.module.css";

/** A separate canvas keeps the profile independent of live/demo playback. */
export function PlayerProfileViewer({
  profile,
  playerName,
}: {
  profile: T2ProfileView;
  playerName: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { bodyType, skin, armor, pack, weapon } = profile;
  useEffect(() => {
    const container = containerRef.current!;
    let cancelled = false;
    let viewer: { dispose(): void } | undefined;
    // Profiles without a T2 character never need the viewer's renderer chunk.
    void import("../engine/playerProfileViewer")
      .then(({ mountPlayerProfileViewer }) => {
        if (cancelled) return;
        viewer = mountPlayerProfileViewer(container, {
          bodyType,
          skin,
          armor,
          pack,
          weapon,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          console.warn("Could not load player profile viewer", error);
      });
    return () => {
      cancelled = true;
      viewer?.dispose();
    };
  }, [bodyType, skin, armor, pack, weapon]);

  return (
    <div
      ref={containerRef}
      className={styles.Viewer}
      role="button"
      tabIndex={0}
      aria-label={`${playerName}'s Tribes 2 character. Click or press Enter or Space to wave, celebrate, or taunt. Drag or use arrow keys to rotate.`}
    />
  );
}
