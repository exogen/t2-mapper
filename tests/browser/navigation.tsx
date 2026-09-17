import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "../../src/components/AppProviders";
import { MapInspector } from "../../src/components/MapInspector";
import { useAppNavigation } from "../../src/components/useAppNavigation";
import { demoLoadStore } from "../../src/state/demoLoadStore";
import { liveConnectionStore } from "../../src/state/liveConnectionStore";
import { commandCircuitStore } from "../../src/state/commandCircuitStore";
import type {
  ClientMessage,
  ServerInfo,
  ServerMessage,
} from "../../relay/types";
import "../../src/main.css";

// Open /tests/browser/navigation.html on the existing dev server and run.
// Real React/nuqs scheduling and browser history, with controlled I/O. These
// timing regressions are not reproduced by synchronous query-setter mocks.

const nativeFetch = window.fetch.bind(window);
const downloads: {
  url: string;
  signal?: AbortSignal | null;
  release: () => void;
}[] = [];
window.fetch = (input, options) => {
  const url = String(input);
  if (url.endsWith("/index.json")) return Promise.resolve(Response.json([]));
  if (!url.includes("audit-") || !url.endsWith(".rec"))
    return nativeFetch(input, options);
  return new Promise((resolve) =>
    downloads.push({
      url,
      signal: options?.signal,
      release: () => resolve(new Response("late failure", { status: 500 })),
    }),
  );
};
const commands: ClientMessage[] = [];
const sockets: ControlledSocket[] = [];
let deferOpen = false;
let rejectWatchImmediately = false;
const servers: ServerInfo[] = ["Alpha", "Beta"].map((name) => ({
  address: `${name.toLowerCase()}:28000`,
  name,
  mod: "base",
  gameType: "CTF",
  mapName: "RiverDance",
  playerCount: 0,
  maxPlayers: 32,
  botCount: 0,
  ping: 12,
  buildVersion: 25034,
  passwordRequired: false,
  tournament: false,
  isPatrolled: false,
}));
class ControlledSocket {
  static OPEN = 1;
  readyState = 0;
  binaryType = "arraybuffer";
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror = null;
  constructor(_url: string) {
    sockets.push(this);
    if (!deferOpen) setTimeout(() => this.open(), 0);
  }
  open() {
    if (this.readyState !== 0) return;
    this.readyState = 1;
    this.onopen?.();
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  receive(value: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
  send(data: string) {
    const value = JSON.parse(data) as ClientMessage;
    commands.push(value);
    if (value.type === "listServers")
      queueMicrotask(() => this.receive({ type: "serverList", servers }));
    if (value.type === "wsPing")
      queueMicrotask(() => this.receive({ type: "wsPong", ts: value.ts }));
    if (value.type === "watchServer" && rejectWatchImmediately) {
      this.receive({
        type: "sessionStatus",
        address: value.address,
        status: "ended",
        message: "PASSWORD",
        watcherCount: 0,
      });
      return;
    }
    if (value.type === "watchServer")
      queueMicrotask(() =>
        this.receive({
          type: "sessionStatus",
          address: value.address,
          status: "connecting",
          watcherCount: 1,
        }),
      );
  }
}
window.WebSocket = ControlledSocket as unknown as typeof WebSocket;
history.replaceState(history.state, "", location.pathname + "?mode=demo");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, message: string) {
  for (let i = 0; i < 300; i++) {
    if (check()) return;
    await sleep(10);
  }
  throw new Error(
    message +
      " URL=" +
      location.search +
      " state=" +
      JSON.stringify({
        phase: demoLoadStore.getState().phase,
        watch: liveConnectionStore.getState().watchStatus,
        server: liveConnectionStore.getState().serverAddress,
      }),
  );
}
function assert(ok: unknown, message: string) {
  if (!ok) throw new Error(message);
}
const url = () => new URLSearchParams(location.search);
function navigate(search: string) {
  history.pushState(history.state, "", location.pathname + search);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
// Standalone entry point: reload the page when edited instead of Fast Refresh.
// eslint-disable-next-line react-refresh/only-export-components
function NavigationChecks() {
  const nav = useAppNavigation();
  const [results, setResults] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  async function run() {
    setRunning(true);
    setResults([]);
    const pass = (s: string) => setResults((old) => [...old, "PASS: " + s]);
    try {
      nav.selectDemo("audit-one.rec");
      const abandoned = downloads.at(-1)!;
      nav.demoIndex();
      await until(
        () =>
          url().get("demo") === null &&
          demoLoadStore.getState().phase === "idle",
        "eject pending download",
      );
      assert(abandoned.signal?.aborted, "download not aborted");
      abandoned.release();
      await sleep(80);
      assert(
        demoLoadStore.getState().phase === "idle",
        "late download resurrected error",
      );
      pass("Select and eject in one event; late failure ignored");

      nav.selectDemo("audit-a.rec");
      const a = downloads.at(-1)!;
      nav.selectDemo("audit-b.rec");
      const b = downloads.at(-1)!;
      await until(
        () => url().get("demo") === "audit-b.rec",
        "latest selection URL",
      );
      assert(
        a.signal?.aborted && !b.signal?.aborted,
        "wrong download canceled",
      );
      a.release();
      await sleep(80);
      assert(
        demoLoadStore.getState().requestedUrl?.endsWith("audit-b.rec"),
        "old request won",
      );
      nav.demoIndex();
      b.release();
      await until(
        () => demoLoadStore.getState().phase === "idle",
        "eject second",
      );
      pass("Two demo selections in one event; newest request wins");

      let releaseFile!: (value: ArrayBuffer) => void;
      nav.selectDemoFile({
        name: "local.rec",
        arrayBuffer: () => new Promise<ArrayBuffer>((r) => (releaseFile = r)),
      } as File);
      nav.serverBrowser();
      releaseFile(new ArrayBuffer(4));
      await until(
        () =>
          url().get("mode") === "live" &&
          demoLoadStore.getState().phase === "idle",
        "leave local file read",
      );
      pass("Switch mode while a local file is being read");

      nav.demoIndex();
      await until(() => url().get("mode") === "demo", "return demo index");
      deferOpen = true;
      const start = commands.length;
      nav.watchServer("alpha:28000");
      await sleep(100);
      sockets.at(-1)!.open();
      deferOpen = false;
      await until(
        () => commands.slice(start).some((m) => m.type === "watchServer"),
        "queued watch",
      );
      await sleep(100);
      assert(
        commands.slice(start).filter((m) => m.type === "watchServer").length ===
          1,
        "duplicate manual/auto join",
      );
      pass("Manual join before socket opens only sends one watch request");

      nav.watchServer("beta:28000");
      sockets.at(-1)!.receive({
        type: "sessionStatus",
        address: "alpha:28000",
        status: "ended",
        watcherCount: 0,
      });
      await until(
        () =>
          liveConnectionStore.getState().serverAddress === "beta:28000" &&
          (url().get("name") === "Beta" ||
            url().get("address") === "beta:28000"),
        "switch servers",
      );
      assert(
        liveConnectionStore.getState().watchStatus !== "ended",
        "old end killed new server",
      );
      pass("Late ending notice from previous server does not undo selection");

      nav.disconnectServer();
      await until(
        () => !url().get("name") && !url().get("address"),
        "disconnect URL",
      );
      assert(liveConnectionStore.getState().role === null, "disconnect role");
      pass("Disconnect clears server selection");

      navigate("?mode=demo&demo=audit-history.rec");
      await until(
        () =>
          demoLoadStore
            .getState()
            .requestedUrl?.endsWith("audit-history.rec") === true,
        "history demo load",
      );
      const historyDownload = downloads.at(-1)!;
      history.back();
      await until(
        () =>
          url().get("mode") === "live" &&
          demoLoadStore.getState().phase === "idle",
        "history back leaves demo",
      );
      assert(historyDownload.signal?.aborted, "history didn't abort download");
      history.forward();
      await until(
        () =>
          demoLoadStore
            .getState()
            .requestedUrl?.endsWith("audit-history.rec") === true &&
          downloads.at(-1) !== historyDownload,
        "history forward reloads same demo",
      );
      historyDownload.release();
      pass("Actual browser Back/Forward cancels and reloads demo");
      nav.serverBrowser();
      downloads.at(-1)!.release();
      await until(
        () => url().get("mode") === "live" && !url().get("demo"),
        "return browser",
      );

      navigate("?mode=live&name=Alpha");
      await until(
        () => liveConnectionStore.getState().serverAddress === "alpha:28000",
        "name auto join",
      );
      navigate("?mode=live&name=Beta");
      await until(
        () => liveConnectionStore.getState().serverAddress === "beta:28000",
        "history target change",
      );
      history.back();
      await until(
        () => liveConnectionStore.getState().serverAddress === "alpha:28000",
        "history previous server",
      );
      history.back();
      await until(
        () =>
          !url().get("name") && liveConnectionStore.getState().role === null,
        "history browser detaches",
      );
      history.forward();
      await until(
        () => liveConnectionStore.getState().serverAddress === "alpha:28000",
        "history rejoins server",
      );
      pass("Browser Back/Forward switches servers, detaches, and rejoins");

      nav.demoIndex();
      await until(
        () =>
          url().get("mode") === "demo" &&
          !liveConnectionStore.getState()._relay,
        "final cleanup",
      );
      commandCircuitStore.setState({ active: true });
      commandCircuitStore.setState({ active: false });
      await sleep(100);
      assert(
        !url().has("view") && !commandCircuitStore.getState().active,
        "rapid CC toggles left stale URL",
      );
      pass(
        "Two CC transitions before React renders leave the final URL correct",
      );

      nav.serverBrowser();
      await until(
        () => liveConnectionStore.getState().relayConnected,
        "open relay for fast failure",
      );
      const fastStart = commands.length;
      rejectWatchImmediately = true;
      nav.watchServer("alpha:28000");
      rejectWatchImmediately = false;
      await sleep(150);
      assert(
        !url().get("address") && !url().get("name"),
        "fast failure left URL selected " +
          JSON.stringify({
            url: location.search,
            status: liveConnectionStore.getState().watchStatus,
            commands: commands.slice(fastStart),
          }),
      );
      assert(
        commands.slice(fastStart).filter((m) => m.type === "watchServer")
          .length === 1,
        "fast failure retried automatically",
      );
      pass(
        "A join failure in the same event does not leave a stale URL or retry",
      );
      nav.demoIndex();
      await until(
        () => url().get("mode") === "demo",
        "cleanup after fast failure",
      );
      pass("All browser regression checks completed");
    } catch (error) {
      setResults((old) => [...old, "FAIL: " + error]);
    } finally {
      deferOpen = false;
      rejectWatchImmediately = false;
      nav.demoIndex();
      for (const download of downloads.splice(0)) download.release();
      setRunning(false);
    }
  }
  return (
    <aside
      style={{
        position: "fixed",
        zIndex: 99999,
        right: 10,
        top: 10,
        padding: 16,
        background: "#fff",
        color: "#000",
        maxWidth: 700,
      }}
    >
      <button disabled={running} onClick={run}>
        Run regression checks
      </button>
      <pre style={{ whiteSpace: "pre-wrap" }}>{results.join("\n")}</pre>
    </aside>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <NavigationChecks />
      <MapInspector />
    </AppProviders>
  </StrictMode>,
);
