/**
 * Settle with `task`, or reject with the signal's reason as soon as it aborts,
 * even if `task` is slow to acknowledge cancellation.
 */
export async function abortable<T>(
  task: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  let cancel!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(signal.reason);
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([task, aborted]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
