import { Fragment, useId, useState } from "react";
import { useStore } from "zustand";
import { DIRECTOR_LOOKAHEAD_SEC } from "../director/tunables";
import { useAppAccount } from "../state/appAccountStore";
import {
  applyLocalCastLookahead,
  useDirector,
} from "../state/demoDirectorStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { liveDirectorStore } from "../state/liveDirectorStore";
import { settingsStore } from "../state/settingsStore";
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

function LocalCastLookaheadRow() {
  const inputId = useId();
  const pending = useDirector((state) => state.localLookaheadPending);
  const error = useDirector((state) => state.localLookaheadError);
  const override = useStore(
    settingsStore,
    (state) => state.localCastLookaheadMs,
  );
  const [draft, setDraft] = useState<string | null>(null);
  const lookaheadMs = override ?? DIRECTOR_LOOKAHEAD_SEC * 1_000;

  return (
    <>
      <dt
        className={styles.LookaheadLabel}
        title="How far ahead the director can see in browser-generated casts."
      >
        <label htmlFor={inputId}>Lookahead</label>
      </dt>
      <dd className={styles.LookaheadValue}>
        <input
          id={inputId}
          className={styles.LookaheadInput}
          type="text"
          inputMode="decimal"
          aria-describedby={`${inputId}-unit`}
          disabled={pending}
          value={draft ?? lookaheadMs}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={async (event) => {
            const value = event.currentTarget.value.trim();
            const next = Number(value);
            if (
              /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) &&
              Number.isFinite(next) &&
              next !== lookaheadMs
            )
              await applyLocalCastLookahead(next);
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <span id={`${inputId}-unit`}>ms</span>
        {pending && <span role="status">Replanning…</span>}
        {error && <span role="alert">{error}</span>}
      </dd>
    </>
  );
}

function CastGeniusMetrics() {
  const metrics = useLiveSelector((state) => state.castMetrics);
  const plannerLeadMs = useLiveSelector((state) => state.castCoverageLeadMs);
  const shotLeadMs = useLiveSelector((state) => state.castShotLeadMs);

  return (
    <>
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
              {cpuPercent == null ? "—" : `${numberFormat.format(cpuPercent)}%`}{" "}
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
    </>
  );
}

export function DebugCastGeniusInfo() {
  const isAdmin = useAppAccount(
    (state) =>
      state.status === "ready" &&
      state.user?.role === "admin" &&
      state.pending !== "sign-out",
  );
  const demoPlan = useDirector((state) =>
    state.status === "playing" ? state.plan : null,
  );
  const planSource = useDirector((state) => state.planSource);
  const livePlaying = useStore(
    liveDirectorStore,
    (state) => state.status === "playing",
  );
  const liveLookaheadMs = useStore(
    liveDirectorStore,
    (state) => state.lookaheadMs,
  );
  let lookahead = "Not recorded";
  if (livePlaying) {
    lookahead =
      liveLookaheadMs == null
        ? "Not reported"
        : `${numberFormat.format(liveLookaheadMs)} ms`;
  } else if (demoPlan?.lookaheadSec === null) {
    lookahead = "Full recording";
  } else if (demoPlan?.lookaheadSec !== undefined) {
    lookahead = `${numberFormat.format(demoPlan.lookaheadSec * 1_000)} ms`;
  }
  const editable = !livePlaying && (demoPlan == null || planSource === "local");

  return (
    <fieldset className={`${fieldsetStyles.Fieldset} ${styles.Root}`}>
      <legend>CastGenius</legend>
      <dl>
        {editable ? (
          <LocalCastLookaheadRow />
        ) : (
          <>
            <dt title="How far ahead of a shot decision the director can see.">
              Lookahead
            </dt>
            <dd>{lookahead}</dd>
          </>
        )}
        {isAdmin && <CastGeniusMetrics />}
      </dl>
    </fieldset>
  );
}
