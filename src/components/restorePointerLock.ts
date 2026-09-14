/** Restore a temporarily released lock, unless the surrounding UI changes
 * before the browser completes the request. Returns a cancellation callback. */
export function restorePointerLock(
  target: Element,
  canRestore: () => boolean,
): () => void {
  const doc = target.ownerDocument;
  let canceled = false;
  const cancel = () => {
    canceled = true;
  };
  if (!target.isConnected || !canRestore()) return cancel;

  const cleanup = () => {
    doc.removeEventListener("pointerlockchange", onChange);
    doc.removeEventListener("pointerlockerror", cleanup);
  };
  const finish = () => {
    cleanup();
    if (
      doc.pointerLockElement === target &&
      (canceled || !target.isConnected || !canRestore())
    ) {
      doc.exitPointerLock();
    }
  };
  const onChange = () => {
    // An earlier unlock's queued event can arrive before our lock does.
    if (doc.pointerLockElement === target) finish();
  };
  try {
    const request = target.requestPointerLock();
    if (request) {
      // The promise belongs to this request; document events may describe
      // an earlier request that is still completing.
      void request.then(finish, cleanup);
    } else {
      // Legacy browsers return void and report completion asynchronously.
      doc.addEventListener("pointerlockchange", onChange);
      doc.addEventListener("pointerlockerror", cleanup);
    }
  } catch {
    cleanup();
  }
  return cancel;
}
