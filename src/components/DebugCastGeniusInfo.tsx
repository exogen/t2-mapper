import { Fragment } from "react";
import { useAppAccount } from "../state/appAccountStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import styles from "./DebugInfoPanel.module.css";
import fieldsetStyles from "./SidebarFieldset.module.css";

const numberFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});
const signedFormat = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
const bytesPerMiB = 1024 ** 2;

function formatLead(ms: number | null): string {
  return ms == null ? "Not yet sampled" : `${signedFormat.format(ms)} ms`;
}

function CastGeniusMetrics() {
  const metrics = useLiveSelector((state) => state.castMetrics);
  const plannerLeadMs = useLiveSelector((state) => state.castCoverageLeadMs);
  const shotLeadMs = useLiveSelector((state) => state.castShotLeadMs);

  return (
    <fieldset className={`${fieldsetStyles.Fieldset} ${styles.Root}`}>
      <legend>CastGenius</legend>
      <dl>
        <dt>Active workers</dt>
        <dd>
          {metrics
            ? numberFormat.format(metrics.activeWorkers)
            : "Not yet sampled"}
        </dd>
        {metrics?.workers.map(
          ({ gameId, epoch, cpuPercent, rssBytes }, index) => (
            <Fragment key={`${gameId}:${epoch}`}>
              <dt title={`Game ${gameId} · Epoch ${epoch}`}>
                Worker {index + 1}
              </dt>
              <dd>
                {cpuPercent == null
                  ? "—"
                  : `${numberFormat.format(cpuPercent)}%`}{" "}
                CPU
                {" · "}
                {rssBytes == null
                  ? "—"
                  : `${numberFormat.format(rssBytes / bytesPerMiB)} MiB`}{" "}
                RSS
              </dd>
            </Fragment>
          ),
        )}
        <dt title="How far the planner is ahead of or behind the current CastGenius picture.">
          Planner lead
        </dt>
        <dd>{formatLead(plannerLeadMs)}</dd>
        <dt title="Positive values arrived early. Negative values arrived late.">
          Shot arrival
        </dt>
        <dd>{formatLead(shotLeadMs)}</dd>
      </dl>
    </fieldset>
  );
}

export function DebugCastGeniusInfo() {
  const isAdmin = useAppAccount(
    (state) =>
      state.status === "ready" &&
      state.user?.role === "admin" &&
      state.pending !== "sign-out",
  );
  return isAdmin ? <CastGeniusMetrics /> : null;
}
