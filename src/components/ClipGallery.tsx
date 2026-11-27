import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { LuChevronLeft } from "react-icons/lu";
import { useAppAccount } from "../state/appAccountStore";
import { readPublicClips } from "../stream/clipApi";
import { ClipCard } from "./ClipCard";
import { useDemoIndex } from "./useDemoIndex";
import styles from "./ClipGallery.module.css";

export function ClipGallery() {
  const owner = useAppAccount((state) =>
    state.status === "ready" && !state.pending
      ? state.user?.discordId
      : undefined,
  );
  const { data: demos } = useDemoIndex();
  const demosByFilename = useMemo(
    () => new Map(demos?.map((demo) => [demo.filename, demo])),
    [demos],
  );
  const clips = useQuery({
    queryKey: ["publicClips"],
    queryFn: ({ signal }) => readPublicClips(signal),
    retry: false,
  });
  const items = clips.data?.clips;

  return (
    <div className={styles.Frame}>
      <header className={styles.Toolbar}>
        <a
          className={styles.BackLink}
          href={`${import.meta.env.BASE_URL}?mode=demo`}
        >
          <LuChevronLeft aria-hidden /> Back to MapGenius
        </a>
      </header>
      <main className={styles.Page}>
        <section
          className={styles.Content}
          aria-labelledby="clips-title"
          aria-busy={clips.isFetching}
        >
          <h1 className={styles.Title} id="clips-title">
            Recent clips
          </h1>
          {items?.length ? (
            <div className={styles.Grid}>
              {items.map((clip) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  demo={demosByFilename.get(clip.sourceDemo)}
                  canEdit={clip.ownerDiscordId === owner}
                />
              ))}
            </div>
          ) : clips.isPending ? (
            <p className={styles.Message} role="status">
              Loading clips…
            </p>
          ) : items ? (
            <p className={styles.Message}>No clips yet.</p>
          ) : null}
          {clips.isError && (
            <p className={styles.Error} role="alert">
              Could not load clips.{" "}
              <button
                type="button"
                className={styles.Retry}
                onClick={() => void clips.refetch()}
              >
                Try again
              </button>
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
