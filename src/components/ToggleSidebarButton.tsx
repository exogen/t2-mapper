import {
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPanelTopClose,
  LuPanelTopOpen,
} from "react-icons/lu";
import styles from "./ToggleSidebarButton.module.css";

export function ToggleSidebarButton({
  isOpen,
  orientation,
  onClick,
}: {
  isOpen: boolean;
  orientation: "left" | "top";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.Button}
      data-orientation={orientation}
      aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
      title={isOpen ? "Close sidebar" : "Open sidebar"}
      onClick={onClick}
    >
      {orientation === "top" ? (
        isOpen ? (
          <LuPanelTopClose />
        ) : (
          <LuPanelTopOpen />
        )
      ) : isOpen ? (
        <LuPanelLeftClose />
      ) : (
        <LuPanelLeftOpen />
      )}
    </button>
  );
}
