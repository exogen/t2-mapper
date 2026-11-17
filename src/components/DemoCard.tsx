import { useState } from "react";
import { PiCassetteTapeFill, PiGlobe } from "react-icons/pi";
import { FaMicrophoneAlt } from "react-icons/fa";
import { FaPenToSquare } from "react-icons/fa6";
import { IoCalendarNumberOutline } from "react-icons/io5";
import { LuClock, LuLoaderCircle, LuUser, LuUsers } from "react-icons/lu";
import { MdVerified } from "react-icons/md";
import { TbLaurelWreathFilled } from "react-icons/tb";
import { useAppAccount } from "../state/appAccountStore";
import { editableDemoGame } from "../state/editableGame";
import {
  demoPlayerCount,
  isMapGeniusDemo,
  type DemoIndexEntry,
} from "../stream/demoIndex";
import {
  demoSummary,
  demoTitle,
  formatDuration,
  formatRecordedTime,
  recordedDayLabel,
} from "./demoFormat";
import { MissionPreviewTileArt } from "./PreviewTileArt";
import { RecordingMatchDetails } from "./RecordingMatchDetails";
import { RecordingDeleteButton } from "./RecordingDeleteButton";
import { useAppNavigation } from "./useAppNavigation";
import { GameDetailsDialog } from "./GameDetailsEditor";
import tileStyles from "./PreviewTile.module.css";
import styles from "./DemoCard.module.css";

/** A recording remains in the gallery while its playable metadata is prepared. */
export function PendingDemoCard({
  filename,
  status,
  progress,
  error = false,
  onDelete,
  deleting = false,
}: {
  filename: string;
  status: string;
  progress?: number | null;
  error?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <div
      className={`${tileStyles.Tile} ${styles.Card} ${styles.Pending}`}
      data-pending="true"
      data-action-count={Number(!!onDelete)}
      aria-busy={!error}
    >
      <div className={tileStyles.TilePreview}>
        <PiCassetteTapeFill
          className={tileStyles.TilePlaceholder}
          aria-hidden
        />
      </div>
      <div className={`${tileStyles.TileBody} ${styles.Body}`}>
        <span className={tileStyles.TileMapTitle} title={filename}>
          {filename}
        </span>
        <span
          className={styles.PendingStatus}
          role={error ? "alert" : "status"}
        >
          {!error && <LuLoaderCircle className={styles.Spinner} aria-hidden />}
          <span>{status}</span>
        </span>
        {progress != null && !error && (
          <progress
            className={styles.UploadProgress}
            max={1}
            value={progress}
            aria-label={`Upload progress: ${filename}`}
          />
        )}
      </div>
      {onDelete && (
        <div
          className={styles.Actions}
          role="group"
          aria-label="Demo actions"
          aria-busy={deleting}
        >
          <RecordingDeleteButton
            kind="demo"
            label={filename}
            deleting={deleting}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
}

export function DemoCard({
  demo,
  onDelete,
  deleting = false,
}: {
  demo: DemoIndexEntry;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const navigation = useAppNavigation();
  const admin = useAppAccount(
    (state) => state.status === "ready" && state.user?.role === "admin",
  );
  const [editing, setEditing] = useState(false);
  const actionCount = Number(admin) + Number(!!onDelete);
  const mission = demo.games[0]?.mission ?? "";
  const { matchups, matchTitle, gameTypes, tournament } = demoSummary(demo);
  return (
    <>
      <div
        className={`${tileStyles.Tile} ${styles.Card}`}
        data-action-count={actionCount}
        data-has-title={!!matchTitle}
      >
        <a
          href={`?demo=${encodeURIComponent(demo.filename)}`}
          className={styles.Link}
          onClick={(event) => {
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            navigation.selectDemo(demo.filename);
          }}
        >
          <MissionPreviewTileArt mission={mission}>
            <PiCassetteTapeFill className={tileStyles.TilePlaceholder} />
          </MissionPreviewTileArt>
          <span className={`${tileStyles.TileBody} ${styles.Body}`}>
            <span className={`${tileStyles.TileTitle} ${styles.Mission}`}>
              <span className={tileStyles.TileMapTitle}>{demoTitle(demo)}</span>
              {gameTypes.map((type) => (
                <span
                  key={type}
                  className={tileStyles.TileTag}
                  data-mission-type={type}
                >
                  {type}
                </span>
              ))}
              {tournament && (
                <TbLaurelWreathFilled
                  className={tileStyles.TileTournamentIcon}
                  title="Tournament mode"
                  aria-label="Tournament mode"
                />
              )}
              {demo.hasCommentary && (
                <FaMicrophoneAlt
                  className={tileStyles.TileCommentaryIcon}
                  title="Commentary track"
                  aria-label="Commentary track"
                />
              )}
            </span>
            <RecordingMatchDetails
              matchTitle={matchTitle}
              matchups={matchups}
            />
            <span className={tileStyles.TileDetails}>
              <span className={tileStyles.TileMetaItem}>
                <IoCalendarNumberOutline
                  className={tileStyles.TileMetaIcon}
                  title="Recorded on"
                  aria-hidden
                />
                <span className={tileStyles.TileMetaText}>
                  {recordedDayLabel(demo.recordedAt, demo.recordedAtTimezone)}{" "}
                  {formatRecordedTime(demo.recordedAt, demo.recordedAtTimezone)}
                </span>
              </span>
              <span className={tileStyles.TileDuration}>
                <LuClock
                  className={tileStyles.TileCompactMetaIcon}
                  aria-label="Duration"
                />
                {formatDuration(demo.durationMs)}
              </span>
              <span
                className={tileStyles.TileMetaItem}
                title={demo.players.join(", ") || undefined}
              >
                <LuUsers
                  className={tileStyles.TileCompactMetaIcon}
                  aria-label="Players"
                />
                {demoPlayerCount(demo)}
              </span>
            </span>
            <span className={tileStyles.TileSource}>
              {demo.recorder ? (
                <span className={tileStyles.TileMetaItem}>
                  {isMapGeniusDemo(demo) ? (
                    <MdVerified
                      className={tileStyles.TileMetaIcon}
                      title="Recorded by MapGenius"
                      aria-hidden
                    />
                  ) : (
                    <LuUser
                      className={tileStyles.TileRecorderIcon}
                      title="Recorded by"
                      aria-hidden
                    />
                  )}
                  <span
                    className={tileStyles.TileMetaText}
                    title={demo.recorder}
                  >
                    {demo.recorder}
                  </span>
                </span>
              ) : null}
              {demo.server && (
                <span className={tileStyles.TileMetaItem}>
                  <PiGlobe
                    className={tileStyles.TileMetaIcon}
                    title="Server"
                    aria-hidden
                  />
                  <span className={tileStyles.TileMetaText} title={demo.server}>
                    {demo.server}
                  </span>
                </span>
              )}
            </span>
          </span>
        </a>
        {actionCount > 0 && (
          <div
            className={styles.Actions}
            role="group"
            aria-label="Demo actions"
            aria-busy={deleting}
          >
            {admin && (
              <button
                type="button"
                className={styles.EditButton}
                title="Edit demo data"
                aria-label={`Edit demo data: ${matchTitle || demoTitle(demo)}`}
                aria-haspopup="dialog"
                disabled={deleting}
                onClick={() => setEditing(true)}
              >
                <FaPenToSquare className={styles.EditIcon} aria-hidden />
              </button>
            )}
            {onDelete && (
              <RecordingDeleteButton
                kind="demo"
                label={matchTitle || demoTitle(demo)}
                deleting={deleting}
                onDelete={onDelete}
              />
            )}
          </div>
        )}
      </div>
      {editing && admin && (
        <GameDetailsDialog
          game={editableDemoGame(demo.filename, demo.games, 0)}
          teams={[]}
          standalone
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
