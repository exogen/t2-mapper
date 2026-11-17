import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import { isDiscordId } from "../../relay/accountTypes";
import type { ClipView } from "../../relay/clipTypes";
import { deleteClip, readUserClips } from "../stream/clipApi";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { ClipCard } from "./ClipCard";
import { DemoPagination } from "./DemoPagination";
import styles from "./UserDemos.module.css";

export function UserClips({
  userId,
  demos,
  creatorName,
  canDelete = false,
}: {
  userId: string;
  demos: readonly DemoIndexEntry[] | undefined;
  creatorName?: string;
  canDelete?: boolean;
}) {
  const queryClient = useQueryClient();
  const [requestedPage, setPage] = useState(1);
  const [action, setAction] = useState<{
    deleting: string | null;
    error: string | null;
  }>({ deleting: null, error: null });
  const deleting = useRef(false);
  const validUser = isDiscordId(userId);
  const clips = useQuery({
    queryKey: [
      "userClips",
      userId,
      requestedPage,
      canDelete ? "manage" : "public",
    ],
    enabled: validUser,
    queryFn: ({ signal }) =>
      readUserClips(userId, requestedPage, signal, canDelete),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (query.state.data?.pending ? 3_000 : false),
    retry: false,
  });
  if (!validUser) return null;
  const page = clips.data;

  async function removeClip(clip: ClipView) {
    if (
      !canDelete ||
      clip.ownerDiscordId !== userId ||
      deleting.current ||
      !window.confirm(`Permanently delete this clip?\n\n${clip.title}`)
    )
      return;
    deleting.current = true;
    setAction({ deleting: clip.id, error: null });
    try {
      await deleteClip(clip.id, AbortSignal.timeout(20_000));
    } catch (cause) {
      setAction((previous) => ({
        ...previous,
        error:
          cause instanceof Error ? cause.message : "Could not delete the clip.",
      }));
    } finally {
      deleting.current = false;
      setAction((previous) => ({ ...previous, deleting: null }));
      void queryClient.invalidateQueries({ queryKey: ["userClips", userId] });
    }
  }

  return (
    <section className={styles.DemoSection} aria-label="Clips">
      <div className={styles.Header}>
        <h2 className={styles.Title}>Clips</h2>
        {clips.isFetching && (
          <LuLoaderCircle
            className={styles.Spinner}
            role="status"
            aria-label="Refreshing clips"
          />
        )}
        {page && (
          <DemoPagination
            label="Clip pages"
            page={page.page - 1}
            pageCount={Math.ceil(page.total / page.pageSize)}
            onPageChange={(next) => setPage(next + 1)}
          />
        )}
      </div>
      {page?.clips.length ? (
        <div className={styles.Grid}>
          {page.clips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              demo={demos?.find((demo) => demo.filename === clip.sourceDemo)}
              creatorName={creatorName}
              onDelete={
                canDelete && clip.ownerDiscordId === userId
                  ? () => void removeClip(clip)
                  : undefined
              }
              deleting={action.deleting === clip.id}
            />
          ))}
        </div>
      ) : clips.isError ? null : (
        <p className={styles.Message}>
          {!page
            ? "Loading clips…"
            : page.pending
              ? "Preparing clips…"
              : "No clips yet."}
        </p>
      )}
      {clips.isError && (
        <p className={styles.Error} role="alert">
          {page
            ? "Could not refresh clips. Please reload to try again."
            : "Could not load clips. Please reload to try again."}
        </p>
      )}
      {action.error && (
        <p className={styles.Error} role="alert">
          {action.error}
        </p>
      )}
    </section>
  );
}
