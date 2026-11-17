import * as RadixAccordion from "@radix-ui/react-accordion";
import { ReactNode } from "react";
import { IoCaretForward } from "react-icons/io5";
import styles from "./Accordion.module.css";

export function AccordionGroup(props: RadixAccordion.AccordionMultipleProps) {
  return <RadixAccordion.Root className={styles.AccordionGroup} {...props} />;
}

export function Accordion({
  value,
  label,
  children,
  noPadding = false,
  disabled = false,
  title,
}: {
  value: string;
  label: ReactNode;
  children: ReactNode;
  noPadding?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <RadixAccordion.Item value={value} disabled={disabled}>
      <RadixAccordion.Trigger
        className={styles.Trigger}
        title={title}
        {...(disabled && { "aria-expanded": false })}
      >
        <IoCaretForward className={styles.TriggerIcon} /> {label}
      </RadixAccordion.Trigger>
      {!disabled && (
        <RadixAccordion.Content className={styles.Content}>
          <div className={noPadding ? styles.BodyNoPadding : styles.Body}>
            {children}
          </div>
        </RadixAccordion.Content>
      )}
    </RadixAccordion.Item>
  );
}
