import type { HudStyle, MatchHudStyle } from "../state/settingsStore";
import { Checkbox } from "./Checkbox";
import { Select, type SelectOption } from "./Select";
import styles from "./HudControls.module.css";

interface HudControlProps<T extends string> {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  value: T;
  onValueChange: (value: T) => void;
  disabled?: boolean;
}

function HudControl<T extends string>({
  id,
  label,
  checked,
  onCheckedChange,
  value,
  onValueChange,
  disabled,
  options,
}: HudControlProps<T> & { label: string; options: readonly SelectOption[] }) {
  return (
    <div className={styles.Field}>
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
      />
      <label htmlFor={id}>{label}</label>
      <Select
        id={`${id}Style`}
        aria-label={`${label} style`}
        value={value}
        onChange={(next) => onValueChange(next as T)}
        disabled={disabled}
        options={options}
      />
    </div>
  );
}

export function ChatHudControl(props: HudControlProps<HudStyle>) {
  return (
    <HudControl
      {...props}
      label="Chat HUD"
      options={[
        { value: "solid", label: "Solid" },
        { value: "transparent", label: "Transparent" },
      ]}
    />
  );
}

export function MatchHudControl(props: HudControlProps<MatchHudStyle>) {
  return (
    <HudControl
      {...props}
      label="Match HUD"
      options={[
        { value: "classic", label: "Classic" },
        { value: "broadcast", label: "Broadcast" },
      ]}
    />
  );
}
