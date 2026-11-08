import { useCallback, useEffect, useMemo, useState } from "react";
import type { DemoGame } from "../../relay/demoMetadata";
import { readPublishedDemoPresentation } from "../state/gamePresentationApi";
import { useAppAccount } from "../state/appAccountStore";
import { useCaster } from "../state/casterStore";
import { useDataSource } from "../state/gameEntityStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { useDemoLoad } from "../state/demoLoadStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import {
  editableDemoGame,
  editableDemoEntry,
  publishedDemoFilename,
  type EditableGame,
} from "../state/editableGame";

/** Admin edits target a live session or a recording in our published catalog. */
export function useEditableGame(): EditableGame | null {
  const admin = useAppAccount(
    (s) => s.status === "ready" && s.user?.role === "admin",
  );
  const watching = useLiveSelector(
    (s) => s.role === "watcher" && s.watchStatus === "live",
  );
  const source = useDataSource();
  const game = useCaster((s) => s.publishedGame);
  const sourceUrl = useDemoLoad((s) => s.sourceUrl);
  const games = useDemoLoad((s) => s.publishedGames);
  const readySec = useStreamSnapshot((s) => s?.missionReadySec ?? 0);
  if (!admin) return null;
  if (source === "live") return watching ? game : null;
  const filename = source === "demo" ? publishedDemoFilename(sourceUrl) : null;
  return filename ? editableDemoGame(filename, games ?? [], readySec) : null;
}

interface DemoEditorState {
  target: EditableGame;
  games: DemoGame[];
  selectedIndex: number | null;
  error: string | null;
}

/** Historical writes always resolve against fresh metadata and explicit game selection. */
export function useGamePresentationEditor(target: EditableGame | null) {
  const [demo, setDemo] = useState<DemoEditorState | null>(null);
  const current = demo?.target === target ? demo : null;
  useEffect(() => {
    if (!target?.demo) return;
    const abort = new AbortController();
    void readPublishedDemoPresentation(target.demo.filename, abort.signal)
      .then((record) => {
        if (!record.games.length)
          throw new Error("This recording has no game metadata to edit.");
        setDemo({
          target,
          games: record.games,
          selectedIndex: record.games.length === 1 ? 0 : null,
          error: null,
        });
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setDemo({
            target,
            games: [],
            selectedIndex: null,
            error:
              error instanceof Error
                ? error.message
                : "Could not load game details. Please try again.",
          });
      });
    return () => abort.abort();
  }, [target]);
  const selectGame = useCallback(
    (index: number) =>
      setDemo((old) =>
        old?.target === target && old.games[index]
          ? { ...old, selectedIndex: index }
          : old,
      ),
    [target],
  );
  const details = useMemo(() => {
    if (!target?.demo) return target;
    return current?.selectedIndex != null
      ? editableDemoEntry(
          target.demo.filename,
          current.games[current.selectedIndex],
          current.selectedIndex,
        )
      : null;
  }, [target, current]);
  return {
    details,
    games: current?.games ?? null,
    selectedIndex: current?.selectedIndex ?? null,
    selectGame,
    loading: !!target?.demo && !current,
    error: current?.error ?? null,
  };
}
