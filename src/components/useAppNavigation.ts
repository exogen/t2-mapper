import { useMemo } from "react";
import { cameraTourStore } from "../state/cameraTourStore";
import { engineStore } from "../state/engineStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import {
  loadDemoFile,
  loadDemoUrl,
  unloadDemo,
} from "../stream/demoFileLoader";
import { demoDownloadUrl } from "../stream/demoIndex";
import {
  dropLocationHash,
  useNavigationQueryState,
  type CurrentMission,
  type AppMode,
} from "./useQueryParams";

/** Navigation is an action, not a side effect of a picker becoming visible. */
export function useAppNavigation() {
  const [, setQuery] = useNavigationQueryState();
  return useMemo(() => {
    function destination(mode: AppMode) {
      dropLocationHash();
      cameraTourStore.getState().cancel();
      return {
        mode,
        mission: null,
        demo: null,
        t: null,
        address: null,
        name: null,
        view: null,
      };
    }

    function leaveStream(closeRelay: boolean) {
      const live = liveConnectionStore.getState();
      live.leaveServer();
      if (closeRelay || live.role === "player") live.disconnectRelay();
      unloadDemo();
    }

    function demoIndex() {
      void setQuery(destination("demo"));
      leaveStream(true);
    }

    return {
      demoIndex,
      selectDemo(filename: string) {
        void setQuery({ ...destination("demo"), demo: filename });
        leaveStream(true);
        void loadDemoUrl(demoDownloadUrl(filename));
      },
      selectDemoFile(file: File) {
        demoIndex();
        void loadDemoFile(file);
      },
      selectMission(mission: CurrentMission) {
        void setQuery({ ...destination("map"), mission });
        leaveStream(true);
      },
      serverBrowser() {
        void setQuery(destination("live"));
        leaveStream(false);
      },
      watchServer(address: string) {
        const live = liveConnectionStore.getState();
        const server = live.servers.find((s) => s.address === address);
        const uniqueName =
          server?.name &&
          live.servers.filter((s) => s.name === server.name).length === 1;
        void setQuery({
          ...destination("live"),
          ...(uniqueName ? { name: server.name } : { address }),
        });
        unloadDemo();
        live.watchServer(address);
      },
      disconnectServer() {
        void setQuery(destination("live"));
        const live = liveConnectionStore.getState();
        if (live.role === "watcher") live.leaveServer();
        else live.disconnectServer();
        // Keep the last scene for the disconnected dialog's Rejoin action.
        engineStore.getState().setRecording(null);
      },
    };
  }, [setQuery]);
}
