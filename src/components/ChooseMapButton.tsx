import { RiLandscapeFill } from "react-icons/ri";
import styles from "./Button.module.css";

export function ChooseMapButton({
  isActive = false,
  onClick,
}: {
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.Button}
      onClick={onClick}
      data-active={isActive}
    >
      <RiLandscapeFill />
      <span className={styles.ButtonLabel}>Explore</span>
      <span className={styles.ButtonHint}>Browse maps</span>
    </button>
  );
}
