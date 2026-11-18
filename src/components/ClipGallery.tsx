import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { parseAsInteger, useQueryState } from "nuqs";
import { LuChevronLeft } from "react-icons/lu";
import { readPublicClips } from "../stream/clipApi";
import { ClipCard } from "./ClipCard";
import { DemoPagination } from "./DemoPagination";
import { useDemoIndex } from "./useDemoIndex";
import styles from "./ClipGallery.module.css";

export function ClipGallery() {
  const [pageParam, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(1).withOptions({ history: "push" }),
  );
  const requestedPage = Math.max(1, pageParam);
  const { data: demos } = useDemoIndex();
  const clips = useQuery({
    queryKey: ["publicClips", requestedPage],
    queryFn: ({ signal }) => readPublicClips(requestedPage, signal),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const page = clips.data;

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
          <div className={styles.Header}>
            <h1 className={styles.Title} id="clips-title">
              Recent clips
            </h1>
            {page && (
              <DemoPagination
                label="Clip pages"
                page={page.page - 1}
                pageCount={Math.ceil(page.total / page.pageSize)}
                disabled={clips.isPlaceholderData}
                onPageChange={(next) => void setPage(next + 1)}
              />
            )}
          </div>
          {page?.clips.length ? (
            <div className={styles.Grid}>
              {page.clips.map((clip) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  demo={demos?.find(
                    (demo) => demo.filename === clip.sourceDemo,
                  )}
                />
              ))}
            </div>
          ) : clips.isPending ? (
            <p className={styles.Message} role="status">
              Loading clips…
            </p>
          ) : page ? (
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
