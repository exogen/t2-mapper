import { useDemoRecording } from "./DemoProvider";
import { useEngineSelector } from "../state";
import styles from "./PlayerHUD.module.css";

function HealthBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className={styles.HealthBar}>
      <div className={styles.BarFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

function EnergyBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className={styles.EnergyBar}>
      <div className={styles.BarFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ChatWindow() {
  return <div className={styles.ChatWindow} />;
}

function WeaponSlots() {
  return <div className={styles.WeaponSlots} />;
}

function ToolBelt() {
  return <div className={styles.ToolBelt} />;
}

function Reticle() {
  return <div className={styles.Reticle} />;
}

function TeamStats() {
  return <div className={styles.TeamStats} />;
}

function Compass() {
  return <div className={styles.Compass} />;
}

export function PlayerHUD() {
  const recording = useDemoRecording();
  const streamSnapshot = useEngineSelector(
    (state) => state.playback.streamSnapshot,
  );

  if (!recording) return null;
  const status = streamSnapshot?.status;
  if (!status) return null;

  return (
    <div className={styles.PlayerHUD}>
      <ChatWindow />
      <Compass />
      <HealthBar value={status.health} />
      <EnergyBar value={status.energy} />
      <TeamStats />
      <Reticle />
      <ToolBelt />
      <WeaponSlots />
    </div>
  );
}
