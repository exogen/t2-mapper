import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { LuLoaderCircle } from "react-icons/lu";
import {
  isDiscordId,
  type AccountPublicProfile,
} from "../../relay/accountTypes";
import {
  MAX_USER_DEMO_BYTES,
  type UserDemoUpload,
  type UserDemoUploadList,
  type UserDemoUploadResponse,
} from "../../relay/userDemoTypes";
import { appApiBaseUrl } from "../account/authClient";
import { refreshAccount, useAppAccount } from "../state/appAccountStore";
import { uploadUserDemo, userDemoUploadsUrl } from "../stream/userDemoUpload";
import { DemoCard, PendingDemoCard } from "./DemoCard";
import { DemoDropZone } from "./DemoDropZone";
import { demoTitle } from "./demoFormat";
import { refreshDemoIndex, useDemoIndex } from "./useDemoIndex";
import { UserIdentity } from "./UserIdentity";
import styles from "./UserDemos.module.css";

const UPLOAD_LABELS: Record<UserDemoUpload["state"], string> = {
  receiving: "Uploading",
  queued: "Queued",
  processing: "Processing",
  publishing: "Publishing",
  ready: "Ready",
  deleting: "Deleting",
  failed: "Failed",
};

function pending(upload: UserDemoUpload): boolean {
  return upload.state !== "ready" && upload.state !== "failed";
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401) void refreshAccount();
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "Could not update your demos. Please try again.",
    );
  }
  return response.json();
}

interface GalleryEntry {
  key: string;
  recordedAt: string | null;
  card: ReactElement;
}

/**
 * Visitors see the user's public index entries. Owners see their private
 * upload ledger instead, with published card details from the index.
 */
export default function UserDemos({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const index = useDemoIndex();
  const validUser = isDiscordId(userId);
  const account = useAppAccount((state) => state);
  const owner =
    account.status === "ready" && account.user?.discordId === userId;
  const publicProfile = useQuery({
    queryKey: ["userProfile", userId],
    enabled: validUser && !owner,
    queryFn: async ({ signal }): Promise<AccountPublicProfile | null> => {
      const response = await fetch(
        new URL(`/api/users/${encodeURIComponent(userId)}`, appApiBaseUrl),
        {
          credentials: "omit",
          cache: "no-cache",
          signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
        },
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Could not load user profile");
      return response.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const profile = owner ? account.user : publicProfile.data;
  const transfer = useRef<AbortController | null>(null);
  const [transferState, setTransferState] = useState<{
    filename: string;
    progress: number;
  } | null>(null);
  const [lastUpload, setLastUpload] = useState<{
    id: string;
    duplicate: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadsKey = ["userDemos", userId];
  const uploads = useQuery({
    queryKey: uploadsKey,
    enabled: validUser && owner,
    queryFn: ({ signal }) =>
      fetch(userDemoUploadsUrl(userId), {
        credentials: "include",
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      }).then(readResponse<UserDemoUploadList>),
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      owner && query.state.data?.demos.some(pending) ? 3_000 : false,
    retry: false,
  });
  const data = owner ? uploads.data : undefined;
  const ownedUploads = data?.demos;
  // Refresh when public membership changes, rather than each processing step.
  const uploadsVersion = ownedUploads
    ?.filter((demo) => demo.state === "ready" || demo.state === "deleting")
    .map((demo) => `${demo.id}:${demo.state}`)
    .join(",");
  useEffect(() => {
    if (uploadsVersion !== undefined) void refreshDemoIndex(queryClient);
  }, [uploadsVersion, queryClient]);
  // Abort on a confirmed sign-out or account switch. A failed background
  // account refresh doesn't mean the session that started the upload ended.
  const signedOut =
    account.status === "ready" && account.user?.discordId !== userId;
  useEffect(() => {
    if (signedOut || account.pending) transfer.current?.abort();
  }, [signedOut, account.pending]);
  useEffect(() => () => transfer.current?.abort(), []);

  const active = ownedUploads?.find(pending);
  const latest = lastUpload
    ? ownedUploads?.find((upload) => upload.id === lastUpload.id)
    : ownedUploads?.[0];
  const uploading = transferState !== null;
  const uploadDisabled =
    !data ||
    uploads.isError ||
    !!account.pending ||
    uploading ||
    !!deleting ||
    !!active;
  const published = (validUser ? (index.data ?? []) : []).filter((demo) =>
    demo.filename.startsWith(`users/${userId}/`),
  );

  function cacheUpload(upload: UserDemoUpload) {
    queryClient.setQueryData<UserDemoUploadList>(uploadsKey, (previous) =>
      previous
        ? {
            ...previous,
            demos: [
              upload,
              ...previous.demos.filter((demo) => demo.id !== upload.id),
            ],
          }
        : previous,
    );
  }

  async function uploadFiles(files: File[]) {
    if (!owner || !data || uploadDisabled || transfer.current) return;
    setError(null);
    const file = files[0];
    if (
      files.length !== 1 ||
      !file ||
      !/\.rec$/i.test(file.name) ||
      file.size === 0
    ) {
      setError("Choose one nonempty Tribes 2 .rec file.");
      return;
    }
    if (file.size > MAX_USER_DEMO_BYTES) {
      setError("Demo exceeds the 50 MB upload limit.");
      return;
    }
    const controller = new AbortController();
    transfer.current = controller;
    setTransferState({ filename: file.name, progress: 0 });
    setLastUpload(null);
    try {
      const result = await uploadUserDemo(
        file,
        userId,
        (progress) => {
          setTransferState((current) =>
            current ? { ...current, progress } : null,
          );
        },
        controller.signal,
      );
      // The accepted row is authoritative already. Seed it before refreshing
      // the ledger so the transfer card hands off without disappearing.
      cacheUpload(result.demo);
      setLastUpload({ id: result.demo.id, duplicate: !!result.duplicate });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setError(
          cause instanceof Error
            ? cause.message
            : "The demo could not be uploaded.",
        );
    } finally {
      await queryClient.invalidateQueries({ queryKey: uploadsKey });
      transfer.current = null;
      setTransferState(null);
    }
  }

  async function deleteDemo(upload: UserDemoUpload, title: string) {
    if (
      !owner ||
      deleting ||
      !window.confirm(`Permanently delete this demo?\n\n${title}`)
    )
      return;
    setDeleting(upload.id);
    setError(null);
    try {
      const result = await fetch(userDemoUploadsUrl(userId, upload.id), {
        method: "DELETE",
        credentials: "include",
        signal: AbortSignal.timeout(20_000),
      }).then(readResponse<UserDemoUploadResponse>);
      cacheUpload(result.demo);
      setLastUpload((previous) =>
        previous?.id === upload.id ? null : previous,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete the demo.",
      );
    } finally {
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: uploadsKey });
    }
  }

  const publishedByFilename = new Map(
    published.map((demo) => [demo.filename, demo]),
  );
  const gallery: GalleryEntry[] = ownedUploads
    ? ownedUploads.flatMap((upload): GalleryEntry[] => {
        if (upload.state === "deleting") return [];
        const demo = upload.filename
          ? publishedByFilename.get(upload.filename)
          : undefined;
        const onDelete =
          upload.state === "ready"
            ? () =>
                void deleteDemo(
                  upload,
                  demo ? demoTitle(demo) : upload.originalFilename,
                )
            : undefined;
        if (demo)
          return [
            {
              key: upload.id,
              recordedAt: demo.recordedAt,
              card: (
                <DemoCard
                  key={upload.id}
                  demo={demo}
                  onDelete={onDelete}
                  deleting={deleting === upload.id}
                />
              ),
            },
          ];
        if (upload.state === "ready") {
          // Until the index loads, ready rows are history it can't describe yet.
          if (!index.data) return [];
        } else if (uploading && !lastUpload) {
          // Before POST returns its ID, the transfer card stands in for this row.
          return [];
        } else if (upload.state === "failed" && upload.id !== latest?.id) {
          return [];
        }
        const failed =
          upload.state === "failed" ||
          (upload.state === "ready" && (index.isError || !index.isFetching));
        const status =
          upload.state === "failed"
            ? (upload.error ?? "The demo could not be processed.")
            : upload.state === "ready"
              ? failed
                ? "Demo data is unavailable. Please reload to try again."
                : "Loading demo data…"
              : UPLOAD_LABELS[upload.state];
        return [
          {
            key: upload.id,
            recordedAt: upload.recordedAt,
            card: (
              <PendingDemoCard
                key={upload.id}
                filename={upload.originalFilename}
                status={status}
                error={failed}
                onDelete={onDelete}
                deleting={deleting === upload.id}
              />
            ),
          },
        ];
      })
    : published.map((demo) => ({
        key: demo.filename,
        recordedAt: demo.recordedAt,
        card: <DemoCard key={demo.filename} demo={demo} />,
      }));
  if (owner && transferState && !lastUpload)
    gallery.push({
      key: "uploading",
      recordedAt: null,
      card: (
        <PendingDemoCard
          key="uploading"
          filename={transferState.filename}
          status="Uploading"
          progress={transferState.progress}
        />
      ),
    });
  gallery.sort((a, b) => {
    if (!a.recordedAt && b.recordedAt) return -1;
    if (a.recordedAt && !b.recordedAt) return 1;
    return (
      (b.recordedAt ?? "").localeCompare(a.recordedAt ?? "") ||
      a.key.localeCompare(b.key)
    );
  });

  // A failed card already shows its own error.
  const shownError =
    latest?.state === "failed" && latest.error === error ? null : error;
  let status = "";
  let statusError = false;
  if (shownError || uploads.isError) {
    status =
      shownError ??
      "Could not load your demo controls. Please reload to try again.";
    statusError = true;
  } else if (deleting || active?.state === "deleting") {
    status = "Finishing demo deletion…";
  } else if (lastUpload?.duplicate && latest?.state === "ready") {
    status = "This demo is already in your library.";
  } else if (!data) {
    status = "Checking upload availability…";
  }

  const content = (
    <section
      className={styles.Section}
      aria-label="Uploaded demos"
      data-demo-cards
    >
      {validUser && (
        <div className={styles.Profile}>
          {profile ? (
            <UserIdentity user={profile} variant="page" />
          ) : publicProfile.isError ? (
            "Profile unavailable"
          ) : publicProfile.data === null ? (
            "Unknown user"
          ) : null}
        </div>
      )}
      <div className={styles.Header}>
        <h2 className={styles.Title}>Uploaded demos</h2>
        {(index.isFetching || (owner && uploads.isFetching)) && (
          <LuLoaderCircle
            className={styles.Spinner}
            role="status"
            aria-label="Refreshing demos"
          />
        )}
      </div>
      {!validUser ? (
        <p className={styles.Error} role="alert">
          Invalid Discord user ID.
        </p>
      ) : gallery.length > 0 ? (
        <div className={styles.Grid}>{gallery.map((entry) => entry.card)}</div>
      ) : index.isPending ? (
        <p className={styles.Message}>Loading demos…</p>
      ) : index.isError && !index.data ? (
        <p className={styles.Error} role="alert">
          Could not load demos. Please reload to try again.
        </p>
      ) : (
        <p className={styles.Message}>No demos uploaded yet.</p>
      )}
    </section>
  );
  return owner && validUser ? (
    <DemoDropZone
      intent="upload"
      onFiles={(files) => void uploadFiles(files)}
      disabled={uploadDisabled}
      feedback={
        <div className={styles.UploadFeedback}>
          <div
            className={styles.UploadStatus}
            role={statusError ? "alert" : "status"}
          >
            <span className={styles.StatusText} title={status}>
              {status || " "}
            </span>
          </div>
        </div>
      }
    >
      {content}
    </DemoDropZone>
  ) : (
    <div className={styles.Page}>{content}</div>
  );
}
