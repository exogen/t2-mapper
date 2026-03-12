import { useEffect, useRef, useState } from "react";
import { FaVolumeUp, FaVolumeMute } from "react-icons/fa";
import { useQuery } from "@tanstack/react-query";
import { loadMission, getUrlForPath, RESOURCE_ROOT_URL } from "../loaders";
import { getStandardTextureResourceKey } from "../manifest";
import {
  GuiMarkup,
  filterMissionStringByMode,
  hasGuiMarkup,
} from "./GuiMarkup";
import type * as AST from "../torqueScript/ast";
import styles from "./MapInfoDialog.module.css";

function useParsedMission(name: string) {
  return useQuery({
    queryKey: ["parsedMission", name],
    queryFn: () => loadMission(name),
  });
}

function getMissionGroupProps(ast: AST.Program): Record<string, string> {
  for (const node of ast.body) {
    if (node.type !== "ObjectDeclaration") continue;
    const { instanceName, body } = node;
    if (
      instanceName &&
      instanceName.type === "Identifier" &&
      instanceName.name.toLowerCase() === "missiongroup"
    ) {
      const props: Record<string, string> = {};
      for (const item of body) {
        if (item.type !== "Assignment") continue;
        const { target, value } = item;
        if (target.type === "Identifier" && value.type === "StringLiteral") {
          props[target.name.toLowerCase()] = value.value;
        }
      }
      return props;
    }
  }
  return {};
}

function getBitmapUrl(
  bitmap: string | null,
  missionName: string,
): string | null {
  // Try bitmap from pragma comment first (single-player missions use this)
  if (bitmap) {
    try {
      const key = getStandardTextureResourceKey(`textures/gui/${bitmap}`);
      return getUrlForPath(key);
    } catch {
      /* expected */
    }
  }
  // Fall back to Load_<MissionName>.png convention (multiplayer missions)
  try {
    const key = getStandardTextureResourceKey(
      `textures/gui/Load_${missionName}`,
    );
    return getUrlForPath(key);
  } catch {
    /* expected */
  }
  return null;
}

/**
 * Renders a preview image bypassing browser color management, matching how
 * Tribes 2 displayed these textures (raw pixel values, no gamma conversion).
 * Many T2 preview PNGs embed an incorrect gAMA chunk (22727 = gamma 4.4
 * instead of the correct 45455 = gamma 2.2), which causes browsers to
 * over-darken them. `colorSpaceConversion: "none"` ignores gAMA/ICC data.
 */
function RawPreviewImage({
  src,
  alt,
  className = styles.PreviewImage,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    fetch(src)
      .then((r) => r.blob())
      .then((blob) => createImageBitmap(blob, { colorSpaceConversion: "none" }))
      .then(
        (bitmap) =>
          new Promise<Blob | null>((resolve) => {
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
            bitmap.close();
            canvas.toBlob(resolve);
          }),
      )
      .then((blob) => {
        if (cancelled || !blob) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [src]);

  if (!objectUrl) return null;

  return <img src={objectUrl} alt={alt} className={className} />;
}

function MusicPlayer({ track }: { track: string }) {
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const url = `${RESOURCE_ROOT_URL}music/${track.toLowerCase()}.mp3`;

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => setAvailable(false));
    }
  };

  return (
    <div className={styles.MusicTrack} data-playing={playing}>
      <audio
        ref={audioRef}
        src={url}
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setAvailable(false)}
      />
      <span className={styles.MusicTrackName}>{track}</span>
      {available && (
        <button
          className={styles.MusicButton}
          onClick={toggle}
          aria-label={playing ? "Pause music" : "Play music"}
        >
          {playing ? <FaVolumeUp /> : <FaVolumeMute />}
        </button>
      )}
    </div>
  );
}

export function MapInfoDialog({
  onClose,
  missionName,
  missionType,
}: {
  onClose: () => void;
  missionName: string;
  missionType: string;
}) {
  const { data: parsedMission } = useParsedMission(missionName);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    try {
      document.exitPointerLock();
    } catch {
      /* expected */
    }
  }, []);

  // While open: block keyboard events from reaching drei, and handle close keys.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        onClose();
        return; // let Cmd-K propagate to open the mission search
      }
      e.stopImmediatePropagation();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, [onClose]);

  const missionGroupProps = parsedMission
    ? getMissionGroupProps(parsedMission.ast)
    : {};
  const bitmapUrl = parsedMission
    ? getBitmapUrl(parsedMission.bitmap, missionName)
    : null;
  const displayName = parsedMission?.displayName ?? missionName;
  const typeKey = missionType.toLowerCase();
  const isSinglePlayer = typeKey === "singleplayer";

  const musicTrack = missionGroupProps["musictrack"];

  const missionString = parsedMission?.missionString
    ? filterMissionStringByMode(parsedMission.missionString, missionType)
    : null;

  // Split quote into body text and attribution line.
  // If the quote contains GUI markup tags, render through GuiMarkup instead.
  const rawQuote = parsedMission?.missionQuote?.trim() ?? "";
  const quoteHasMarkup = hasGuiMarkup(rawQuote);
  let quoteText = "";
  let quoteAttrib = "";
  if (!quoteHasMarkup) {
    for (const line of rawQuote.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.match(/^--[^-]/)) {
        quoteAttrib = trimmed.replace(/^-+\s*/, "").trim();
      } else if (trimmed) {
        quoteText += (quoteText ? "\n" : "") + trimmed;
      }
    }
  }

  return (
    <div className={styles.Overlay} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles.Dialog}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Map Information"
        tabIndex={-1}
      >
        <div className={styles.Body}>
          <div className={styles.Left}>
            {bitmapUrl && isSinglePlayer && (
              <RawPreviewImage
                key={bitmapUrl}
                className={styles.PreviewImageFloating}
                src={bitmapUrl}
                alt={`${displayName} preview`}
              />
            )}
            <h1 className={styles.Title}>{displayName}</h1>
            <div className={styles.MapMeta}>
              {parsedMission?.planetName && (
                <span className={styles.MapPlanet}>
                  {parsedMission.planetName}
                </span>
              )}
            </div>

            {quoteHasMarkup ? (
              <blockquote className={styles.MapQuote}>
                <GuiMarkup markup={rawQuote} />
              </blockquote>
            ) : quoteText ? (
              <blockquote className={styles.MapQuote}>
                <p>{quoteText}</p>
                {quoteAttrib && <cite>— {quoteAttrib}</cite>}
              </blockquote>
            ) : null}

            {parsedMission?.missionBlurb && (
              <div className={styles.MapBlurb}>
                {hasGuiMarkup(parsedMission.missionBlurb) ? (
                  <GuiMarkup markup={parsedMission.missionBlurb.trim()} />
                ) : (
                  parsedMission.missionBlurb.trim()
                )}
              </div>
            )}

            {missionString && missionString.trim() && (
              <div className={styles.Section}>
                <GuiMarkup markup={missionString} />
              </div>
            )}

            {parsedMission?.missionBriefing && (
              <div className={styles.Section}>
                <h2 className={styles.SectionTitle}>Mission Briefing</h2>
                <GuiMarkup markup={parsedMission.missionBriefing} />
              </div>
            )}

            {musicTrack && <MusicPlayer track={musicTrack} />}
          </div>

          {bitmapUrl && !isSinglePlayer && (
            <RawPreviewImage
              key={bitmapUrl}
              src={bitmapUrl}
              alt={`${displayName} preview`}
            />
          )}
        </div>

        <div className={styles.Footer}>
          <button className={styles.CloseButton} onClick={onClose}>
            Close
          </button>
          <span className={styles.Hint}>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
