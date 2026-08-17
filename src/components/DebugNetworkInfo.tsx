import { useLiveSelector } from "../state/liveConnectionStore";
import { formatPing } from "../stringUtils";
import styles from "./DebugNetworkInfo.module.css";

/** Display host of a ws:// or wss:// relay URL. */
function relayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Network diagnostics for live mode in the debug panel: per-leg RTT
 * (browser↔relay and relay↔game server — the header shows only their
 * sum), plus which relay and game server the session is using, and the
 * raw connection status (including server-sent disconnect reasons).
 * Hidden entirely when no relay connection exists.
 */
export function DebugNetworkInfo() {
  const relayConnected = useLiveSelector((s) => s.relayConnected);
  const gameStatus = useLiveSelector((s) => s.gameStatus);
  const gameStatusMessage = useLiveSelector((s) => s.gameStatusMessage);
  const browserToRelayPing = useLiveSelector((s) => s.browserToRelayPing);
  const relayToGameServerPing = useLiveSelector((s) => s.relayToGameServerPing);
  const relayUrl = useLiveSelector((s) => s.relayUrl);
  const serverAddress = useLiveSelector((s) => s.serverAddress);

  if (!relayConnected && gameStatus == null) return null;

  return (
    <fieldset className={styles.Root}>
      <legend>Network info</legend>
      <dl>
        <dt>You to relay</dt>
        <dd>
          {browserToRelayPing != null ? formatPing(browserToRelayPing) : "—"}
        </dd>
        <dt>Relay to server</dt>
        <dd>
          {relayToGameServerPing != null
            ? formatPing(relayToGameServerPing)
            : "—"}
        </dd>
        {relayUrl && (
          <>
            <dt>Relay</dt>
            <dd>{relayHost(relayUrl)}</dd>
          </>
        )}
        {serverAddress && (
          <>
            <dt>Server</dt>
            <dd>{serverAddress}</dd>
          </>
        )}
        {gameStatus && (
          <>
            <dt>Status</dt>
            <dd>
              {gameStatus}
              {gameStatusMessage ? ` — ${gameStatusMessage}` : ""}
            </dd>
          </>
        )}
      </dl>
    </fieldset>
  );
}
