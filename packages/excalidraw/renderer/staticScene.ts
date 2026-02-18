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

const strokeGrid = (
  context: CanvasRenderingContext2D,
  /** grid cell pixel size */
  gridSize: number,
  /** setting to 1 will disble bold lines */
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
  const offsetX = (scrollX % gridSize) - gridSize;
  const offsetY = (scrollY % gridSize) - gridSize;

  const actualGridSize = gridSize * zoom.value;

  context.save();

  if (gridType === "dot") {
    // Dot grid: draw circles at each grid intersection
    for (let x = offsetX; x < offsetX + width + gridSize * 2; x += gridSize) {
      for (
        let y = offsetY;
        y < offsetY + height + gridSize * 2;
        y += gridSize
      ) {
        const isBoldX =
          gridStep > 1 &&
          Math.round(x - scrollX) % (gridStep * gridSize) === 0;
        const isBoldY =
          gridStep > 1 &&
          Math.round(y - scrollY) % (gridStep * gridSize) === 0;
        const isBold = isBoldX && isBoldY;

        // skip minor dots when minor disabled or zoomed out
        if (!isBold && (!minorGridEnabled || actualGridSize < 10)) {
          continue;
        }

        // When major disabled, render major positions as minor style
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

  // Line grid (original behavior)
  const spaceWidth = 1 / zoom.value;

  // Offset rendering by 0.5 to ensure that 1px wide lines are crisp.
  // We only do this when zoomed to 100% because otherwise the offset is
  // fractional, and also visibly offsets the elements.
  // We also do this per-axis, as each axis may already be offset by 0.5.
  if (zoom.value === 1) {
    context.translate(offsetX % 1 ? 0 : 0.5, offsetY % 1 ? 0 : 0.5);
  }

  // vertical lines
  for (let x = offsetX; x < offsetX + width + gridSize * 2; x += gridSize) {
    const isBold =
      gridStep > 1 && Math.round(x - scrollX) % (gridStep * gridSize) === 0;
    // skip minor lines when minor disabled or zoomed out
    if (!isBold && (!minorGridEnabled || actualGridSize < 10)) {
      continue;
    }

    // When major disabled, render major positions as minor style
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
    context.moveTo(x, offsetY - gridSize);
    context.lineTo(x, Math.ceil(offsetY + height + gridSize * 2));
    context.stroke();
  }

  for (let y = offsetY; y < offsetY + height + gridSize * 2; y += gridSize) {
    const isBold =
      gridStep > 1 && Math.round(y - scrollY) % (gridStep * gridSize) === 0;
    // skip minor lines when minor disabled or zoomed out
    if (!isBold && (!minorGridEnabled || actualGridSize < 10)) {
      continue;
    }

    // When major disabled, render major positions as minor style
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
    context.moveTo(offsetX - gridSize, y);
    context.lineTo(Math.ceil(offsetX + width + gridSize * 2), y);
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
        ? "rgba(100, 100, 100, 0.5)"
        : "rgba(180, 180, 180, 0.4)";
    const labelColor =
      appState.theme === THEME.LIGHT
        ? "rgba(80, 80, 80, 0.7)"
        : "rgba(200, 200, 200, 0.6)";

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

    // Axis labels — each minor grid cell = 1 unit, labels count from origin
    // gridStep is the base (e.g. 10 → base-10, 6 → base-6)
    // Labels at every minor line when zoomed in, thin to major lines when zoomed out
    const gs = appState.gridSize;
    const minorScreenSize = gs * appState.zoom.value;
    const minScreenGap = 30;
    let labelStep: number; // in minor-cell units
    if (minorScreenSize >= minScreenGap) {
      // Zoomed in enough: label every minor cell
      labelStep = 1;
    } else {
      // Zoomed out: label at major lines (every gridStep cells)
      const majorScreenSize = gs * appState.gridStep * appState.zoom.value;
      const majorSkip = majorScreenSize >= minScreenGap
        ? 1
        : Math.ceil(minScreenGap / majorScreenSize);
      labelStep = appState.gridStep * majorSkip;
    }
    const labelInterval = gs * labelStep;

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

    // X-axis labels (cell count from origin)
    context.textAlign = "center";
    const xStart = Math.ceil(sceneLeft / labelInterval) * labelInterval;
    for (let x = xStart; x <= sceneRight; x += labelInterval) {
      const cellCount = Math.round(x / gs);
      if (cellCount === 0) {
        continue; // skip 0 (drawn at origin)
      }
      const screenX = (x + appState.scrollX) * appState.zoom.value;
      const screenY = appState.scrollY * appState.zoom.value + 4;
      context.fillText(String(cellCount), screenX, screenY);
    }

    // Y-axis labels (negated: canvas Y down → math Y up)
    context.textAlign = "right";
    context.textBaseline = "middle";
    const yStart = Math.ceil(sceneTop / labelInterval) * labelInterval;
    for (let y = yStart; y <= sceneBottom; y += labelInterval) {
      const cellCount = Math.round(y / gs);
      if (cellCount === 0) {
        continue;
      }
      const screenX = appState.scrollX * appState.zoom.value - 4;
      const screenY = (y + appState.scrollY) * appState.zoom.value;
      context.fillText(String(-cellCount), screenX, screenY);
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
