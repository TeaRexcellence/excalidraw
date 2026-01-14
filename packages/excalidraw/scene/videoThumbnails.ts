import {
  isEmbeddableElement,
  getYouTubeVideoId,
  getYouTubeThumbnailUrl,
  isDirectVideoUrl,
  stripVideoOptionsFromUrl,
  captureVideoFrame,
} from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

/**
 * Fetch an image URL and convert to data URL (avoids CORS issues on canvas export)
 */
async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    return blobToDataUrl(blob);
  } catch {
    return null;
  }
}

/**
 * Convert a Blob to a data URL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Load an image and wait for it to be ready
 */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    const timeout = setTimeout(() => {
      if (!img.complete) {
        resolve(null);
      }
    }, 10000);

    img.onload = () => {
      clearTimeout(timeout);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };

    img.src = src;
  });
}

/**
 * Prefetch and preload video thumbnails as HTMLImageElements.
 * Must be called BEFORE rendering (canvas drawing is synchronous).
 *
 * Returns a Map of element ID -> preloaded HTMLImageElement
 */
export async function prefetchVideoThumbnails(
  elements: readonly ExcalidrawElement[],
): Promise<Map<string, HTMLImageElement>> {
  const thumbnails = new Map<string, HTMLImageElement>();

  const embeddables = elements.filter(isEmbeddableElement);

  await Promise.all(
    embeddables.map(async (element) => {
      const url = element.link;
      if (!url) {
        return;
      }

      try {
        let thumbnailDataUrl: string | null = null;

        // YouTube: Fetch thumbnail and convert to data URL
        const youtubeId = getYouTubeVideoId(url);
        if (youtubeId) {
          thumbnailDataUrl = await fetchAsDataUrl(
            getYouTubeThumbnailUrl(youtubeId, "hqdefault"),
          );
        }
        // Direct/local video: Capture frame
        else if (isDirectVideoUrl(url)) {
          const cleanUrl = stripVideoOptionsFromUrl(url);
          const blob = await captureVideoFrame(cleanUrl);
          if (blob) {
            thumbnailDataUrl = await blobToDataUrl(blob);
          }
        }

        if (thumbnailDataUrl) {
          const img = await loadImage(thumbnailDataUrl);
          if (img) {
            thumbnails.set(element.id, img);
          }
        }
      } catch {
        // Silently fail - placeholder will be shown
      }
    }),
  );

  return thumbnails;
}

/**
 * Prefetch video thumbnails as data URL strings (for SVG embedding).
 * Returns a Map of element ID -> data URL string
 */
export async function prefetchVideoThumbnailsAsDataUrls(
  elements: readonly ExcalidrawElement[],
): Promise<Map<string, string>> {
  const thumbnails = new Map<string, string>();

  const embeddables = elements.filter(isEmbeddableElement);

  await Promise.all(
    embeddables.map(async (element) => {
      const url = element.link;
      if (!url) {
        return;
      }

      try {
        let thumbnailDataUrl: string | null = null;

        // YouTube: Fetch thumbnail and convert to data URL
        const youtubeId = getYouTubeVideoId(url);
        if (youtubeId) {
          thumbnailDataUrl = await fetchAsDataUrl(
            getYouTubeThumbnailUrl(youtubeId, "hqdefault"),
          );
        }
        // Direct/local video: Capture frame
        else if (isDirectVideoUrl(url)) {
          const cleanUrl = stripVideoOptionsFromUrl(url);
          const blob = await captureVideoFrame(cleanUrl);
          if (blob) {
            thumbnailDataUrl = await blobToDataUrl(blob);
          }
        }

        if (thumbnailDataUrl) {
          thumbnails.set(element.id, thumbnailDataUrl);
        }
      } catch {
        // Silently fail - placeholder will be shown
      }
    }),
  );

  return thumbnails;
}
