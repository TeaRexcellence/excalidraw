import {
  applyDarkModeFilter,
  FRAME_STYLE,
  THEME,
  throttleRAF,
} from "@excalidraw/common";
import { isElementLink } from "@excalidraw/element";
import { createPlaceholderEmbeddableLabel } from "@excalidraw/element";
import { getBoundTextElement } from "@excalidraw/element";
import {
  isEmbeddableElement,
  isIframeLikeElement,
  isTextElement,
} from "@excalidraw/element";
import {
  elementOverlapsWithFrame,
  getTargetFrame,
  shouldApplyFrameClip,
} from "@excalidraw/element";

import { renderElement } from "@excalidraw/element";

import { getElementAbsoluteCoords } from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawFrameLikeElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import {
  EXTERNAL_LINK_IMG,
  ELEMENT_LINK_IMG,
  getLinkHandleFromCoords,
} from "../components/hyperlink/helpers";

import { bootstrapCanvas, getNormalizedCanvasDimensions } from "./helpers";

import type {
  StaticCanvasRenderConfig,
  StaticSceneRenderConfig,
} from "../scene/types";
import type { StaticCanvasAppState, Zoom } from "../types";

const GridLineColor = {
  [THEME.LIGHT]: {
    bold: "#dddddd",
    regular: "#d4d4d4",
  },
  [THEME.DARK]: {
    bold: applyDarkModeFilter("#dddddd"),
    regular: applyDarkModeFilter("#e5e5e5"),
  },
} as const;

const GridDotColor = {
  [THEME.LIGHT]: {
    bold: "#d0d0d0",
    regular: "#c4c4c4",
  },
  [THEME.DARK]: {
    bold: "#505050",
    regular: "#444444",
  },
} as const;

/**
 * Compute adaptive grid steps for the current zoom level.
 *
 * The grid shifts at discrete zoom thresholds (powers of gridStep).
 * Between thresholds, it looks exactly like the static grid — just
 * bigger/smaller cells. At each threshold the grid "resets": what were
 * minor cells subdivide into a new minor/major pair that looks identical
 * to the default view.
 *
 * level 0 = default (100% zoom).  Positive = zoomed in.  Negative = zoomed out.
 *
 * Returns scene-space pixel distances.
 */
export const getAdaptiveGridSteps = (
  gridSize: number,
  gridStep: number,
  zoomValue: number,
) => {
  const base = gridStep;

  // Level = how many times we've subdivided (positive) or consolidated (negative).
  // At level 0: minorScreen = gridSize * zoom ≈ gridSize (comfortable).
  // Shift up when minor cells grow to gridSize*base on screen (room to subdivide).
  // Shift down when minor cells shrink below gridSize on screen.
  const level = Math.floor(
    Math.log(gridSize * zoomValue / gridSize) / Math.log(base),
  );

  const minorStep = gridSize / Math.pow(base, level);
  const majorStep = minorStep * base;

  return { minorStep, majorStep, level };
};

const strokeGrid = (
  context: CanvasRenderingContext2D,
  /** grid cell pixel size */
  gridSize: number,
  /** setting to 1 will disable bold lines */
  gridStep: number,
  scrollX: number,
  scrollY: number,
  zoom: Zoom,
  theme: StaticCanvasRenderConfig["theme"],
  width: number,
  height: number,
  /** major grid opacity 0-100 */
  opacity: number = 100,
  /** minor grid opacity 0-100 */
  minorOpacity: number = 100,
  /** grid visual style */
  gridType: "line" | "dot" = "line",
  majorGridEnabled: boolean = true,
  minorGridEnabled: boolean = true,
) => {
  const { minorStep, majorStep } = getAdaptiveGridSteps(
    gridSize,
    gridStep,
    zoom.value,
  );

  const actualMinorSize = minorStep * zoom.value;

  context.save();

  // --- Integer-indexed grid to avoid floating-point accumulation ---
  // Each position is computed as k * minorStep + scrollX (scene→canvas).
  // Major check uses integer k, eliminating modulo drift at deep zoom.
  const isOnMajor = (k: number) =>
    gridStep > 1 &&
    Math.abs(k / gridStep - Math.round(k / gridStep)) < 0.001;

  // Visible grid index ranges (k where k*minorStep + scroll is on screen)
  const firstKx = Math.floor(-scrollX / minorStep) - 1;
  const lastKx = Math.ceil((-scrollX + width) / minorStep) + 1;
  const firstKy = Math.floor(-scrollY / minorStep) - 1;
  const lastKy = Math.ceil((-scrollY + height) / minorStep) + 1;

  if (gridType === "dot") {
    for (let kx = firstKx; kx <= lastKx; kx++) {
      const x = kx * minorStep + scrollX;
      for (let ky = firstKy; ky <= lastKy; ky++) {
        const y = ky * minorStep + scrollY;
        const isBold = isOnMajor(kx) && isOnMajor(ky);

        if (!isBold && (!minorGridEnabled || actualMinorSize < 10)) {
          continue;
        }

        const renderAsBold = isBold && majorGridEnabled;
        context.globalAlpha = (renderAsBold ? opacity : minorOpacity) / 100;

        const radius = renderAsBold
          ? Math.min(2.5 / zoom.value, 4)
          : Math.min(1.4 / zoom.value, 3);

        context.beginPath();
        context.fillStyle = renderAsBold
          ? GridDotColor[theme].bold
          : GridDotColor[theme].regular;
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
    return;
  }

  // Line grid
  const spaceWidth = 1 / zoom.value;

  if (zoom.value === 1) {
    const offsetX = (scrollX % minorStep) - minorStep;
    const offsetY = (scrollY % minorStep) - minorStep;
    context.translate(offsetX % 1 ? 0 : 0.5, offsetY % 1 ? 0 : 0.5);
  }

  // Vertical lines
  for (let kx = firstKx; kx <= lastKx; kx++) {
    const x = kx * minorStep + scrollX;
    const isBold = isOnMajor(kx);
    if (!isBold && (!minorGridEnabled || actualMinorSize < 10)) {
      continue;
    }

    const renderAsBold = isBold && majorGridEnabled;
    context.globalAlpha = (renderAsBold ? opacity : minorOpacity) / 100;

    const lineWidth = Math.min(1 / zoom.value, renderAsBold ? 4 : 1);
    context.lineWidth = lineWidth;
    const lineDash = [lineWidth * 3, spaceWidth + (lineWidth + spaceWidth)];

    context.beginPath();
    context.setLineDash(renderAsBold ? [] : lineDash);
    context.strokeStyle = renderAsBold
      ? GridLineColor[theme].bold
      : GridLineColor[theme].regular;
    const yStart = firstKy * minorStep + scrollY;
    const yEnd = lastKy * minorStep + scrollY;
    context.moveTo(x, yStart);
    context.lineTo(x, yEnd);
    context.stroke();
  }

  // Horizontal lines
  for (let ky = firstKy; ky <= lastKy; ky++) {
    const y = ky * minorStep + scrollY;
    const isBold = isOnMajor(ky);
    if (!isBold && (!minorGridEnabled || actualMinorSize < 10)) {
      continue;
    }

    const renderAsBold = isBold && majorGridEnabled;
    context.globalAlpha = (renderAsBold ? opacity : minorOpacity) / 100;

    const lineWidth = Math.min(1 / zoom.value, renderAsBold ? 4 : 1);
    context.lineWidth = lineWidth;
    const lineDash = [lineWidth * 3, spaceWidth + (lineWidth + spaceWidth)];

    context.beginPath();
    context.setLineDash(renderAsBold ? [] : lineDash);
    context.strokeStyle = renderAsBold
      ? GridLineColor[theme].bold
      : GridLineColor[theme].regular;
    const xStart = firstKx * minorStep + scrollX;
    const xEnd = lastKx * minorStep + scrollX;
    context.moveTo(xStart, y);
    context.lineTo(xEnd, y);
    context.stroke();
  }
  context.restore();
};

export const frameClip = (
  frame: ExcalidrawFrameLikeElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState,
) => {
  context.translate(frame.x + appState.scrollX, frame.y + appState.scrollY);
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(
      0,
      0,
      frame.width,
      frame.height,
      FRAME_STYLE.radius / appState.zoom.value,
    );
  } else {
    context.rect(0, 0, frame.width, frame.height);
  }
  context.clip();
  context.translate(
    -(frame.x + appState.scrollX),
    -(frame.y + appState.scrollY),
  );
};

type LinkIconCanvas = HTMLCanvasElement & { zoom: number };

const linkIconCanvasCache: {
  regularLink: LinkIconCanvas | null;
  elementLink: LinkIconCanvas | null;
} = {
  regularLink: null,
  elementLink: null,
};

const renderLinkIcon = (
  element: NonDeletedExcalidrawElement,
  context: CanvasRenderingContext2D,
  appState: StaticCanvasAppState,
  elementsMap: ElementsMap,
) => {
  if (element.link && !appState.selectedElementIds[element.id]) {
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
    const [x, y, width, height] = getLinkHandleFromCoords(
      [x1, y1, x2, y2],
      element.angle,
      appState,
    );
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    context.save();
    context.translate(appState.scrollX + centerX, appState.scrollY + centerY);
    context.rotate(element.angle);

    const canvasKey = isElementLink(element.link)
      ? "elementLink"
      : "regularLink";

    let linkCanvas = linkIconCanvasCache[canvasKey];

    if (!linkCanvas || linkCanvas.zoom !== appState.zoom.value) {
      linkCanvas = Object.assign(document.createElement("canvas"), {
        zoom: appState.zoom.value,
      });
      linkCanvas.width = width * window.devicePixelRatio * appState.zoom.value;
      linkCanvas.height =
        height * window.devicePixelRatio * appState.zoom.value;
      linkIconCanvasCache[canvasKey] = linkCanvas;

      const linkCanvasCacheContext = linkCanvas.getContext("2d")!;
      linkCanvasCacheContext.scale(
        window.devicePixelRatio * appState.zoom.value,
        window.devicePixelRatio * appState.zoom.value,
      );
      linkCanvasCacheContext.fillStyle = appState.viewBackgroundColor || "#fff";
      linkCanvasCacheContext.fillRect(0, 0, width, height);

      if (canvasKey === "elementLink") {
        linkCanvasCacheContext.drawImage(ELEMENT_LINK_IMG, 0, 0, width, height);
      } else {
        linkCanvasCacheContext.drawImage(
          EXTERNAL_LINK_IMG,
          0,
          0,
          width,
          height,
        );
      }

      linkCanvasCacheContext.restore();
    }
    context.globalAlpha = element.opacity / 100;
    context.drawImage(linkCanvas, x - centerX, y - centerY, width, height);
    context.restore();
  }
};
const _renderStaticScene = ({
  canvas,
  rc,
  elementsMap,
  allElementsMap,
  visibleElements,
  scale,
  appState,
  renderConfig,
}: StaticSceneRenderConfig) => {
  if (canvas === null) {
    return;
  }

  const { renderGrid = true, isExporting } = renderConfig;

  const [normalizedWidth, normalizedHeight] = getNormalizedCanvasDimensions(
    canvas,
    scale,
  );

  const context = bootstrapCanvas({
    canvas,
    scale,
    normalizedWidth,
    normalizedHeight,
    theme: appState.theme,
    isExporting,
    viewBackgroundColor: appState.viewBackgroundColor,
  });

  // Apply zoom
  context.scale(appState.zoom.value, appState.zoom.value);

  // Grid
  if (renderGrid) {
    strokeGrid(
      context,
      appState.gridSize,
      appState.gridStep,
      appState.scrollX,
      appState.scrollY,
      appState.zoom,
      renderConfig.theme,
      normalizedWidth / appState.zoom.value,
      normalizedHeight / appState.zoom.value,
      appState.gridOpacity,
      appState.gridMinorOpacity,
      appState.gridType,
      appState.majorGridEnabled,
      appState.minorGridEnabled,
    );
  }

  // Axes
  if (appState.axesEnabled) {
    const w = normalizedWidth / appState.zoom.value;
    const h = normalizedHeight / appState.zoom.value;
    const axisColor =
      appState.theme === THEME.LIGHT
        ? "rgba(140, 140, 140, 0.3)"
        : "rgba(160, 160, 160, 0.2)";
    const labelColor =
      appState.theme === THEME.LIGHT
        ? "rgba(120, 120, 120, 0.5)"
        : "rgba(180, 180, 180, 0.4)";

    context.save();
    context.strokeStyle = axisColor;
    context.lineWidth = Math.min(1.5 / appState.zoom.value, 3);
    context.setLineDash([]);
    // X-axis (horizontal through scene y=0)
    context.beginPath();
    context.moveTo(0, appState.scrollY);
    context.lineTo(w, appState.scrollY);
    context.stroke();
    // Y-axis (vertical through scene x=0)
    context.beginPath();
    context.moveTo(appState.scrollX, 0);
    context.lineTo(appState.scrollX, h);
    context.stroke();

    // Axis labels — same discrete levels as the grid
    const { minorStep: axisMinor, majorStep: axisMajor, level: axisLevel } =
      getAdaptiveGridSteps(appState.gridSize, appState.gridStep, appState.zoom.value);

    const gs = appState.gridSize;
    const minScreenGap = 30;

    // Label at every minor cell when they're big enough, else at major positions
    const minorScreenSize = axisMinor * appState.zoom.value;
    let labelInterval: number;
    if (minorScreenSize >= minScreenGap) {
      labelInterval = axisMinor;
    } else {
      // Major positions — these are the old minor positions from the
      // previous level, so labels never disappear
      const majorScreenSize = axisMajor * appState.zoom.value;
      const majorSkip = majorScreenSize >= minScreenGap
        ? 1
        : Math.ceil(minScreenGap / majorScreenSize);
      labelInterval = axisMajor * majorSkip;
    }

    // Decimal places = number of subdivision levels deep
    const decimals = Math.max(0, axisLevel);

    const formatLabel = (scenePos: number) => {
      const cellValue = scenePos / gs;
      return decimals > 0
        ? cellValue.toFixed(decimals)
        : String(Math.round(cellValue));
    };

    // Switch to screen-space for text so font size stays constant
    context.save();
    context.scale(1 / appState.zoom.value, 1 / appState.zoom.value);

    const fontSize = 11;
    context.font = `${fontSize}px sans-serif`;
    context.fillStyle = labelColor;
    context.textBaseline = "top";

    // Visible scene range
    const sceneLeft = -appState.scrollX;
    const sceneRight = sceneLeft + w;
    const sceneTop = -appState.scrollY;
    const sceneBottom = sceneTop + h;

    // X-axis labels (integer-indexed to avoid float drift at deep zoom)
    context.textAlign = "center";
    const firstLabelKx = Math.ceil(sceneLeft / labelInterval);
    const lastLabelKx = Math.floor(sceneRight / labelInterval);
    for (let k = firstLabelKx; k <= lastLabelKx; k++) {
      const x = k * labelInterval;
      if (Math.abs(x) < labelInterval * 0.01) {
        continue; // skip 0 (drawn at origin)
      }
      const screenX = (x + appState.scrollX) * appState.zoom.value;
      const screenY = appState.scrollY * appState.zoom.value + 4;
      context.fillText(formatLabel(x), screenX, screenY);
    }

    // Y-axis labels (negated: canvas Y down → math Y up)
    context.textAlign = "right";
    context.textBaseline = "middle";
    const firstLabelKy = Math.ceil(sceneTop / labelInterval);
    const lastLabelKy = Math.floor(sceneBottom / labelInterval);
    for (let k = firstLabelKy; k <= lastLabelKy; k++) {
      const y = k * labelInterval;
      if (Math.abs(y) < labelInterval * 0.01) {
        continue;
      }
      const screenX = appState.scrollX * appState.zoom.value - 4;
      const screenY = (y + appState.scrollY) * appState.zoom.value;
      context.fillText(formatLabel(-y), screenX, screenY);
    }

    // "0" at origin
    context.textAlign = "right";
    context.textBaseline = "top";
    context.fillText(
      "0",
      appState.scrollX * appState.zoom.value - 4,
      appState.scrollY * appState.zoom.value + 4,
    );

    context.restore(); // back to zoom-scaled space
    context.restore(); // back to original state
  }

  const groupsToBeAddedToFrame = new Set<string>();

  visibleElements.forEach((element) => {
    if (
      element.groupIds.length > 0 &&
      appState.frameToHighlight &&
      appState.selectedElementIds[element.id] &&
      (elementOverlapsWithFrame(
        element,
        appState.frameToHighlight,
        elementsMap,
      ) ||
        element.groupIds.find((groupId) => groupsToBeAddedToFrame.has(groupId)))
    ) {
      element.groupIds.forEach((groupId) =>
        groupsToBeAddedToFrame.add(groupId),
      );
    }
  });

  const inFrameGroupsMap = new Map<string, boolean>();

  // Paint visible elements
  visibleElements
    .filter((el) => !isIframeLikeElement(el))
    .forEach((element) => {
      try {
        const frameId = element.frameId || appState.frameToHighlight?.id;

        if (
          isTextElement(element) &&
          element.containerId &&
          elementsMap.has(element.containerId)
        ) {
          // will be rendered with the container
          return;
        }

        context.save();

        if (
          frameId &&
          appState.frameRendering.enabled &&
          appState.frameRendering.clip
        ) {
          const frame = getTargetFrame(element, elementsMap, appState);
          if (
            frame &&
            shouldApplyFrameClip(
              element,
              frame,
              appState,
              elementsMap,
              inFrameGroupsMap,
            )
          ) {
            frameClip(frame, context, renderConfig, appState);
          }
          renderElement(
            element,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );
        } else {
          renderElement(
            element,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );
        }

        const boundTextElement = getBoundTextElement(element, elementsMap);
        if (boundTextElement) {
          renderElement(
            boundTextElement,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );
        }

        context.restore();

        if (!isExporting) {
          renderLinkIcon(element, context, appState, elementsMap);
        }
      } catch (error: any) {
        console.error(
          error,
          element.id,
          element.x,
          element.y,
          element.width,
          element.height,
        );
      }
    });

  // render embeddables on top
  visibleElements
    .filter((el) => isIframeLikeElement(el))
    .forEach((element) => {
      try {
        const render = () => {
          renderElement(
            element,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );

          if (
            isIframeLikeElement(element) &&
            (isExporting ||
              (isEmbeddableElement(element) &&
                renderConfig.embedsValidationStatus.get(element.id) !==
                  true)) &&
            element.width &&
            element.height
          ) {
            // Check if we have a preloaded video thumbnail for this element
            const thumbnailImg = renderConfig.videoThumbnails?.get(element.id);
            if (thumbnailImg && isExporting) {
              // Draw video thumbnail instead of placeholder
              context.save();

              const zoom = appState.zoom.value;
              const x = (element.x + appState.scrollX) * zoom;
              const y = (element.y + appState.scrollY) * zoom;
              const width = element.width * zoom;
              const height = element.height * zoom;

              // Apply element rotation if any
              if (element.angle) {
                const cx = x + width / 2;
                const cy = y + height / 2;
                context.translate(cx, cy);
                context.rotate(element.angle);
                context.translate(-cx, -cy);
              }

              // Apply element opacity
              context.globalAlpha = element.opacity / 100;

              // Draw thumbnail scaled to element bounds
              context.drawImage(thumbnailImg, x, y, width, height);

              context.restore();
            } else {
              // Fall back to placeholder label
              const label = createPlaceholderEmbeddableLabel(element);
              renderElement(
                label,
                elementsMap,
                allElementsMap,
                rc,
                context,
                renderConfig,
                appState,
              );
            }
          }
          if (!isExporting) {
            renderLinkIcon(element, context, appState, elementsMap);
          }
        };
        // - when exporting the whole canvas, we DO NOT apply clipping
        // - when we are exporting a particular frame, apply clipping
        //   if the containing frame is not selected, apply clipping
        const frameId = element.frameId || appState.frameToHighlight?.id;

        if (
          frameId &&
          appState.frameRendering.enabled &&
          appState.frameRendering.clip
        ) {
          context.save();

          const frame = getTargetFrame(element, elementsMap, appState);

          if (
            frame &&
            shouldApplyFrameClip(
              element,
              frame,
              appState,
              elementsMap,
              inFrameGroupsMap,
            )
          ) {
            frameClip(frame, context, renderConfig, appState);
          }
          render();
          context.restore();
        } else {
          render();
        }
      } catch (error: any) {
        console.error(error);
      }
    });

  // render pending nodes for flowcharts
  renderConfig.pendingFlowchartNodes?.forEach((element) => {
    try {
      renderElement(
        element,
        elementsMap,
        allElementsMap,
        rc,
        context,
        renderConfig,
        appState,
      );
    } catch (error) {
      console.error(error);
    }
  });
};

/** throttled to animation framerate */
export const renderStaticSceneThrottled = throttleRAF(
  (config: StaticSceneRenderConfig) => {
    _renderStaticScene(config);
  },
  { trailing: true },
);

/**
 * Static scene is the non-ui canvas where we render elements.
 */
export const renderStaticScene = (
  renderConfig: StaticSceneRenderConfig,
  throttle?: boolean,
) => {
  if (throttle) {
    renderStaticSceneThrottled(renderConfig);
    return;
  }

  _renderStaticScene(renderConfig);
};
