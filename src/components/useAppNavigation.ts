import { useMemo } from "react";
import { cameraTourStore } from "../state/cameraTourStore";
import { engineStore } from "../state/engineStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { replayConnectionStore } from "../state/replayConnectionStore";
import {
  loadDemoFile,
  loadDemoReference,
  unloadDemo,
} from "../stream/demoFileLoader";
import {
  dropLocationHash,
  serializeNavigationQuery,
  useNavigationQueryState,
  type NavigationQuery,
  type CurrentMission,
  type AppMode,
} from "./useQueryParams";

/** Navigation is an action, not a side effect of a picker becoming visible. */
export function useAppNavigation() {
  const [, setQuery] = useNavigationQueryState();
  return useMemo(() => {
    function navigate(next: Partial<NavigationQuery>) {
      const hash = window.location.hash;
      const committed = setQuery(
        (current) =>
          !hash &&
          serializeNavigationQuery(current) ===
            serializeNavigationQuery({ ...current, ...next })
            ? {}
            : next,
        { history: "push" },
      );
      if (!hash) return;
      // Clear the new entry's camera only after pushing; keep the old entry intact.
      let canceled = false;
      const onPopState = () => {
        canceled = true;
      };
      window.addEventListener("popstate", onPopState);
      void committed
        .then(() => {
          if (!canceled && window.location.hash === hash) dropLocationHash();
        })
        .finally(() => window.removeEventListener("popstate", onPopState));
    }

    function destination(mode: AppMode) {
      cameraTourStore.getState().cancel();
      return {
        mode,
        mission: null,
        demo: null,
        user: null,
        replay: null,
        t: null,
        address: null,
        name: null,
        view: null,
      };
    }

    function leaveStream(closeRelay: boolean) {
      replayConnectionStore.getState().leave();
      const live = liveConnectionStore.getState();
      live.leaveServer();
      if (closeRelay || live.role === "player") live.disconnectRelay();
      unloadDemo();
    }

    function demoIndex() {
      navigate(destination("demo"));
      leaveStream(true);
    }

    return {
      demoIndex,
      userDemos(discordId: string) {
        navigate({ ...destination("demo"), user: discordId });
        leaveStream(true);
      },
      createReplay(reference: string, tick?: number) {
        navigate(destination("replay"));
        leaveStream(true);
        replayConnectionStore.getState().create(reference, tick);
      },
      createLocalReplay(buffer: ArrayBuffer, name: string, tick?: number) {
        navigate(destination("replay"));
        leaveStream(true);
        replayConnectionStore.getState().createLocal(buffer, name, tick);
      },
      selectDemo(reference: string) {
        navigate({ ...destination("demo"), demo: reference });
        leaveStream(true);
        void loadDemoReference(reference);
      },
      selectDemoFile(file: File, checkpoints?: File) {
        demoIndex();
        void loadDemoFile(file, checkpoints);
      },
      selectMission(mission: CurrentMission) {
        navigate({ ...destination("map"), mission });
        leaveStream(true);
      },
      serverBrowser() {
        navigate(destination("live"));
        leaveStream(false);
      },
      watchServer(address: string) {
        const live = liveConnectionStore.getState();
        const server = live.servers.find((s) => s.address === address);
        const uniqueName =
          server?.name &&
          live.servers.filter((s) => s.name === server.name).length === 1;
        navigate({
          ...destination("live"),
          ...(uniqueName ? { name: server.name } : { address }),
        });
        unloadDemo();
        live.watchServer(address);
      },
      disconnectServer() {
        navigate(destination("live"));
        const live = liveConnectionStore.getState();
        if (live.role === "watcher") live.leaveServer();
        else live.disconnectServer();
        // Keep the last scene for the disconnected dialog's Rejoin action.
        engineStore.getState().setRecording(null);
      },
    };
  }, [setQuery]);
}
