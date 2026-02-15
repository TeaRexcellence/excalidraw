import {
  FONT_FAMILY,
  VERTICAL_ALIGN,
  escapeDoubleQuotes,
  getFontString,
} from "@excalidraw/common";

import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";
import type { MarkRequired } from "@excalidraw/common/utility-types";

import { newTextElement } from "./newElement";
import { wrapText } from "./textWrapping";
import { isIframeElement } from "./typeChecks";

import type {
  ExcalidrawElement,
  ExcalidrawIframeLikeElement,
  IframeData,
} from "./types";

type IframeDataWithSandbox = MarkRequired<IframeData, "sandbox">;

const embeddedLinkCache = new Map<string, IframeDataWithSandbox>();

const RE_YOUTUBE =
  /^(?:http(?:s)?:\/\/)?(?:www\.)?youtu(?:be\.com|\.be)\/(embed\/|watch\?v=|shorts\/|playlist\?list=|embed\/videoseries\?list=)?([a-zA-Z0-9_-]+)/;

const RE_VIMEO =
  /^(?:http(?:s)?:\/\/)?(?:(?:w){3}\.)?(?:player\.)?vimeo\.com\/(?:video\/)?([^?\s]+)(?:\?.*)?$/;
const RE_FIGMA = /^https:\/\/(?:www\.)?figma\.com/;

const RE_GH_GIST = /^https:\/\/gist\.github\.com\/([\w_-]+)\/([\w_-]+)/;
const RE_GH_GIST_EMBED =
  /^<script[\s\S]*?\ssrc=["'](https:\/\/gist\.github\.com\/.*?)\.js["']/i;

const RE_MSFORMS = /^(?:https?:\/\/)?forms\.microsoft\.com\//;

// not anchored to start to allow <blockquote> twitter embeds
const RE_TWITTER =
  /(?:https?:\/\/)?(?:(?:w){3}\.)?(?:twitter|x)\.com\/[^/]+\/status\/(\d+)/;
const RE_TWITTER_EMBED =
  /^<blockquote[\s\S]*?\shref=["'](https?:\/\/(?:twitter|x)\.com\/[^"']*)/i;

const RE_VALTOWN =
  /^https:\/\/(?:www\.)?val\.town\/(v|embed)\/[a-zA-Z_$][0-9a-zA-Z_$]+\.[a-zA-Z_$][0-9a-zA-Z_$]+/;

const RE_GENERIC_EMBED =
  /^<(?:iframe|blockquote)[\s\S]*?\s(?:src|href)=["']([^"']*)["'][\s\S]*?>$/i;

const RE_GIPHY =
  /giphy.com\/(?:clips|embed|gifs)\/[a-zA-Z0-9]*?-?([a-zA-Z0-9]+)(?:[^a-zA-Z0-9]|$)/;

const RE_REDDIT =
  /^(?:http(?:s)?:\/\/)?(?:www\.)?reddit\.com\/r\/([a-zA-Z0-9_]+)\/comments\/([a-zA-Z0-9_]+)\/([a-zA-Z0-9_]+)\/?(?:\?[^#\s]*)?(?:#[^\s]*)?$/;

const RE_REDDIT_EMBED =
  /^<blockquote[\s\S]*?\shref=["'](https?:\/\/(?:www\.)?reddit\.com\/[^"']*)/i;

// Video file extensions
const VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".ogg",
  ".mov",
  ".avi",
  ".mkv",
  ".m4v",
];

// Video playback options parsed from URL hash
export type VideoOptions = {
  loop: boolean;
  autoplay: boolean;
  muted: boolean;
  startTime: number; // in seconds
  endTime: number | null; // in seconds, null means end of video
  dimensions?: { w: number; h: number };
};

// Parse video options from URL hash
// Format: #excalidraw-video=loop,autoplay,start:0,end:60,dim:1920x1080
export const parseVideoOptions = (url: string): VideoOptions => {
  const defaults: VideoOptions = {
    loop: false,
    autoplay: false,
    muted: false,
    startTime: 0,
    endTime: null,
  };

  // Legacy format support
  const dimensionMatch = url.match(/#excalidraw-video-dimensions=(\d+)x(\d+)/);
  if (dimensionMatch) {
    defaults.dimensions = {
      w: parseInt(dimensionMatch[1], 10),
      h: parseInt(dimensionMatch[2], 10),
    };
  }

  const optionsMatch = url.match(/#excalidraw-video=([^#]+)/);
  if (!optionsMatch) {
    return defaults;
  }

  const parts = optionsMatch[1].split(",");
  const options: VideoOptions = { ...defaults };

  for (const part of parts) {
    if (part === "loop") {
      options.loop = true;
    } else if (part === "autoplay") {
      options.autoplay = true;
    } else if (part === "muted") {
      options.muted = true;
    } else if (part.startsWith("start:")) {
      options.startTime = parseTimeString(part.slice(6));
    } else if (part.startsWith("end:")) {
      options.endTime = parseTimeString(part.slice(4));
    } else if (part.startsWith("dim:")) {
      const dimMatch = part.match(/dim:(\d+)x(\d+)/);
      if (dimMatch) {
        options.dimensions = {
          w: parseInt(dimMatch[1], 10),
          h: parseInt(dimMatch[2], 10),
        };
      }
    }
  }

  return options;
};

// Encode video options to URL hash format
export const encodeVideoOptions = (options: VideoOptions): string => {
  const parts: string[] = [];

  if (options.loop) {
    parts.push("loop");
  }
  if (options.autoplay) {
    parts.push("autoplay");
  }
  if (options.muted) {
    parts.push("muted");
  }
  if (options.startTime > 0) {
    parts.push(`start:${formatTimeForUrl(options.startTime)}`);
  }
  if (options.endTime !== null) {
    parts.push(`end:${formatTimeForUrl(options.endTime)}`);
  }
  if (options.dimensions) {
    parts.push(`dim:${options.dimensions.w}x${options.dimensions.h}`);
  }

  if (parts.length === 0) {
    return "";
  }

  return `#excalidraw-video=${parts.join(",")}`;
};

// Parse time string like "1:30" or "90" to seconds
export const parseTimeString = (timeStr: string): number => {
  const trimmed = timeStr.trim();
  if (!trimmed) {
    return 0;
  }

  // Check for MM:SS or HH:MM:SS format
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":").map((p) => parseInt(p, 10) || 0);
    if (parts.length === 2) {
      // MM:SS
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      // HH:MM:SS
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }

  // Plain seconds
  return parseFloat(trimmed) || 0;
};

// Format seconds to time string for URL (compact format)
const formatTimeForUrl = (seconds: number): string => {
  return seconds.toString();
};

// Format seconds to display string like "1:30"
export const formatTimeDisplay = (seconds: number): string => {
  if (seconds === 0) {
    return "0:00";
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

// Strip video options hash from URL
export const stripVideoOptionsFromUrl = (url: string): string => {
  return url
    .replace(/#excalidraw-video=[^#]*/, "")
    .replace(/#excalidraw-video-dimensions=\d+x\d+/, "")
    .replace(/#$/, ""); // Remove trailing # if present
};

// Update video options in a URL
export const updateVideoOptionsInUrl = (
  url: string,
  options: VideoOptions,
): string => {
  const cleanUrl = stripVideoOptionsFromUrl(url);
  const optionsHash = encodeVideoOptions(options);
  return cleanUrl + optionsHash;
};

// Check if URL is a direct video file
export const isDirectVideoUrl = (url: string): boolean => {
  // Check for data URLs with video mime types
  if (url.startsWith("data:video/")) {
    return true;
  }

  // Check for blob URLs (local files)
  if (url.startsWith("blob:")) {
    return true;
  }

  // Check for local server video paths:
  // - Legacy: /videos/...
  // - New: /projects/{category}/{project}/videos/...
  if (url.includes("/videos/")) {
    return true;
  }

  // Remove query params and hash (including our dimension hash)
  const lowerUrl = url.toLowerCase().split("?")[0].split("#")[0];
  return VIDEO_EXTENSIONS.some((ext) => lowerUrl.endsWith(ext));
};

const parseYouTubeTimestamp = (url: string): number => {
  let timeParam: string | null | undefined;

  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    timeParam =
      urlObj.searchParams.get("t") || urlObj.searchParams.get("start");
  } catch (error) {
    const timeMatch = url.match(/[?&#](?:t|start)=([^&#\s]+)/);
    timeParam = timeMatch?.[1];
  }

  if (!timeParam) {
    return 0;
  }

  if (/^\d+$/.test(timeParam)) {
    return parseInt(timeParam, 10);
  }

  const timeMatch = timeParam.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!timeMatch) {
    return 0;
  }

  const [, hours = "0", minutes = "0", seconds = "0"] = timeMatch;
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
};

const ALLOWED_DOMAINS = new Set([
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "figma.com",
  "link.excalidraw.com",
  "gist.github.com",
  "twitter.com",
  "x.com",
  "*.simplepdf.eu",
  "stackblitz.com",
  "val.town",
  "giphy.com",
  "reddit.com",
  "forms.microsoft.com",
]);

const ALLOW_SAME_ORIGIN = new Set([
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "player.vimeo.com",
  "figma.com",
  "twitter.com",
  "x.com",
  "*.simplepdf.eu",
  "stackblitz.com",
  "reddit.com",
  "forms.microsoft.com",
]);

export const createSrcDoc = (body: string) => {
  return `<html><body>${body}</body></html>`;
};

export const getEmbedLink = (
  link: string | null | undefined,
): IframeDataWithSandbox | null => {
  if (!link) {
    return null;
  }

  if (embeddedLinkCache.has(link)) {
    return embeddedLinkCache.get(link)!;
  }

  const originalLink = link;

  // Check for direct video URLs (mp4, webm, data:video/, etc.) first
  if (isDirectVideoUrl(link)) {
    // Parse video options from URL hash
    const videoOptions = parseVideoOptions(link);
    let aspectRatio = { w: 560, h: 315 }; // 16:9 default

    if (videoOptions.dimensions) {
      const { w: width, h: height } = videoOptions.dimensions;
      // Scale down if too large, maintaining aspect ratio
      const maxSize = 800;
      if (width > maxSize || height > maxSize) {
        const scale = maxSize / Math.max(width, height);
        aspectRatio = {
          w: Math.round(width * scale),
          h: Math.round(height * scale),
        };
      } else {
        aspectRatio = { w: width, h: height };
      }
    }

    // Strip the options hash from the link for the video src
    const cleanLink = stripVideoOptionsFromUrl(link);
    const ret: IframeDataWithSandbox = {
      type: "html5video",
      link: cleanLink,
      intrinsicSize: aspectRatio,
      sandbox: { allowSameOrigin: true },
      videoOptions,
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  const allowSameOrigin = ALLOW_SAME_ORIGIN.has(
    matchHostname(link, ALLOW_SAME_ORIGIN) || "",
  );

  let type: "video" | "generic" = "generic";
  let aspectRatio = { w: 560, h: 840 };
  const ytLink = link.match(RE_YOUTUBE);
  if (ytLink?.[2]) {
    const startTime = parseYouTubeTimestamp(originalLink);
    const time = startTime > 0 ? `&start=${startTime}` : ``;
    const isPortrait = link.includes("shorts");
    type = "video";
    switch (ytLink[1]) {
      case "embed/":
      case "watch?v=":
      case "shorts/":
        link = `https://www.youtube.com/embed/${ytLink[2]}?enablejsapi=1${time}`;
        break;
      case "playlist?list=":
      case "embed/videoseries?list=":
        link = `https://www.youtube.com/embed/videoseries?list=${ytLink[2]}&enablejsapi=1${time}`;
        break;
      default:
        link = `https://www.youtube.com/embed/${ytLink[2]}?enablejsapi=1${time}`;
        break;
    }
    aspectRatio = isPortrait ? { w: 315, h: 560 } : { w: 560, h: 315 };
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  const vimeoLink = link.match(RE_VIMEO);
  if (vimeoLink?.[1]) {
    const target = vimeoLink?.[1];
    const error = !/^\d+$/.test(target)
      ? new URIError("Invalid embed link format")
      : undefined;
    type = "video";
    link = `https://player.vimeo.com/video/${target}?api=1`;
    aspectRatio = { w: 560, h: 315 };
    //warning deliberately ommited so it is displayed only once per link
    //same link next time will be served from cache
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      error,
      sandbox: { allowSameOrigin },
    };
  }

  const figmaLink = link.match(RE_FIGMA);
  if (figmaLink) {
    type = "generic";
    link = `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(
      link,
    )}`;
    aspectRatio = { w: 550, h: 550 };
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  const valLink = link.match(RE_VALTOWN);
  if (valLink) {
    link =
      valLink[1] === "embed" ? valLink[0] : valLink[0].replace("/v", "/embed");
    embeddedLinkCache.set(originalLink, {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    });
    return {
      link,
      intrinsicSize: aspectRatio,
      type,
      sandbox: { allowSameOrigin },
    };
  }

  if (RE_MSFORMS.test(link) && !link.includes("embed=true")) {
    link += link.includes("?") ? "&embed=true" : "?embed=true";
  }

  if (RE_TWITTER.test(link)) {
    const postId = link.match(RE_TWITTER)![1];
    // the embed srcdoc still supports twitter.com domain only.
    // Note that we don't attempt to parse the username as it can consist of
    // non-latin1 characters, and the username in the url can be set to anything
    // without affecting the embed.
    const safeURL = escapeDoubleQuotes(
      `https://twitter.com/x/status/${postId}`,
    );

    const ret: IframeDataWithSandbox = {
      type: "document",
      srcdoc: (theme: string) =>
        createSrcDoc(
          `<blockquote class="twitter-tweet" data-dnt="true" data-theme="${theme}"><a href="${safeURL}"></a></blockquote> <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>`,
        ),
      intrinsicSize: { w: 480, h: 480 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  if (RE_REDDIT.test(link)) {
    const [, page, postId, title] = link.match(RE_REDDIT)!;
    const safeURL = escapeDoubleQuotes(
      `https://reddit.com/r/${page}/comments/${postId}/${title}`,
    );
    const ret: IframeDataWithSandbox = {
      type: "document",
      srcdoc: (theme: string) =>
        createSrcDoc(
          `<blockquote class="reddit-embed-bq" data-embed-theme="${theme}"><a href="${safeURL}"></a><br></blockquote><script async="" src="https://embed.reddit.com/widgets.js" charset="UTF-8"></script>`,
        ),
      intrinsicSize: { w: 480, h: 480 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(originalLink, ret);
    return ret;
  }

  if (RE_GH_GIST.test(link)) {
    const [, user, gistId] = link.match(RE_GH_GIST)!;
    const safeURL = escapeDoubleQuotes(
      `https://gist.github.com/${user}/${gistId}`,
    );
    const ret: IframeDataWithSandbox = {
      type: "document",
      srcdoc: () =>
        createSrcDoc(`
          <script src="${safeURL}.js"></script>
          <style type="text/css">
            * { margin: 0px; }
            table, .gist { height: 100%; }
            .gist .gist-file { height: calc(100vh - 2px); padding: 0px; display: grid; grid-template-rows: 1fr auto; }
          </style>
        `),
      intrinsicSize: { w: 550, h: 720 },
      sandbox: { allowSameOrigin },
    };
    embeddedLinkCache.set(link, ret);
    return ret;
  }

  embeddedLinkCache.set(link, {
    link,
    intrinsicSize: aspectRatio,
    type,
    sandbox: { allowSameOrigin },
  });
  return {
    link,
    intrinsicSize: aspectRatio,
    type,
    sandbox: { allowSameOrigin },
  };
};

export const createPlaceholderEmbeddableLabel = (
  element: ExcalidrawIframeLikeElement,
): ExcalidrawElement => {
  let text: string;
  if (isIframeElement(element)) {
    text = "IFrame element";
  } else {
    text =
      !element.link || element?.link === "" ? "Empty Web-Embed" : element.link;
  }

  const fontSize = Math.max(
    Math.min(element.width / 2, element.width / text.length),
    element.width / 30,
  );
  const fontFamily = FONT_FAMILY.Helvetica;

  const fontString = getFontString({
    fontSize,
    fontFamily,
  });

  return newTextElement({
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
    strokeColor:
      element.strokeColor !== "transparent" ? element.strokeColor : "black",
    backgroundColor: "transparent",
    fontFamily,
    fontSize,
    text: wrapText(text, fontString, element.width - 20),
    textAlign: "center",
    verticalAlign: VERTICAL_ALIGN.MIDDLE,
    angle: element.angle ?? 0,
  });
};

const matchHostname = (
  url: string,
  /** using a Set assumes it already contains normalized bare domains */
  allowedHostnames: Set<string> | string,
): string | null => {
  try {
    const { hostname } = new URL(url);

    const bareDomain = hostname.replace(/^www\./, "");

    if (allowedHostnames instanceof Set) {
      if (ALLOWED_DOMAINS.has(bareDomain)) {
        return bareDomain;
      }

      const bareDomainWithFirstSubdomainWildcarded = bareDomain.replace(
        /^([^.]+)/,
        "*",
      );
      if (ALLOWED_DOMAINS.has(bareDomainWithFirstSubdomainWildcarded)) {
        return bareDomainWithFirstSubdomainWildcarded;
      }
      return null;
    }

    const bareAllowedHostname = allowedHostnames.replace(/^www\./, "");
    if (bareDomain === bareAllowedHostname) {
      return bareAllowedHostname;
    }
  } catch (error) {
    // ignore
  }
  return null;
};

export const maybeParseEmbedSrc = (str: string): string => {
  const twitterMatch = str.match(RE_TWITTER_EMBED);
  if (twitterMatch && twitterMatch.length === 2) {
    return twitterMatch[1];
  }

  const redditMatch = str.match(RE_REDDIT_EMBED);
  if (redditMatch && redditMatch.length === 2) {
    return redditMatch[1];
  }

  const gistMatch = str.match(RE_GH_GIST_EMBED);
  if (gistMatch && gistMatch.length === 2) {
    return gistMatch[1];
  }

  if (RE_GIPHY.test(str)) {
    return `https://giphy.com/embed/${RE_GIPHY.exec(str)![1]}`;
  }

  const match = str.match(RE_GENERIC_EMBED);
  if (match && match.length === 2) {
    return match[1];
  }

  return str;
};

export const embeddableURLValidator = (
  url: string | null | undefined,
  _validateEmbeddable: ExcalidrawProps["validateEmbeddable"],
): boolean => {
  // Allow ALL URLs - no restrictions
  return !!url;
};

/**
 * Get YouTube video ID from URL
 */
export const getYouTubeVideoId = (url: string): string | null => {
  const match = url.match(RE_YOUTUBE);
  return match?.[2] || null;
};

/**
 * Get YouTube thumbnail URL for a video
 */
export const getYouTubeThumbnailUrl = (
  videoId: string,
  quality:
    | "default"
    | "hqdefault"
    | "mqdefault"
    | "sddefault"
    | "maxresdefault" = "hqdefault",
): string => {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
};

/**
 * Capture a frame from a video element as an image blob
 */
export const captureVideoFrame = (
  videoSrc: string,
  seekTime: number = 0,
): Promise<Blob | null> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "metadata";

    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
      video.removeEventListener("seeked", onSeeked);
      video.src = "";
      video.load();
    };

    const safeResolve = (result: Blob | null) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(result);
      }
    };

    const onError = () => {
      safeResolve(null);
    };

    const onSeeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          safeResolve(null);
          return;
        }
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            safeResolve(blob);
          },
          "image/png",
          0.9,
        );
      } catch (err) {
        safeResolve(null);
      }
    };

    const onLoaded = () => {
      // Seek to the specified time (or 1 second if video is long enough)
      const targetTime =
        seekTime > 0 ? seekTime : Math.min(1, video.duration / 2);
      video.currentTime = targetTime;
    };

    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("error", onError);
    video.addEventListener("seeked", onSeeked);

    // Set timeout for slow-loading videos (checks if video has loaded enough data)
    timeoutId = setTimeout(() => {
      // readyState < 2 means we don't have enough data to play
      if (video.readyState < 2) {
        safeResolve(null);
      }
    }, 10000);

    video.src = videoSrc;
    video.load();
  });
};

/**
 * Get thumbnail for any video embed (YouTube, direct video, etc.)
 * Returns a data URL or blob URL for the thumbnail
 */
export const getVideoThumbnail = async (
  url: string,
): Promise<string | null> => {
  // Check if it's a YouTube video
  const youtubeId = getYouTubeVideoId(url);
  if (youtubeId) {
    // Return YouTube's thumbnail URL directly
    return getYouTubeThumbnailUrl(youtubeId, "hqdefault");
  }

  // For direct video URLs, capture a frame
  if (isDirectVideoUrl(url)) {
    const cleanUrl = stripVideoOptionsFromUrl(url);
    const blob = await captureVideoFrame(cleanUrl);
    if (blob) {
      return URL.createObjectURL(blob);
    }
  }

  return null;
};

/**
 * Load an image from a URL and return it as an HTMLImageElement
 */
export const loadImageFromUrl = (
  url: string,
): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);

    // Timeout for slow images
    setTimeout(() => {
      if (!img.complete) {
        resolve(null);
      }
    }, 5000);

    img.src = url;
  });
};
