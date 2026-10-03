import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import type { StreamRecording } from "../stream/types";
import { connectAudioPlayback } from "./audioPlayback";
import { createAudioPlaybackFade } from "./audioPlaybackFade";

// Defer device transitions independently of transport changes. Chrome can freeze
// its audio clock if opposite operations overlap, even while state says running.
class TestAudioContext extends EventTarget {
  state: AudioContextState = "suspended";
  currentTime = 10;
  gain = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
  pending: Array<{ state: AudioContextState; resolve: () => void }> = [];
  createGain = () => ({ gain: this.gain }) as unknown as GainNode;
  resume = vi.fn(() => this.request("running"));
  suspend = vi.fn(() => this.request("suspended"));
  request(state: AudioContextState) {
    if (this.pending.some((request) => request.state !== state)) {
      throw new Error("Overlapping opposite audio device transitions");
    }
    return new Promise<void>((resolve) => {
      this.pending.push({ state, resolve });
    });
  }
  async finish(index = 0, emitEvent = true) {
    const [pending] = this.pending.splice(index, 1);
    const previous = this.state;
    this.state = pending.state;
    pending.resolve();
    if (emitEvent && previous !== this.state) {
      this.dispatchEvent(new Event("statechange"));
    }
    await Promise.resolve();
  }
  async flush() {
    let steps = 0;
    while (this.pending.length) {
      if (++steps > 100) throw new Error("Audio state reconciliation loop");
      await this.finish();
    }
  }
}

const state = () => engineStore.getState();
let demo: StreamRecording;
let context: TestAudioContext;
let fade: ReturnType<typeof createAudioPlaybackFade>;
let connection: ReturnType<typeof connectAudioPlayback>;

function connect() {
  connection = connectAudioPlayback(context as unknown as AudioContext, fade);
}

beforeEach(() => {
  demo = { source: "demo", duration: 100 } as StreamRecording;
  state().setRecording(demo);
  state().setPlaybackStatus("playing");
  gameEntityStore.setState({ dataSource: "demo" });
  context = new TestAudioContext();
  fade = createAudioPlaybackFade(context as unknown as BaseAudioContext);
});
afterEach(() => {
  connection?.dispose();
  state().setRecording(null);
  state().setPlaybackStatus("stopped");
  gameEntityStore.setState({ dataSource: null });
});

describe("audio transport synchronization", () => {
  it("mutes and resumes a seek completed in the same turn, before any React effect", async () => {
    connect();
    await context.flush();
    const ramps = context.gain.linearRampToValueAtTime.mock.calls.length;
    state().seekPlayback(20);
    expect(context.suspend).toHaveBeenCalledOnce();
    expect(context.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
    state().completePlaybackSeek(demo, state().playback.seekNonce);
    await context.flush();
    expect(context.state).toBe("running");
    expect(
      context.gain.linearRampToValueAtTime.mock.calls.length,
    ).toBeGreaterThan(ramps);
  });

  it("keeps replacement seeks muted and honors pause during reconstruction", async () => {
    connect();
    await context.flush();
    state().seekPlayback(20);
    const replacedNonce = state().playback.seekNonce;
    state().seekPlayback(30);
    state().togglePlayback(demo);
    const resumes = context.resume.mock.calls.length;
    state().completePlaybackSeek(demo, replacedNonce);
    state().completePlaybackSeek(demo, state().playback.seekNonce);
    await context.flush();
    expect(context.state).toBe("suspended");
    expect(context.resume).toHaveBeenCalledTimes(resumes);
  });

  it("does not unmute when a blocked resume settles after pause", async () => {
    connect();
    state().setPlaybackStatus("paused");
    await context.finish(); // The older resume finally unlocks.
    expect(context.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    await context.flush();
    expect(context.state).toBe("suspended");
  });

  it("starts the fade after resume even without a separate statechange event", async () => {
    connect();
    expect(context.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    await context.finish(0, false);
    expect(context.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      1,
      10.05,
    );
  });

  it.each(["playing", "paused"] as const)(
    "settles rapid toggles in the latest state: %s",
    async (status) => {
      connect();
      for (let i = 0; i < 9; i++) state().togglePlayback(demo);
      state().setPlaybackStatus(status);
      await context.flush();
      expect(context.state).toBe(
        status === "playing" ? "running" : "suspended",
      );
      if (status === "paused") {
        expect(context.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
      } else {
        expect(context.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
          1,
          10.05,
        );
      }
    },
  );

  it("silences a new stopped demo before its scene switches from map mode", async () => {
    state().setPlaybackStatus("stopped");
    gameEntityStore.setState({ dataSource: "map" });
    connect();
    await context.flush();
    expect(context.resume).not.toHaveBeenCalled();
    expect(context.state).toBe("suspended");
  });

  it("suspends on recording unload even if transport still says playing", async () => {
    connect();
    await context.flush();
    state().setRecording(null);
    expect(state().playback.status).toBe("playing");
    await context.flush();
    expect(context.state).toBe("suspended");
  });

  it("silences teardown and ignores pending completions and later store changes", async () => {
    connect();
    connection.dispose();
    await context.flush();
    state().togglePlayback(demo);
    state().togglePlayback(demo);
    connection.reconcile();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.state).toBe("suspended");
    expect(context.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it("does not let a previous mount's completion mute a remounted player", async () => {
    connect();
    connection.dispose();
    connect();
    await context.flush();
    expect(context.state).toBe("running");
    expect(context.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      1,
      10.05,
    );
  });

  it("waits for a departing map's suspend before starting the Watch view", async () => {
    state().setRecording(null);
    gameEntityStore.setState({ dataSource: "map" });
    connect();
    await context.flush();
    connection.dispose();
    expect(context.pending.map((request) => request.state)).toEqual([
      "suspended",
    ]);

    state().setRecording({ source: "live" } as StreamRecording);
    state().setPlaybackStatus("playing");
    gameEntityStore.setState({ dataSource: "live" });
    connect();
    expect(context.resume).toHaveBeenCalledOnce();
    await context.finish(); // The old view has finally released the device.
    expect(context.resume).toHaveBeenCalledTimes(2);
    await context.flush();
    expect(context.state).toBe("running");
  });

  it("ignores a late cleanup from a view replaced before it unmounted", async () => {
    connect();
    await context.flush();
    const oldConnection = connection;
    connect();
    await context.flush();
    const suspends = context.suspend.mock.calls.length;
    oldConnection.dispose();
    oldConnection.reconcile();
    oldConnection.unlock();
    expect(context.suspend).toHaveBeenCalledTimes(suspends);
    expect(context.state).toBe("running");
  });

  it("unlocks stopped playback silently before suspending the device", async () => {
    state().setPlaybackStatus("stopped");
    connect();
    connection.unlock();
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.suspend).not.toHaveBeenCalled();
    await context.flush();
    expect(context.state).toBe("suspended");
    expect(context.gain.linearRampToValueAtTime).not.toHaveBeenCalled();

    // Once unlocked, clicks while paused need not wake the device again.
    connection.unlock();
    expect(context.resume).toHaveBeenCalledOnce();
    state().setPlaybackStatus("playing");
    await context.flush();
    expect(context.state).toBe("running");
  });

  it("retries a blocked resume in the gesture without racing a newer pause", async () => {
    connect(); // Blocked by autoplay.
    state().setPlaybackStatus("paused");
    connection.unlock(); // A fresh gesture must be allowed to retry resume.
    expect(context.resume).toHaveBeenCalledTimes(2);
    expect(context.suspend).not.toHaveBeenCalled();
    await context.finish(1); // The gesture's promise settles first.
    expect(context.suspend).not.toHaveBeenCalled();
    expect(context.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    await context.flush();
    expect(context.state).toBe("suspended");
  });

  it("resumes after a browser suspension while playback is still playing", async () => {
    connect();
    await context.flush();
    context.state = "suspended";
    context.dispatchEvent(new Event("statechange"));
    expect(context.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10);
    await context.flush();
    expect(context.state).toBe("running");
    expect(context.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      1,
      10.05,
    );
  });

  it("still runs ambience in map mode while transport is stopped", async () => {
    state().setRecording(null);
    state().setPlaybackStatus("stopped");
    gameEntityStore.setState({ dataSource: "map" });
    connect();
    await context.flush();
    expect(context.state).toBe("running");
  });
});
