import { useEffect, useId, useState } from "react";
import { useStore } from "zustand";
import { readAssetPrefetchMetrics } from "../assetPrefetch";
import { readImageWorkMetrics } from "../assets/imageWorkQueue";
import {
  isResourceLookaheadMs,
  MAX_RESOURCE_LOOKAHEAD_MS,
  setPreference,
  settingsStore,
} from "../state/settingsStore";
import styles from "./DebugInfoPanel.module.css";
import fieldsetStyles from "./SidebarFieldset.module.css";

const SAMPLE_INTERVAL_MS = 500;
const numberFormat = new Intl.NumberFormat();
const maxLookahead = numberFormat.format(MAX_RESOURCE_LOOKAHEAD_MS);

function readResourceSample() {
  return {
    images: readImageWorkMetrics(),
    prefetch: readAssetPrefetchMetrics(),
  };
}

function ResourceLookahead() {
  const inputId = useId();
  const lookahead = useStore(
    settingsStore,
    (state) => state.resourceLookaheadMs,
  );
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <>
      <dt
        className={styles.LookaheadLabel}
        title={`How far ahead to load assets for demos and clips. Enter 0 to turn this off. Maximum ${maxLookahead} ms.`}
      >
        <label htmlFor={inputId}>Resource lookahead</label>
      </dt>
      <dd className={styles.LookaheadValue}>
        <input
          id={inputId}
          className={styles.LookaheadInput}
          type="text"
          inputMode="numeric"
          pattern="[0-9]+"
          aria-describedby={`${inputId}-unit`}
          value={draft ?? lookahead}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onBlur={(event) => {
            const value = event.currentTarget.value.trim();
            const next = Number(value);
            if (/^\d+$/.test(value) && isResourceLookaheadMs(next)) {
              setPreference("resourceLookaheadMs", next);
            }
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <span id={`${inputId}-unit`}>ms</span>
      </dd>
    </>
  );
}

export function DebugResources({ showLookahead }: { showLookahead: boolean }) {
  const [{ images, prefetch }, setSample] = useState(readResourceSample);

  useEffect(() => {
    // Sample the loading queues even when the renderer is idle.
    const timer = setInterval(
      () => setSample(readResourceSample()),
      SAMPLE_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <fieldset className={`${fieldsetStyles.Fieldset} ${styles.Root}`}>
      <legend>Resources</legend>
      <dl>
        {showLookahead && <ResourceLookahead />}
        {prefetch.recordedWaitingJobs != null && (
          <>
            <dt title="Discovered lookahead jobs waiting for a prefetch slot">
              Lookahead queued
            </dt>
            <dd>
              {numberFormat.format(prefetch.recordedWaitingJobs)}
              {prefetch.recordedScanning ? " · scanning" : ""}
            </dd>
          </>
        )}
        <dt title="In-flight asset jobs, including their dependencies">
          Asset prefetch
        </dt>
        <dd>
          {prefetch.activeJobs} / {prefetch.concurrency} slots
        </dd>
        <dt>Images queued</dt>
        <dd
          title={`Peak of ${numberFormat.format(images.peakQueued)} queued since page load`}
        >
          <div>{numberFormat.format(images.queuedCritical)} critical</div>
          <div>{numberFormat.format(images.queuedDemand)} demand</div>
          <div>{numberFormat.format(images.queuedSpeculative)} speculative</div>
        </dd>
        <dt title="Images currently being fetched or decoded">Image work</dt>
        <dd>
          {images.active} / {images.concurrency} slots
        </dd>
      </dl>
    </fieldset>
  );
}
