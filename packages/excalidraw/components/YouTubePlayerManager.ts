/**
 * YouTube IFrame Player API manager.
 *
 * Loads the YouTube IFrame API script once, creates YT.Player instances
 * for each YouTube embed, and provides a clean interface for controlling
 * playback, seeking, loop/start/end-time enforcement, and state tracking.
 *
 * No API key is required — the IFrame Player API is free and client-side.
 */

import { YOUTUBE_STATES } from "@excalidraw/common";

import type { VideoOptions } from "@excalidraw/element/types";

// Re-export for consumers
export { YOUTUBE_STATES };

// ── YT type declarations (minimal, no @types/youtube needed) ──────────

interface YTPlayerEvent {
  data: number;
  target: YTPlayer;
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(volume: number): void;
  getVolume(): number;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

interface YTPlayerConstructor {
  new (
    elementId: string,
    options?: {
      events?: {
        onReady?: (event: YTPlayerEvent) => void;
        onStateChange?: (event: YTPlayerEvent) => void;
        onError?: (event: YTPlayerEvent) => void;
      };
    },
  ): YTPlayer;
}

interface YTNamespace {
  Player: YTPlayerConstructor;
  PlayerState: Record<string, number>;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// ── API loading ───────────────────────────────────────────────────────

let apiReady = false;
let apiLoading = false;
const apiReadyCallbacks: Array<() => void> = [];

const loadAPI = (): Promise<void> => {
  if (apiReady) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    apiReadyCallbacks.push(resolve);

    if (apiLoading) {
      return;
    }
    apiLoading = true;

    // Already loaded by another script?
    if (window.YT?.Player) {
      apiReady = true;
      flushCallbacks();
      return;
    }

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      apiReady = true;
      prev?.();
      flushCallbacks();
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.head.appendChild(script);
  });
};

const flushCallbacks = () => {
  const cbs = apiReadyCallbacks.splice(0);
  cbs.forEach((cb) => cb());
};

// ── Player state ──────────────────────────────────────────────────────

/** Shared map of element-id → YouTube player state (for external reads) */
export const youtubePlayerStates = new Map<
  string,
  (typeof YOUTUBE_STATES)[keyof typeof YOUTUBE_STATES]
>();

type StateListener = (state: number) => void;

const players = new Map<string, YTPlayer>();
const optionsCache = new Map<string, VideoOptions>();
const listeners = new Map<string, Set<StateListener>>();

// Track which elements are currently initializing to prevent double-init
const initializing = new Set<string>();

// ── State change handler (loop / end-time / notifications) ────────────

const handleStateChange = (elementId: string, state: number) => {
  youtubePlayerStates.set(
    elementId,
    state as (typeof YOUTUBE_STATES)[keyof typeof YOUTUBE_STATES],
  );

  // Notify registered listeners
  listeners.get(elementId)?.forEach((fn) => fn(state));

  // Loop on ENDED
  if (state === YOUTUBE_STATES.ENDED) {
    const opts = optionsCache.get(elementId);
    const player = players.get(elementId);
    if (opts?.loop && player) {
      const startSec = opts.startTime || 0;
      player.seekTo(startSec, true);
      player.playVideo();
    }
  }
};

// ── End-time enforcement via polling ──────────────────────────────────

const endTimeIntervals = new Map<string, number>();

const startEndTimePolling = (elementId: string) => {
  stopEndTimePolling(elementId);

  // Poll at 100ms for precise end-time enforcement.
  // We check slightly before the end time (0.15s buffer) so we can
  // loop/pause BEFORE YouTube reaches the end and shows suggestions.
  const interval = window.setInterval(() => {
    const opts = optionsCache.get(elementId);
    const player = players.get(elementId);
    if (!opts?.endTime || !player) {
      stopEndTimePolling(elementId);
      return;
    }

    try {
      const current = player.getCurrentTime();
      if (current >= opts.endTime - 0.15) {
        if (opts.loop) {
          player.seekTo(opts.startTime || 0, true);
          player.playVideo();
        } else {
          player.pauseVideo();
          stopEndTimePolling(elementId);
        }
      }
    } catch {
      // Player might be destroyed
      stopEndTimePolling(elementId);
    }
  }, 100);

  endTimeIntervals.set(elementId, interval);
};

const stopEndTimePolling = (elementId: string) => {
  const id = endTimeIntervals.get(elementId);
  if (id !== undefined) {
    clearInterval(id);
    endTimeIntervals.delete(elementId);
  }
};

// ── Public API ────────────────────────────────────────────────────────

/**
 * Initialize a YouTube player for an element's iframe.
 * Call after the iframe is rendered in the DOM (e.g., from onLoad).
 * Safe to call multiple times — skips if player already exists.
 */
export const initPlayer = async (
  elementId: string,
  iframe: HTMLIFrameElement,
  videoOptions?: VideoOptions,
): Promise<YTPlayer | null> => {
  // Don't init for non-YouTube iframes
  if (!iframe.src.includes("youtube")) {
    return null;
  }

  // If player already exists, just update options and return it
  const existing = players.get(elementId);
  if (existing) {
    if (videoOptions) {
      updateOptions(elementId, videoOptions);
    }
    return existing;
  }

  // Prevent double-init from rapid onLoad calls
  if (initializing.has(elementId)) {
    return null;
  }
  initializing.add(elementId);

  if (videoOptions) {
    optionsCache.set(elementId, videoOptions);
  }

  // YT.Player needs the iframe to have an id attribute
  if (!iframe.id) {
    iframe.id = `yt-${elementId}`;
  }

  await loadAPI();

  // After async gap, check if element was cleaned up
  if (!initializing.has(elementId)) {
    return null;
  }

  return new Promise((resolve) => {
    try {
      const player = new window.YT!.Player(iframe.id, {
        events: {
          onReady: () => {
            initializing.delete(elementId);
            players.set(elementId, player);
            youtubePlayerStates.set(elementId, YOUTUBE_STATES.UNSTARTED);

            const opts = optionsCache.get(elementId);

            // Apply mute setting before autoplay (browsers require muted for autoplay)
            if (opts?.muted) {
              player.mute();
            }

            // Explicit autoplay via JS API — more reliable than URL param
            if (opts?.autoplay) {
              player.playVideo();
            }

            // If there's a start time and video hasn't started yet, seek to it
            if (opts?.startTime && opts.startTime > 0) {
              player.seekTo(opts.startTime, true);
            }

            // Start end-time polling if needed
            if (opts?.endTime != null) {
              startEndTimePolling(elementId);
            }

            resolve(player);
          },
          onStateChange: (event) => {
            handleStateChange(elementId, event.data);

            // Start/stop end-time polling based on play state
            const opts = optionsCache.get(elementId);
            if (opts?.endTime != null) {
              if (
                event.data === YOUTUBE_STATES.PLAYING ||
                event.data === YOUTUBE_STATES.BUFFERING
              ) {
                startEndTimePolling(elementId);
              } else {
                stopEndTimePolling(elementId);
              }
            }
          },
          onError: () => {
            initializing.delete(elementId);
            resolve(null);
          },
        },
      });
    } catch {
      initializing.delete(elementId);
      resolve(null);
    }
  });
};

/**
 * Clean up a player instance.
 * Does NOT call player.destroy() — that removes the iframe from the DOM,
 * which would break React's rendering. We just drop our references and
 * let the iframe continue to exist as a plain embed.
 */
export const destroyPlayer = (elementId: string) => {
  stopEndTimePolling(elementId);
  initializing.delete(elementId);
  players.delete(elementId);
  optionsCache.delete(elementId);
  youtubePlayerStates.delete(elementId);
};

/** Update cached video options and apply live changes to the player */
export const updateOptions = (
  elementId: string,
  videoOptions: VideoOptions,
) => {
  const prevOpts = optionsCache.get(elementId);
  optionsCache.set(elementId, videoOptions);

  const player = players.get(elementId);
  if (!player) {
    return;
  }

  // Apply mute change immediately
  if (prevOpts?.muted !== videoOptions.muted) {
    if (videoOptions.muted) {
      player.mute();
    } else {
      player.unMute();
    }
  }

  // Update end-time polling
  const state = youtubePlayerStates.get(elementId);
  if (videoOptions.endTime != null) {
    if (
      state === YOUTUBE_STATES.PLAYING ||
      state === YOUTUBE_STATES.BUFFERING
    ) {
      startEndTimePolling(elementId);
    }
  } else {
    stopEndTimePolling(elementId);
  }
};

/** Get the player instance for an element (if initialized) */
export const getPlayer = (elementId: string): YTPlayer | null => {
  return players.get(elementId) || null;
};

/** Play */
export const play = (elementId: string) => {
  players.get(elementId)?.playVideo();
};

/** Pause */
export const pause = (elementId: string) => {
  players.get(elementId)?.pauseVideo();
};

/** Toggle play/pause — respects start time for unstarted/ended videos */
export const togglePlay = (elementId: string): boolean => {
  const player = players.get(elementId);
  if (!player) {
    return false;
  }
  const state = player.getPlayerState();
  if (state === YOUTUBE_STATES.PLAYING || state === YOUTUBE_STATES.BUFFERING) {
    player.pauseVideo();
    return false;
  }
  // When starting from scratch or after video ended, seek to start time
  const opts = optionsCache.get(elementId);
  if (
    opts?.startTime &&
    opts.startTime > 0 &&
    (state === YOUTUBE_STATES.UNSTARTED ||
      state === YOUTUBE_STATES.ENDED ||
      state === -1)
  ) {
    player.seekTo(opts.startTime, true);
  }
  player.playVideo();
  return true;
};

/** Seek to position */
export const seekTo = (elementId: string, seconds: number) => {
  players.get(elementId)?.seekTo(seconds, true);
};

/** Mute / unmute */
export const setMuted = (elementId: string, muted: boolean) => {
  const player = players.get(elementId);
  if (player) {
    if (muted) {
      player.mute();
    } else {
      player.unMute();
    }
  }
};

/** Get current playback time */
export const getCurrentTime = (elementId: string): number => {
  try {
    return players.get(elementId)?.getCurrentTime() ?? 0;
  } catch {
    return 0;
  }
};

/** Get video duration */
export const getDuration = (elementId: string): number | null => {
  try {
    const d = players.get(elementId)?.getDuration();
    return d && d > 0 ? d : null;
  } catch {
    return null;
  }
};

/** Get current player state */
export const getState = (elementId: string): number => {
  return youtubePlayerStates.get(elementId) ?? YOUTUBE_STATES.UNSTARTED;
};

/** Subscribe to state changes. Returns unsubscribe function. */
export const onStateChange = (
  elementId: string,
  listener: StateListener,
): (() => void) => {
  let set = listeners.get(elementId);
  if (!set) {
    set = new Set();
    listeners.set(elementId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) {
      listeners.delete(elementId);
    }
  };
};
