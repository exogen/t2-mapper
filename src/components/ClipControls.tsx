import { Dialog, DialogHeading } from "@ariakit/react";
import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { TbMovie } from "react-icons/tb";
import { FaStop } from "react-icons/fa";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import {
  sampleClipTake,
  type ClipHudSettings,
  type ClipTake,
  type ClipView,
} from "../../relay/clipTypes";
import { canStartClipRecording, clipStore } from "../state/clipStore";
import { useAppAccount, appAccountStore } from "../state/appAccountStore";
import { useDemoLoad, demoLoadStore } from "../state/demoLoadStore";
import { publishedDemoFilename } from "../state/editableGame";
import { useEngineSelector, engineStore } from "../state/engineStore";
import { setPreference, settingsStore } from "../state/settingsStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import {
  readClipStatus,
  clipRefetchInterval,
  saveClip,
  clipShareUrl,
} from "../stream/clipApi";
import { demoSha256 } from "../stream/demoCheckpoints";
import { useAppNavigation } from "./useAppNavigation";
import { ClipControlsContext } from "./clipControlsContext";
import { ChatHudControl, MatchHudControl } from "./HudControls";
import { ClipRecordingHelpDialog } from "./ClipRecordingHelpDialog";
import { ClipSavedDialog } from "./ClipSavedDialog";
import { Select } from "./Select";
import { useInputAction } from "./InputControls";
import { Accordion, AccordionGroup } from "./Accordion";
import { RangeSlider } from "./RangeSlider";
import {
  canSmoothClipCamera,
  type ClipSmoothingLevel,
} from "../stream/clipSmoothing";
import buttonStyles from "./Button.module.css";
import playbackStyles from "./DemoPlaybackControls.module.css";
import inspectorStyles from "./InspectorControls.module.css";
import styles from "./ClipControls.module.css";

interface ClipSaveOptions {
  draft: ClipTake;
  take: ClipTake;
  start: number;
  end: number;
  hud: ClipHudSettings;
}

function selectClipHud({
  showChat,
  chatHudStyle,
  showMatchHud,
  matchHudStyle,
}: ClipHudSettings): ClipHudSettings {
  return { showChat, chatHudStyle, showMatchHud, matchHudStyle };
}

function useClipControlsState() {
  return useStoreWithEqualityFn(
    clipStore,
    (state) => {
      const sample = state.active
        ? sampleClipTake(state.active, state.playheadMs)
        : null;
      return {
        ...state,
        elapsedMs: Math.floor(state.elapsedMs / 100) * 100,
        playheadMs: Math.floor(state.playheadMs / 100) * 100,
        recordedRate: sample?.rate ?? 1,
        cameraSmoothingAvailable:
          sample === null ||
          canSmoothClipCamera(sample.cameraMode, sample.firstPersonPose),
      };
    },
    shallow,
  );
}

export function ClipRecordButton() {
  return useContext(ClipControlsContext).recordButton;
}

export function ClipEditorPanel() {
  return useContext(ClipControlsContext).editorPanel;
}

export function ClipControlsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const clip = useClipControlsState();
  const account = useAppAccount((state) => state);
  const source = publishedDemoFilename(useDemoLoad((state) => state.sourceUrl));
  const recording = useEngineSelector((state) => state.playback.recording);
  const captureBlocked = useEngineSelector(
    (state) => state.playback.status === "seeking" || state.playback.seekFailed,
  );
  const sourceReady = useEngineSelector(
    (state) =>
      state.playback.downloadComplete && state.playback.demoBuffer !== null,
  );
  const captureReady = useStreamSnapshot(() => canStartClipRecording());
  const hud = useStoreWithEqualityFn(settingsStore, selectClipHud, shallow);
  const [saved, setSaved] = useState<ClipView | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRecordingHelp, setShowRecordingHelp] = useState(false);
  const recordButtonRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const transfer = useRef<AbortController | null>(null);
  const request = useRef<{
    take: ClipTake;
    start: number;
    end: number;
    hudKey: string;
    id: string;
  } | null>(null);
  const owner = account.user?.discordId;

  useEffect(() => () => transfer.current?.abort(), []);
  useEffect(() => {
    transfer.current?.abort();
    transfer.current = null;
    request.current = null;
    const currentClip = clipStore.getState();
    if (currentClip.recording || currentClip.draft) currentClip.discard();
    setSaved(null);
    setShowSaved(false);
    setShowRecordingHelp(false);
    setError(null);
    setSaving(false);
  }, [owner, source]);

  const status = useQuery({
    queryKey: ["savedClip", saved?.id],
    enabled: saved?.state === "processing",
    queryFn: ({ signal }) => readClipStatus(saved!.id, signal),
    refetchInterval: clipRefetchInterval,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const savedClip = status.data ?? saved;
  const readyClipOwner =
    savedClip?.state === "ready" ? savedClip.ownerDiscordId : null;
  useEffect(() => {
    if (readyClipOwner)
      void queryClient.invalidateQueries({
        queryKey: ["userClips", readyClipOwner],
      });
  }, [queryClient, readyClipOwner]);
  const eligible =
    account.status === "ready" &&
    !!owner &&
    !account.pending &&
    !!source &&
    recording?.source === "demo";
  const draft = clip.draft;
  const showRecordButton = eligible && (!clip.active || !!draft);
  const recordDisabled =
    saving ||
    showSaved ||
    !!draft ||
    showRecordingHelp ||
    (!clip.recording && (captureBlocked || !captureReady));
  const recordAvailable = showRecordButton && !recordDisabled;

  function toggleRecording() {
    if (!recordAvailable) return;
    setError(null);
    setSaved(null);
    setCopied(false);
    if (clip.recording) clip.stop();
    else if (settingsStore.getState().hasSeenClipRecordingHelp)
      startRecording();
    else setShowRecordingHelp(true);
  }

  function startRecording() {
    if (!clip.start()) return false;
    setPreference("sidebarOpen", true);
    return true;
  }

  useInputAction("recordClip", toggleRecording);

  function updateSaveHud(patch: Partial<ClipHudSettings>) {
    settingsStore.setState(patch);
  }

  function closeSaved() {
    if (transfer.current) return;
    setShowSaved(false);
    setSaved(null);
    setCopied(false);
    setError(null);
  }

  function discardClip() {
    transfer.current?.abort();
    clip.discard();
    setError(null);
  }

  async function copyLink() {
    if (!savedClip) return;
    setCopied(false);
    setError(null);
    try {
      await navigator.clipboard.writeText(clipShareUrl(savedClip));
      setCopied(true);
    } catch {
      setError("Select and copy the clip link to share it.");
    }
  }

  async function save(options: ClipSaveOptions, requestId: string) {
    if (!owner || !eligible || transfer.current) return;
    const {
      draft: rawDraft,
      take: previewTake,
      start: trimStartMs,
      end: trimEndMs,
      hud,
    } = options;
    const take = { ...previewTake, hud };
    const controller = new AbortController();
    transfer.current = controller;
    clip.pause();
    setSaved(null);
    setShowSaved(true);
    setCopied(false);
    setSaving(true);
    setError(null);
    try {
      const snapshot = engineStore.getState().playback;
      if (!snapshot.downloadComplete || !snapshot.demoBuffer)
        throw new Error(
          "Wait for the source demo to finish downloading before saving.",
        );
      const sourceSha256 = await demoSha256(snapshot.demoBuffer);
      controller.signal.throwIfAborted();
      const stillCurrent = () => {
        const current = engineStore.getState().playback;
        const currentClip = clipStore.getState();
        return (
          current.recording === snapshot.recording &&
          current.demoBuffer === snapshot.demoBuffer &&
          publishedDemoFilename(demoLoadStore.getState().sourceUrl) ===
            take.sourceDemo &&
          appAccountStore.getState().user?.discordId === owner &&
          currentClip.draft === rawDraft &&
          currentClip.active === previewTake &&
          currentClip.trimStartMs === trimStartMs &&
          currentClip.trimEndMs === trimEndMs
        );
      };
      if (!stillCurrent())
        throw new Error(
          "The clip, demo, or account changed. Review the clip before saving.",
        );
      const result = await saveClip(
        { requestId, take, trimStartMs, trimEndMs, sourceSha256 },
        owner,
        AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]),
      );
      controller.signal.throwIfAborted();
      if (!stillCurrent())
        throw new Error(
          "The clip, demo, or account changed. Review the clip before saving.",
        );
      setSaved(result);
      clipStore.getState().discard();
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "The clip could not be saved.",
        );
    } finally {
      // The server may have accepted a save even if its response was lost.
      void queryClient.invalidateQueries({ queryKey: ["userClips", owner] });
      if (transfer.current === controller) {
        transfer.current = null;
        setSaving(false);
      }
    }
  }

  function saveDraft() {
    const current = clipStore.getState();
    if (!current.draft || !current.active) return;
    const options: ClipSaveOptions = {
      draft: current.draft,
      take: current.active,
      start: current.trimStartMs,
      end: current.trimEndMs,
      hud: selectClipHud(settingsStore.getState()),
    };
    const { take, start, end, hud } = options;
    const hudKey = JSON.stringify(hud);
    if (
      !request.current ||
      request.current.take !== take ||
      request.current.start !== start ||
      request.current.end !== end ||
      request.current.hudKey !== hudKey
    )
      request.current = { take, start, end, hudKey, id: crypto.randomUUID() };
    void save(options, request.current.id);
  }

  const discardButton = (
    <button
      type="button"
      className={styles.DiscardButton}
      aria-label="Discard clip"
      title="Discard clip"
      disabled={saving}
      onClick={discardClip}
    >
      Discard
    </button>
  );

  const draftActions =
    draft && eligible ? (
      <div className={styles.DraftActions}>
        {discardButton}
        <button
          type="button"
          className={styles.ActionButton}
          disabled={saving || !sourceReady}
          aria-busy={saving || undefined}
          title={
            !sourceReady ? "Wait for the demo to finish downloading" : undefined
          }
          onClick={saveDraft}
        >
          Save clip
        </button>
      </div>
    ) : null;

  const recordButton = showRecordButton ? (
    <button
      ref={recordButtonRef}
      type="button"
      className={styles.RecordButton}
      data-recording={clip.recording || undefined}
      disabled={recordDisabled}
      onClick={toggleRecording}
      aria-label={clip.recording ? "Stop clip recording" : "Record clip"}
      aria-keyshortcuts={recordAvailable ? "R" : undefined}
      title={
        clip.recording
          ? "Stop clip recording (R)"
          : captureBlocked || !captureReady
            ? "Wait for the demo to finish preparing"
            : "Record clip (R)"
      }
    >
      <TbMovie className={styles.RecordIcon} aria-hidden="true" />
      <span className={buttonStyles.ButtonLabel}>Record clip</span>
    </button>
  ) : null;

  const smoothingLabels = ["Off", "Low", "High"] as const;
  const displayedSmoothingLevel = clip.cameraSmoothingAvailable
    ? clip.smoothingLevel
    : 0;
  const editorPanel =
    eligible && (clip.recording || draft) ? (
      <AccordionGroup type="multiple" defaultValue={["clip"]}>
        <Accordion value="clip" label="Clip recorder">
          <div className={styles.EditorPanel} data-clip-editor-panel="">
            {clip.recording && (
              <>
                <p className={styles.RecordingStatus} role="status">
                  Recording… {(clip.elapsedMs / 1000).toFixed(1)}s / 60s
                </p>
                <button
                  type="button"
                  className={styles.RecordButton}
                  data-recording
                  onClick={toggleRecording}
                  disabled={recordDisabled}
                  title="Stop clip recording (R)"
                >
                  <FaStop
                    className={`${styles.RecordIcon} ${styles.StopIcon}`}
                    aria-hidden
                  />
                  <span className={buttonStyles.ButtonLabel}>
                    Stop recording
                  </span>
                </button>
              </>
            )}
            <div
              className={styles.SmoothingField}
              title={
                clip.cameraSmoothingAvailable
                  ? undefined
                  : "First-person and original views keep their recorded camera movement."
              }
            >
              <label
                id="clipCameraSmoothing-label"
                htmlFor="clipCameraSmoothing"
              >
                Camera smoothing
              </label>
              <RangeSlider
                id="clipCameraSmoothing"
                aria-labelledby="clipCameraSmoothing-label"
                aria-valuetext={smoothingLabels[displayedSmoothingLevel]}
                min={0}
                max={smoothingLabels.length - 1}
                value={displayedSmoothingLevel}
                disabled={!draft || saving || !clip.cameraSmoothingAvailable}
                onValueChange={(value) =>
                  clip.setSmoothingLevel(value as ClipSmoothingLevel)
                }
                className={styles.SmoothingSlider}
              />
              <div className={styles.SmoothingStops} aria-hidden>
                {smoothingLabels.map((label, index) => (
                  <span
                    key={label}
                    data-active={index === displayedSmoothingLevel}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className={styles.HudOptions}>
              <p className={inspectorStyles.Description}>
                Which HUDs should viewers see?
              </p>
              <ChatHudControl
                id="clipShowChatHud"
                checked={hud.showChat}
                onCheckedChange={(showChat) => updateSaveHud({ showChat })}
                value={hud.chatHudStyle ?? "solid"}
                onValueChange={(chatHudStyle) =>
                  updateSaveHud({ chatHudStyle })
                }
                disabled={saving}
              />
              <MatchHudControl
                id="clipShowMatchHud"
                checked={hud.showMatchHud}
                onCheckedChange={(showMatchHud) =>
                  updateSaveHud({ showMatchHud })
                }
                value={hud.matchHudStyle}
                onValueChange={(matchHudStyle) =>
                  updateSaveHud({ matchHudStyle })
                }
                disabled={saving}
              />
            </div>
            {draftActions}
          </div>
        </Accordion>
      </AccordionGroup>
    ) : null;

  return (
    <ClipControlsContext
      value={{
        recordButton,
        recordAvailable,
        editorPanel,
        saving,
      }}
    >
      {children}
      {showRecordingHelp && eligible && (
        <ClipRecordingHelpDialog
          finalFocus={recordButtonRef}
          onCancel={() => setShowRecordingHelp(false)}
          disabled={
            captureBlocked ||
            !captureReady ||
            saving ||
            !!draft ||
            !!clip.active
          }
          onStart={() => {
            setShowRecordingHelp(false);
            if (startRecording()) {
              setPreference("hasSeenClipRecordingHelp", true);
            }
          }}
        />
      )}
      {!showSaved && (clip.error || (draft && error)) && (
        <Dialog
          open
          className={styles.Panel}
          onClose={() => {
            clipStore.setState({ error: null });
            setError(null);
          }}
          aria-label="Clip error"
        >
          <DialogHeading className={styles.Title}>Clip error</DialogHeading>
          <p role="alert" className={styles.Error}>
            {clip.error ?? error}
          </p>
          <button
            type="button"
            className={styles.UtilityButton}
            onClick={() => {
              clipStore.setState({ error: null });
              setError(null);
            }}
          >
            Close
          </button>
        </Dialog>
      )}
      {showSaved && (
        <ClipSavedDialog
          clip={savedClip}
          saving={saving}
          error={error}
          statusError={status.error}
          copied={copied}
          onCopy={() => void copyLink()}
          onClose={closeSaved}
          onRetry={
            status.error
              ? () => void status.refetch()
              : !savedClip && error
                ? saveDraft
                : undefined
          }
          retryDisabled={!savedClip && (!draft || !sourceReady)}
        />
      )}
    </ClipControlsContext>
  );
}

export function ClipPlaybackControls() {
  const clip = useClipControlsState();
  const { exitClip } = useAppNavigation();
  if (!clip.active || clip.draft) return null;
  return (
    <div className={styles.Root}>
      {clip.active && (
        <div className={styles.Viewing}>
          <div className={playbackStyles.Field}>
            <label htmlFor="clipPlaybackSpeed">Speed</label>
            <Select
              id="clipPlaybackSpeed"
              aria-label="Clip playback speed"
              className={playbackStyles.Speed}
              disabled
              value={String(clip.recordedRate)}
              onChange={() => {}}
              options={[
                {
                  value: String(clip.recordedRate),
                  label: `${clip.recordedRate}×`,
                },
              ]}
            />
          </div>
          <button
            type="button"
            className={styles.ExitButton}
            onClick={exitClip}
          >
            Exit clip
          </button>
        </div>
      )}
    </div>
  );
}
