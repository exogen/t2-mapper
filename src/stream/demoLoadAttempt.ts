/** One replaceable read/download attempt. Installed recordings and timeline
 * scans have longer, independent lifetimes and are not owned here. */
export class DemoLoadAttempt {
  readonly abortController = new AbortController();
  private current = true;
  private cancelDownload?: (preserveRecording: boolean) => void;

  get isCurrent(): boolean {
    return this.current;
  }

  onDownloadCancel(cancel: (preserveRecording: boolean) => void): () => void {
    if (!this.current) {
      cancel(false);
      return () => {};
    }
    this.cancelDownload = cancel;
    return () => {
      if (this.cancelDownload === cancel) this.cancelDownload = undefined;
    };
  }

  cancel(preserveRecording: boolean): void {
    if (!this.current) return;
    // Invalidate before abort: synchronous abort handlers must see a stale load.
    this.current = false;
    this.abortController.abort();
    const cancel = this.cancelDownload;
    this.cancelDownload = undefined;
    cancel?.(preserveRecording);
  }
}
