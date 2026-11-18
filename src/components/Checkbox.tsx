import type { ComponentProps } from "react";
import styles from "./ChoiceInput.module.css";

type CheckboxProps = Omit<ComponentProps<"input">, "type">;

/** Custom appearance with native labels, keyboard, form behavior, and refs. */
export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      {...props}
      type="checkbox"
      data-checkbox=""
      className={`${styles.Checkbox} ${className ?? ""}`}
    />
  );
}
