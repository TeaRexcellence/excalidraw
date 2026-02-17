import { pointFrom, type GlobalPoint } from "@excalidraw/math";
import clsx from "clsx";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  EVENT,
  HYPERLINK_TOOLTIP_DELAY,
  KEYS,
} from "@excalidraw/common";

import { getElementAbsoluteCoords } from "@excalidraw/element";

import { hitElementBoundingBox } from "@excalidraw/element";

import { isElementLink } from "@excalidraw/element";

import {
  getEmbedLink,
  embeddableURLValidator,
  isDirectVideoUrl,
  isYouTubeUrl,
  parseVideoOptions,
  updateVideoOptionsInUrl,
  formatTimeDisplay,
  parseTimeString,
} from "@excalidraw/element";

import {
  sceneCoordsToViewportCoords,
  viewportCoordsToSceneCoords,
  wrapEvent,
  isLocalLink,
  isLocalFilePath,
  normalizeLink,
} from "@excalidraw/common";

import { isEmbeddableElement } from "@excalidraw/element";

import type { Scene } from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawEmbeddableElement,
  NonDeletedExcalidrawElement,
  VideoOptions,
} from "@excalidraw/element/types";

import { trackEvent } from "../../analytics";
import { getTooltipDiv, updateTooltipPosition } from "../../components/Tooltip";

import { t } from "../../i18n";

import {
  useAppProps,
  useEditorInterface,
  useExcalidrawAppState,
} from "../App";
import * as YTManager from "../YouTubePlayerManager";
import { ToolButton } from "../ToolButton";
import {
  FreedrawIcon,
  TrashIcon,
  elementLinkIcon,
  LoopIcon,
  PlayIcon,
  PauseIcon,
  VolumeIcon,
  VolumeOffIcon,
} from "../icons";
import { getSelectedElements } from "../../scene";

import { getLinkHandleFromCoords } from "./helpers";

import "./Hyperlink.scss";

import type { AppState, ExcalidrawProps, UIAppState } from "../../types";

const POPUP_WIDTH = 380;
const POPUP_WIDTH_VIDEO = 380;
const POPUP_HEIGHT = 42;
const POPUP_HEIGHT_VIDEO = 82;
const POPUP_PADDING = 5;
const SPACE_BOTTOM = 85;
const SPACE_BOTTOM_VIDEO = 115;
const AUTO_HIDE_TIMEOUT = 500;

let IS_HYPERLINK_TOOLTIP_VISIBLE = false;

const embeddableLinkCache = new Map<
  ExcalidrawEmbeddableElement["id"],
  string
>();

// Helper to check if element is a video embeddable (direct video OR YouTube)
const isVideoElement = (element: NonDeletedExcalidrawElement): boolean => {
  if (!isEmbeddableElement(element) || !element.link) {
    return false;
  }
  return isDirectVideoUrl(element.link) || isYouTubeUrl(element.link);
};

// Helper to check if element is specifically a YouTube embed
const isYouTubeElement = (element: NonDeletedExcalidrawElement): boolean => {
  if (!isEmbeddableElement(element) || !element.link) {
    return false;
  }
  return isYouTubeUrl(element.link);
};

// Helper to get video duration from a URL
const getVideoDuration = async (url: string): Promise<number | null> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    let resolved = false;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.src = "";
    };

    const safeResolve = (result: number | null) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(result);
      }
    };

    // Timeout to prevent hanging on CORS-blocked or slow videos
    const timeout = setTimeout(() => {
      safeResolve(null);
    }, 10000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      safeResolve(video.duration);
    };

    video.onerror = () => {
      clearTimeout(timeout);
      safeResolve(null);
    };

    // Strip any hash from URL for loading
    const cleanUrl = url.split("#")[0];
    video.src = cleanUrl;
  });
};

export const Hyperlink = ({
  element,
  scene,
  setAppState,
  onLinkOpen,
  setToast,
  updateEmbedValidationStatus,
}: {
  element: NonDeletedExcalidrawElement;
  scene: Scene;
  setAppState: React.Component<any, AppState>["setState"];
  onLinkOpen: ExcalidrawProps["onLinkOpen"];
  setToast: (
    toast: { message: string; closable?: boolean; duration?: number } | null,
  ) => void;
  updateEmbedValidationStatus: (
    element: ExcalidrawEmbeddableElement,
    status: boolean,
  ) => void;
}) => {
  const elementsMap = scene.getNonDeletedElementsMap();
  const appState = useExcalidrawAppState();
  const appProps = useAppProps();
  const editorInterface = useEditorInterface();

  const linkVal = element.link || "";
  const isVideo = isVideoElement(element);
  const isYouTube = isYouTubeElement(element);

  const [inputVal, setInputVal] = useState(linkVal);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = appState.showHyperlinkPopup === "editor";

  // Video options state
  const [videoOptions, setVideoOptions] = useState<VideoOptions>(() =>
    parseVideoOptions(linkVal),
  );
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTimeInput, setStartTimeInput] = useState(() =>
    formatTimeDisplay(videoOptions.startTime),
  );
  const [endTimeInput, setEndTimeInput] = useState(() =>
    videoOptions.endTime !== null
      ? formatTimeDisplay(videoOptions.endTime)
      : "",
  );

  // Get video element from DOM (for direct videos)
  const getVideoElement = useCallback((): HTMLVideoElement | null => {
    if (isYouTube) {
      return null;
    }
    // Find video in the embeddable container
    const container = document.querySelector(
      `.excalidraw__embeddable-container [data-element-id="${element.id}"]`,
    );
    if (container) {
      return container.querySelector("video");
    }
    // Fallback: find any video with matching src
    const videos = document.querySelectorAll<HTMLVideoElement>(
      ".excalidraw__video-player",
    );
    for (const video of videos) {
      if (element.link && video.src.includes(element.link.split("#")[0])) {
        return video;
      }
    }
    return null;
  }, [element.id, element.link, isYouTube]);

  // Toggle play/pause
  const togglePlayPause = useCallback(() => {
    if (isYouTube) {
      // YouTube: use JS API via YouTubePlayerManager
      const nowPlaying = YTManager.togglePlay(element.id);
      setIsPlaying(nowPlaying);
    } else {
      // Direct video: use HTML5 video API
      const video = getVideoElement();
      if (!video) {
        return;
      }
      if (video.paused) {
        video.play();
        setIsPlaying(true);
      } else {
        video.pause();
        setIsPlaying(false);
      }
    }
  }, [isYouTube, getVideoElement, element.id]);

  // Sync playing state and current time with actual video
  useEffect(() => {
    if (!isVideo) {
      return;
    }

    if (isYouTube) {
      // Use YouTubePlayerManager's onStateChange for play state
      const unsubscribe = YTManager.onStateChange(element.id, (state) => {
        const { YOUTUBE_STATES } = YTManager;
        setIsPlaying(
          state === YOUTUBE_STATES.PLAYING ||
            state === YOUTUBE_STATES.BUFFERING,
        );
      });
      // Poll current time from the manager (no "timeupdate" event for YT)
      const timeInterval = window.setInterval(() => {
        setCurrentTime(YTManager.getCurrentTime(element.id));
      }, 250);
      // Initial state
      const { YOUTUBE_STATES } = YTManager;
      const initialState = YTManager.getState(element.id);
      setIsPlaying(
        initialState === YOUTUBE_STATES.PLAYING ||
          initialState === YOUTUBE_STATES.BUFFERING,
      );
      setCurrentTime(YTManager.getCurrentTime(element.id));
      return () => {
        unsubscribe();
        clearInterval(timeInterval);
      };
    }

    const video = getVideoElement();
    if (!video) {
      return;
    }

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);

    // Initial state
    setIsPlaying(!video.paused);
    setCurrentTime(video.currentTime);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [isVideo, isYouTube, getVideoElement, element.id]);

  // Fetch video duration when element changes
  useEffect(() => {
    if (isVideo && !isYouTube && linkVal) {
      const cleanUrl = linkVal.split("#")[0];
      getVideoDuration(cleanUrl).then((duration) => {
        if (duration !== null && isFinite(duration)) {
          setVideoDuration(duration);
          // Set end time input to duration if not already set
          if (videoOptions.endTime === null) {
            setEndTimeInput(formatTimeDisplay(duration));
          }
        }
      });
    }
    if (isVideo && isYouTube) {
      // Poll for YouTube duration (available once video starts playing)
      const checkDuration = () => {
        const d = YTManager.getDuration(element.id);
        if (d !== null) {
          setVideoDuration(d);
          if (videoOptions.endTime === null) {
            setEndTimeInput(formatTimeDisplay(d));
          }
          return true;
        }
        return false;
      };
      if (!checkDuration()) {
        const interval = window.setInterval(() => {
          if (checkDuration()) {
            clearInterval(interval);
          }
        }, 1000);
        return () => clearInterval(interval);
      }
    }
  }, [isVideo, isYouTube, linkVal, videoOptions.endTime, element.id]);

  // Update video options when link changes
  useEffect(() => {
    const opts = parseVideoOptions(linkVal);
    setVideoOptions(opts);
    setStartTimeInput(formatTimeDisplay(opts.startTime));
    setEndTimeInput(
      opts.endTime !== null ? formatTimeDisplay(opts.endTime) : "",
    );
  }, [linkVal]);

  // Apply video options to element
  const applyVideoOptions = useCallback(
    (newOptions: Partial<VideoOptions>) => {
      const updatedOptions = { ...videoOptions, ...newOptions };
      setVideoOptions(updatedOptions);

      if (element.link) {
        const newLink = updateVideoOptionsInUrl(element.link, updatedOptions);
        scene.mutateElement(element, { link: newLink });
      }

      // Keep YouTubePlayerManager in sync for loop/end-time enforcement
      if (isYouTube) {
        YTManager.updateOptions(element.id, updatedOptions);
      }
    },
    [videoOptions, element, scene, isYouTube],
  );

  const handleSubmit = useCallback(() => {
    if (!inputRef.current) {
      return;
    }

    const link = normalizeLink(inputRef.current.value) || null;

    if (!element.link && link) {
      trackEvent("hyperlink", "create");
    }

    if (isEmbeddableElement(element)) {
      if (appState.activeEmbeddable?.element === element) {
        setAppState({ activeEmbeddable: null });
      }
      if (!link) {
        scene.mutateElement(element, {
          link: null,
        });
        updateEmbedValidationStatus(element, false);
        return;
      }

      if (!embeddableURLValidator(link, appProps.validateEmbeddable)) {
        if (link) {
          setToast({ message: t("toast.unableToEmbed"), closable: true });
        }
        element.link && embeddableLinkCache.set(element.id, element.link);
        scene.mutateElement(element, {
          link,
        });
        updateEmbedValidationStatus(element, false);
      } else {
        const { width, height } = element;
        const embedLink = getEmbedLink(link);
        if (embedLink?.error instanceof URIError) {
          setToast({
            message: t("toast.unrecognizedLinkFormat"),
            closable: true,
          });
        }
        const ar = embedLink
          ? embedLink.intrinsicSize.w / embedLink.intrinsicSize.h
          : 1;
        const hasLinkChanged =
          embeddableLinkCache.get(element.id) !== element.link;
        scene.mutateElement(element, {
          ...(hasLinkChanged
            ? {
                width:
                  embedLink?.type === "video"
                    ? width > height
                      ? width
                      : height * ar
                    : width,
                height:
                  embedLink?.type === "video"
                    ? width > height
                      ? width / ar
                      : height
                    : height,
              }
            : {}),
          link,
        });
        updateEmbedValidationStatus(element, true);
        if (embeddableLinkCache.has(element.id)) {
          embeddableLinkCache.delete(element.id);
        }
      }
    } else {
      scene.mutateElement(element, { link });
    }
  }, [
    element,
    scene,
    setToast,
    appProps.validateEmbeddable,
    appState.activeEmbeddable,
    setAppState,
    updateEmbedValidationStatus,
  ]);

  useLayoutEffect(() => {
    return () => {
      handleSubmit();
    };
  }, [handleSubmit]);

  useEffect(() => {
    if (
      isEditing &&
      inputRef?.current &&
      !(editorInterface.formFactor === "phone" || editorInterface.isTouchScreen)
    ) {
      inputRef.current.select();
    }
  }, [isEditing, editorInterface.formFactor, editorInterface.isTouchScreen]);

  useEffect(() => {
    let timeoutId: number | null = null;

    const handlePointerMove = (event: PointerEvent) => {
      if (isEditing) {
        return;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      const shouldHide = shouldHideLinkPopup(
        element,
        elementsMap,
        appState,
        pointFrom(event.clientX, event.clientY),
        isVideo,
      ) as boolean;
      if (shouldHide) {
        timeoutId = window.setTimeout(() => {
          setAppState({ showHyperlinkPopup: false });
        }, AUTO_HIDE_TIMEOUT);
      }
    };
    window.addEventListener(EVENT.POINTER_MOVE, handlePointerMove, false);
    return () => {
      window.removeEventListener(EVENT.POINTER_MOVE, handlePointerMove, false);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [appState, element, isEditing, setAppState, elementsMap, isVideo]);

  const handleRemove = useCallback(() => {
    trackEvent("hyperlink", "delete");
    scene.mutateElement(element, { link: null });
    setAppState({ showHyperlinkPopup: false });
  }, [setAppState, element, scene]);

  const onEdit = () => {
    trackEvent("hyperlink", "edit", "popup-ui");
    setAppState({ showHyperlinkPopup: "editor" });
  };

  const handleStartTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setStartTimeInput(e.target.value);
    },
    [],
  );

  const handleStartTimeBlur = useCallback(() => {
    const seconds = parseTimeString(startTimeInput);
    applyVideoOptions({ startTime: seconds });
    setStartTimeInput(formatTimeDisplay(seconds));
  }, [startTimeInput, applyVideoOptions]);

  const handleEndTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setEndTimeInput(e.target.value);
    },
    [],
  );

  const handleEndTimeBlur = useCallback(() => {
    const value = endTimeInput.trim();
    if (!value) {
      applyVideoOptions({ endTime: null });
      if (videoDuration !== null) {
        setEndTimeInput(formatTimeDisplay(videoDuration));
      }
    } else {
      const seconds = parseTimeString(value);
      applyVideoOptions({ endTime: seconds });
      setEndTimeInput(formatTimeDisplay(seconds));
    }
  }, [endTimeInput, applyVideoOptions, videoDuration]);

  const { x, y } = getCoordsForPopover(element, appState, elementsMap, isVideo);

  // Hide popup when embeddable is active (user clicked "click to interact")
  // This allows the user to interact with native video controls
  const isEmbeddableActive =
    isEmbeddableElement(element) &&
    appState.activeEmbeddable?.element === element &&
    appState.activeEmbeddable?.state === "active";

  if (
    appState.contextMenu ||
    appState.selectedElementsAreBeingDragged ||
    appState.resizingElement ||
    appState.isRotating ||
    appState.openMenu ||
    appState.viewModeEnabled ||
    isEmbeddableActive
  ) {
    return null;
  }

  const popupWidth = isVideo ? POPUP_WIDTH_VIDEO : POPUP_WIDTH;

  return (
    <div
      className={clsx("excalidraw-hyperlinkContainer", {
        "excalidraw-hyperlinkContainer--video": isVideo,
      })}
      style={{
        top: `${y}px`,
        left: `${x}px`,
        width: popupWidth,
        padding: POPUP_PADDING,
      }}
    >
      <div className="excalidraw-hyperlinkContainer__row">
        {isEditing ? (
          <input
            className={clsx("excalidraw-hyperlinkContainer-input")}
            placeholder={t("labels.link.hint")}
            ref={inputRef}
            value={inputVal}
            onChange={(event) => setInputVal(event.target.value)}
            autoFocus
            onKeyDown={(event) => {
              event.stopPropagation();
              // prevent cmd/ctrl+k shortcut when editing link
              if (event[KEYS.CTRL_OR_CMD] && event.key === KEYS.K) {
                event.preventDefault();
              }
              if (event.key === KEYS.ENTER || event.key === KEYS.ESCAPE) {
                handleSubmit();
                setAppState({ showHyperlinkPopup: "info" });
              }
            }}
          />
        ) : element.link ? (
          <a
            href={
              isLocalFilePath(element.link)
                ? "#"
                : normalizeLink(element.link || "")
            }
            className="excalidraw-hyperlinkContainer-link"
            target={isLocalLink(element.link) ? "_self" : "_blank"}
            onClick={(event) => {
              if (element.link && isLocalFilePath(element.link)) {
                event.preventDefault();
                let localPath = element.link.trim();
                if (localPath.startsWith("file:///")) {
                  localPath = localPath.slice(8).replace(/\//g, "\\");
                }
                fetch("/api/open-local", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ path: localPath }),
                }).catch((err) =>
                  console.error("Failed to open local path:", err),
                );
                return;
              }
              if (element.link && onLinkOpen) {
                const customEvent = wrapEvent(
                  EVENT.EXCALIDRAW_LINK,
                  event.nativeEvent,
                );
                onLinkOpen(
                  {
                    ...element,
                    link: normalizeLink(element.link),
                  },
                  customEvent,
                );
                if (customEvent.defaultPrevented) {
                  event.preventDefault();
                }
              }
            }}
            rel="noopener noreferrer"
          >
            {element.link.split("#")[0]}
          </a>
        ) : (
          <div className="excalidraw-hyperlinkContainer-link">
            {t("labels.link.empty")}
          </div>
        )}
        <div className="excalidraw-hyperlinkContainer__buttons">
          {!isEditing && (
            <ToolButton
              type="button"
              title={t("buttons.edit")}
              aria-label={t("buttons.edit")}
              label={t("buttons.edit")}
              onClick={onEdit}
              className="excalidraw-hyperlinkContainer--edit"
              icon={FreedrawIcon}
            />
          )}
          <ToolButton
            type="button"
            title={t("labels.linkToElement")}
            aria-label={t("labels.linkToElement")}
            label={t("labels.linkToElement")}
            onClick={() => {
              setAppState({
                openDialog: {
                  name: "elementLinkSelector",
                  sourceElementId: element.id,
                },
              });
            }}
            icon={elementLinkIcon}
          />
          {linkVal && !isEmbeddableElement(element) && (
            <ToolButton
              type="button"
              title={t("buttons.remove")}
              aria-label={t("buttons.remove")}
              label={t("buttons.remove")}
              onClick={handleRemove}
              className="excalidraw-hyperlinkContainer--remove"
              icon={TrashIcon}
            />
          )}
        </div>
      </div>

      {/* Video controls */}
      {isVideo && !isEditing && (
        <div className="excalidraw-hyperlinkContainer__video-controls">
          {/* Play/Pause button */}
          <button
            type="button"
            className="excalidraw-hyperlinkContainer__video-playpause"
            onClick={togglePlayPause}
            title={
              isPlaying ? t("videoControls.pause") : t("videoControls.play")
            }
          >
            {isPlaying ? PauseIcon : PlayIcon}
          </button>

          {/* Current time display */}
          <span className="excalidraw-hyperlinkContainer__video-currenttime">
            {formatTimeDisplay(currentTime)}
          </span>

          {/* Loop toggle */}
          <button
            type="button"
            className={`excalidraw-hyperlinkContainer__video-toggle ${
              videoOptions.loop
                ? "excalidraw-hyperlinkContainer__video-toggle--active"
                : ""
            }`}
            onClick={() => applyVideoOptions({ loop: !videoOptions.loop })}
            title={t("videoControls.loop")}
          >
            {LoopIcon}
          </button>

          {/* Time range */}
          <div className="excalidraw-hyperlinkContainer__video-time">
            <input
              type="text"
              className="excalidraw-hyperlinkContainer__video-time-input"
              value={startTimeInput}
              onChange={handleStartTimeChange}
              onBlur={handleStartTimeBlur}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === KEYS.ENTER) {
                  handleStartTimeBlur();
                }
              }}
              placeholder="0:00"
              title={t("videoControls.start")}
            />
            <span className="excalidraw-hyperlinkContainer__video-time-separator">
              –
            </span>
            <input
              type="text"
              className="excalidraw-hyperlinkContainer__video-time-input"
              value={endTimeInput}
              onChange={handleEndTimeChange}
              onBlur={handleEndTimeBlur}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === KEYS.ENTER) {
                  handleEndTimeBlur();
                }
              }}
              placeholder={
                videoDuration !== null
                  ? formatTimeDisplay(videoDuration)
                  : "end"
              }
              title={t("videoControls.end")}
            />
          </div>

          {/* Separator */}
          <span className="excalidraw-hyperlinkContainer__video-separator" />

          {/* Autoplay switch */}
          <label className="excalidraw-hyperlinkContainer__video-autoplay">
            <input
              type="checkbox"
              checked={videoOptions.autoplay}
              onChange={() =>
                applyVideoOptions({ autoplay: !videoOptions.autoplay })
              }
            />
            <span>{t("videoControls.autoplayLabel")}</span>
          </label>

          {/* Mute toggle */}
          <button
            type="button"
            className={`excalidraw-hyperlinkContainer__video-toggle ${
              videoOptions.muted
                ? "excalidraw-hyperlinkContainer__video-toggle--active"
                : ""
            }`}
            onClick={() => applyVideoOptions({ muted: !videoOptions.muted })}
            title={
              videoOptions.muted
                ? t("videoControls.unmute")
                : t("videoControls.mute")
            }
          >
            {videoOptions.muted ? VolumeOffIcon : VolumeIcon}
          </button>
        </div>
      )}
    </div>
  );
};

const getCoordsForPopover = (
  element: NonDeletedExcalidrawElement,
  appState: AppState,
  elementsMap: ElementsMap,
  isVideo = false,
) => {
  const [x1, y1] = getElementAbsoluteCoords(element, elementsMap);
  const { x: viewportX, y: viewportY } = sceneCoordsToViewportCoords(
    { sceneX: x1 + element.width / 2, sceneY: y1 },
    appState,
  );
  const popupWidth = isVideo ? POPUP_WIDTH_VIDEO : POPUP_WIDTH;
  const spaceBottom = isVideo ? SPACE_BOTTOM_VIDEO : SPACE_BOTTOM;
  const x = viewportX - appState.offsetLeft - popupWidth / 2;
  const y = viewportY - appState.offsetTop - spaceBottom;
  return { x, y };
};

export const getContextMenuLabel = (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: UIAppState,
) => {
  const selectedElements = getSelectedElements(elements, appState);
  const label = isEmbeddableElement(selectedElements[0])
    ? "labels.link.editEmbed"
    : selectedElements[0]?.link
    ? "labels.link.edit"
    : "labels.link.create";
  return label;
};

let HYPERLINK_TOOLTIP_TIMEOUT_ID: number | null = null;
export const showHyperlinkTooltip = (
  element: NonDeletedExcalidrawElement,
  appState: AppState,
  elementsMap: ElementsMap,
) => {
  if (HYPERLINK_TOOLTIP_TIMEOUT_ID) {
    clearTimeout(HYPERLINK_TOOLTIP_TIMEOUT_ID);
  }
  HYPERLINK_TOOLTIP_TIMEOUT_ID = window.setTimeout(
    () => renderTooltip(element, appState, elementsMap),
    HYPERLINK_TOOLTIP_DELAY,
  );
};

const renderTooltip = (
  element: NonDeletedExcalidrawElement,
  appState: AppState,
  elementsMap: ElementsMap,
) => {
  if (!element.link) {
    return;
  }

  const tooltipDiv = getTooltipDiv();

  tooltipDiv.classList.add("excalidraw-tooltip--visible");
  tooltipDiv.style.maxWidth = "20rem";
  tooltipDiv.textContent = isElementLink(element.link)
    ? t("labels.link.goToElement")
    : element.link;

  const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);

  const [linkX, linkY, linkWidth, linkHeight] = getLinkHandleFromCoords(
    [x1, y1, x2, y2],
    element.angle,
    appState,
  );

  const linkViewportCoords = sceneCoordsToViewportCoords(
    { sceneX: linkX, sceneY: linkY },
    appState,
  );

  updateTooltipPosition(
    tooltipDiv,
    {
      left: linkViewportCoords.x,
      top: linkViewportCoords.y,
      width: linkWidth,
      height: linkHeight,
    },
    "top",
  );
  trackEvent("hyperlink", "tooltip", "link-icon");

  IS_HYPERLINK_TOOLTIP_VISIBLE = true;
};
export const hideHyperlinkToolip = () => {
  if (HYPERLINK_TOOLTIP_TIMEOUT_ID) {
    clearTimeout(HYPERLINK_TOOLTIP_TIMEOUT_ID);
  }
  if (IS_HYPERLINK_TOOLTIP_VISIBLE) {
    IS_HYPERLINK_TOOLTIP_VISIBLE = false;
    getTooltipDiv().classList.remove("excalidraw-tooltip--visible");
  }
};

const shouldHideLinkPopup = (
  element: NonDeletedExcalidrawElement,
  elementsMap: ElementsMap,
  appState: AppState,
  [clientX, clientY]: GlobalPoint,
  isVideo = false,
): Boolean => {
  const { x: sceneX, y: sceneY } = viewportCoordsToSceneCoords(
    { clientX, clientY },
    appState,
  );

  const threshold = 15 / appState.zoom.value;
  const popupWidth = isVideo ? POPUP_WIDTH_VIDEO : POPUP_WIDTH;
  const popupHeight = isVideo ? POPUP_HEIGHT_VIDEO : POPUP_HEIGHT;
  const spaceBottom = isVideo ? SPACE_BOTTOM_VIDEO : SPACE_BOTTOM;

  // hitbox to prevent hiding when hovered in element bounding box
  if (hitElementBoundingBox(pointFrom(sceneX, sceneY), element, elementsMap)) {
    return false;
  }
  const [x1, y1, x2] = getElementAbsoluteCoords(element, elementsMap);
  // hit box to prevent hiding when hovered in the vertical area between element and popover
  if (
    sceneX >= x1 &&
    sceneX <= x2 &&
    sceneY >= y1 - spaceBottom &&
    sceneY <= y1
  ) {
    return false;
  }
  // hit box to prevent hiding when hovered around popover within threshold
  const { x: popoverX, y: popoverY } = getCoordsForPopover(
    element,
    appState,
    elementsMap,
    isVideo,
  );

  if (
    clientX >= popoverX - threshold &&
    clientX <= popoverX + popupWidth + POPUP_PADDING * 2 + threshold &&
    clientY >= popoverY - threshold &&
    clientY <= popoverY + threshold + POPUP_PADDING * 2 + popupHeight
  ) {
    return false;
  }
  return true;
};
