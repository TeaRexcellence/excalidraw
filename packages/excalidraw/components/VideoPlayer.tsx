import React, { useRef, useEffect, useCallback } from "react";

import type { VideoOptions } from "@excalidraw/element/types";

interface VideoPlayerProps {
  src: string;
  videoOptions?: VideoOptions;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  videoOptions,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isSeekingRef = useRef(false);

  const startTime = videoOptions?.startTime ?? 0;
  const endTime = videoOptions?.endTime ?? null;
  const loop = videoOptions?.loop ?? false;
  const autoplay = videoOptions?.autoplay ?? false;
  const muted = videoOptions?.muted ?? false;

  // Only need custom handling if we have a custom end time
  const hasCustomEndTime = endTime !== null;

  // Handle time updates - for custom end time behavior
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !hasCustomEndTime || endTime === null || isSeekingRef.current) {
      return;
    }

    // Check if we've passed the end time
    if (video.currentTime >= endTime) {
      if (loop) {
        // Mark that we're seeking to prevent re-triggering
        isSeekingRef.current = true;
        video.currentTime = startTime;
        // Reset the flag after a brief delay
        requestAnimationFrame(() => {
          isSeekingRef.current = false;
        });
      } else {
        // Stop at end time
        video.pause();
      }
    }
  }, [hasCustomEndTime, endTime, loop, startTime]);

  // Handle video ended event - for looping with custom start time but no custom end time
  const handleEnded = useCallback(() => {
    const video = videoRef.current;
    if (!video || !loop || hasCustomEndTime) {
      return;
    }

    // If we have a custom start time, seek to it and play
    if (startTime > 0) {
      isSeekingRef.current = true;
      video.currentTime = startTime;
      video.play().catch(() => {});
      requestAnimationFrame(() => {
        isSeekingRef.current = false;
      });
    }
    // If no custom start time, native loop attribute handles it
  }, [loop, startTime, hasCustomEndTime]);

  // Set initial time and handle autoplay
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handleLoadedMetadata = () => {
      // Always set start time
      if (startTime > 0) {
        video.currentTime = startTime;
      }

      // Handle autoplay
      if (autoplay) {
        video.play().catch(() => {
          // If autoplay blocked, try muting and playing
          video.muted = true;
          video.play().catch(() => {
            // Still blocked, give up silently
          });
        });
      }
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);

    // If already loaded, handle immediately
    if (video.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };
  }, [src, startTime, autoplay]);

  // Use native loop when we have no custom end time and no custom start time
  const useNativeLoop = loop && startTime === 0 && !hasCustomEndTime;

  return (
    <video
      ref={videoRef}
      className="excalidraw__embeddable excalidraw__video-player"
      src={src}
      controls
      preload="metadata"
      loop={useNativeLoop}
      muted={muted}
      onTimeUpdate={hasCustomEndTime ? handleTimeUpdate : undefined}
      onEnded={loop && !useNativeLoop ? handleEnded : undefined}
    />
  );
};
