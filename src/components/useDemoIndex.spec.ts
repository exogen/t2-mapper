import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { refreshDemoIndex } from "./useDemoIndex";

it.each([false, true])(
  "refreshes publication metadata after an older request, with cached data: %s",
  async (cached) => {
    const client = new QueryClient();
    const queryKey = ["demoIndex"];
    const published = [{ filename: "published.rec" }];
    let finishOldRequest!: (data: typeof published) => void;
    const oldResponse = new Promise<typeof published>((resolve) => {
      finishOldRequest = resolve;
    });
    let oldSignal: AbortSignal | undefined;
    const queryFn = vi.fn(({ signal }: { signal: AbortSignal }) => {
      if (oldSignal) return Promise.resolve(published);
      oldSignal = signal;
      // Even a transport that ignores cancellation must not overwrite fresh data.
      return oldResponse;
    });
    if (cached) client.setQueryData(queryKey, []);
    const observer = new QueryObserver(client, {
      queryKey,
      queryFn,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      const original = client.refetchQueries({ queryKey });
      expect(queryFn).toHaveBeenCalledOnce();

      await refreshDemoIndex(client);

      expect(oldSignal?.aborted).toBe(true);
      expect(queryFn).toHaveBeenCalledTimes(2);
      expect(client.getQueryData(queryKey)).toEqual(published);

      finishOldRequest([]);
      await oldResponse;
      await original;
      expect(client.getQueryData(queryKey)).toEqual(published);
    } finally {
      unsubscribe();
      client.clear();
    }
  },
);
