/**
 * The date a Tribes 2 demo records about itself, in $DemoValues row 2:
 * the retail client's own style, "Aug-30-2026 3:52AM", minute precision
 * and no zone. A retail client writes its local time, which nothing in
 * the file identifies; the relay's recorder writes UTC (see
 * relay/demoWriter.ts), so only a relay demo's header can be placed on
 * a clock.
 */
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** The recorder name the relay's observer records under. */
export const RELAY_RECORDER_NAME = "MapGenius";

/** Whether a header date came from the relay, and so reads as UTC. */
export function isRelayRecording(recorderName: string | null): boolean {
  return recorderName?.toLowerCase() === RELAY_RECORDER_NAME.toLowerCase();
}

/**
 * A header date read as UTC, as an ISO instant; null when it does not
 * parse. Right for relay demos; a retail demo's header is the recorder's
 * local time, so callers check `isRelayRecording` first.
 */
export function parseDemoHeaderDate(value: string): string | null {
  const m = /^([A-Z][a-z]{2})-(\d{1,2})-(\d{4}) (\d{1,2}):(\d{2})(AM|PM)$/.exec(
    value.trim(),
  );
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  if (month < 0) return null;
  let hours = parseInt(m[4], 10) % 12;
  if (m[6] === "PM") hours += 12;
  const date = new Date(
    Date.UTC(
      parseInt(m[3], 10),
      month,
      parseInt(m[2], 10),
      hours,
      parseInt(m[5], 10),
    ),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
