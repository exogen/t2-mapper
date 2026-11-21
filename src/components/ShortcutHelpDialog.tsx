import { Dialog, DialogDismiss, DialogHeading } from "@ariakit/react";
import { Fragment, useId } from "react";
import { BsFillLightningChargeFill, BsShiftFill } from "react-icons/bs";
import { LuUsers, LuX } from "react-icons/lu";
import { MdSwipe } from "react-icons/md";
import {
  PiCassetteTapeFill,
  PiMouseLeftClickFill,
  PiMouseMiddleClickFill,
  PiMouseRightClickFill,
  PiMouseScroll,
} from "react-icons/pi";
import { RiLandscapeFill } from "react-icons/ri";
import { buildShortcutHelp } from "./shortcutHelp";
import type { AppMode } from "./useQueryParams";
import { useShortcutHelpAvailability } from "./useShortcutHelpAvailability";
import styles from "./ShortcutHelpDialog.module.css";

const modeBadges = {
  map: { label: "Explore mode", Icon: RiLandscapeFill },
  demo: { label: "Demo mode", Icon: PiCassetteTapeFill },
  live: { label: "Live mode", Icon: BsFillLightningChargeFill },
  replay: { label: "Shared replay", Icon: LuUsers },
};

const shortcutIcons = new Map([
  ["Shift", BsShiftFill],
  ["Left click", PiMouseLeftClickFill],
  ["Middle click", PiMouseMiddleClickFill],
  ["Right click", PiMouseRightClickFill],
  ["Scroll", PiMouseScroll],
  ["Drag", MdSwipe],
]);

export function ShortcutHelpDialog({
  mode,
  picker,
  wasPointerLocked,
  onClose,
}: {
  mode: AppMode;
  picker?: "map" | "demo";
  wasPointerLocked: boolean;
  onClose: () => void;
}) {
  const availability = useShortcutHelpAvailability(wasPointerLocked, picker);
  const groups = buildShortcutHelp(mode, availability);
  const descriptionId = useId();
  const modeId = useId();
  const { label, Icon: ModeIcon } = modeBadges[mode];

  return (
    <Dialog
      open
      aria-describedby={`${modeId} ${descriptionId}`}
      className={styles.Dialog}
      data-mode={mode}
      backdrop={<div className={styles.Overlay} />}
      onClose={onClose}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header className={styles.Header}>
        <div className={styles.TitleRow}>
          <DialogHeading className={styles.Title}>
            Keyboard and mouse shortcuts
          </DialogHeading>
          <span className={styles.ModeBadge} id={modeId}>
            <ModeIcon aria-hidden="true" />
            {label}
          </span>
          <span id={descriptionId} className={styles.ScreenReaderOnly}>
            Dimmed shortcuts are currently unavailable.
          </span>
        </div>
        <DialogDismiss className={styles.Close} aria-label="Close shortcuts">
          <LuX aria-hidden="true" />
        </DialogDismiss>
      </header>
      <div className={styles.Content} tabIndex={0}>
        <div className={styles.Columns}>
          {groups.map(({ title, rows }) => (
            <section key={title} className={styles.Section}>
              <h2 className={styles.SectionTitle}>{title}</h2>
              <table className={styles.Table} aria-label={title}>
                <tbody>
                  {rows.map(({ label, keys }) => (
                    <tr key={label}>
                      <th
                        scope="row"
                        className={styles.Action}
                        data-unavailable={
                          keys.every((binding) => !binding.active) || undefined
                        }
                      >
                        {label}
                      </th>
                      <td className={styles.BindingsCell}>
                        <div className={styles.Bindings}>
                          {keys.map(({ parts, active }) => (
                            <kbd
                              key={parts.join("+")}
                              className={styles.Key}
                              data-unavailable={!active || undefined}
                              title={
                                parts.some((part) => shortcutIcons.has(part))
                                  ? parts.join(" + ")
                                  : undefined
                              }
                            >
                              {parts.map((part, index) => {
                                const Icon = shortcutIcons.get(part);
                                return (
                                  <Fragment key={index}>
                                    {index > 0 && (
                                      <span className={styles.ScreenReaderOnly}>
                                        {" + "}
                                      </span>
                                    )}
                                    {Icon ? (
                                      <>
                                        <Icon
                                          className={
                                            part === "Shift"
                                              ? undefined
                                              : styles.MouseIcon
                                          }
                                          aria-hidden="true"
                                        />
                                        <span
                                          className={styles.ScreenReaderOnly}
                                        >
                                          {part}
                                        </span>
                                      </>
                                    ) : (
                                      part
                                    )}
                                  </Fragment>
                                );
                              })}
                              {!active && (
                                <span className={styles.ScreenReaderOnly}>
                                  {" "}
                                  (unavailable)
                                </span>
                              )}
                            </kbd>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
