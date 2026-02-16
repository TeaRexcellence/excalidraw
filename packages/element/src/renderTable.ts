import { THEME, applyDarkModeFilter } from "@excalidraw/common";

import type { StaticCanvasRenderConfig } from "@excalidraw/excalidraw/scene/types";

import type { ExcalidrawTableElement } from "./types";

const TABLE_HEADER_BG_LIGHT = "rgba(213, 216, 235, 0.35)";
const TABLE_HEADER_BG_DARK = "rgba(99, 102, 140, 0.35)";
const TABLE_GRID_COLOR_LIGHT = "#c4c4c4";
const TABLE_GRID_COLOR_DARK = "#555";

// Font scales with row height: ~44% of row height, clamped
const MIN_FONT_SIZE = 1;
const MAX_FONT_SIZE = 72;
const FONT_RATIO = 0.44;
// Padding scales with font size
const PADDING_RATIO = 0.5;

const SCROLLBAR_WIDTH = 6;
const SCROLLBAR_MIN_HEIGHT = 20;
const SCROLLBAR_COLOR_LIGHT = "rgba(0,0,0,0.25)";
const SCROLLBAR_COLOR_DARK = "rgba(255,255,255,0.3)";

const getFontSize = (rowHeight: number): number => {
  return Math.max(
    MIN_FONT_SIZE,
    Math.min(MAX_FONT_SIZE, rowHeight * FONT_RATIO),
  );
};

export const drawTableOnCanvas = (
  element: ExcalidrawTableElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
) => {
  context.save();

  const {
    rows,
    columns,
    cells,
    columnWidths,
    rowHeights,
    headerRow,
    scrollOffsetY,
    cropX,
    cropY,
  } = element;
  const totalWidth = columnWidths.reduce((s, w) => s + w, 0);
  const totalHeight = rowHeights.reduce((s, h) => s + h, 0);
  const isDark = renderConfig.theme === THEME.DARK;

  const cx = cropX || 0;
  const cy = cropY || 0;

  // The element's rendered viewport (may be smaller than content when cropped/scrollable)
  const viewWidth = element.width;
  const viewHeight = element.height;
  const contentHeight = totalHeight;
  const scrollOffset = scrollOffsetY || 0;
  const isScrollable = contentHeight - cy > viewHeight + 1; // +1 for float tolerance

  // Clip to element viewport bounds
  context.beginPath();
  context.rect(0, 0, viewWidth, viewHeight);
  context.clip();

  // Apply crop offset and scroll translation
  context.save();
  context.translate(-cx, -cy - scrollOffset);

  // 1. Draw background fill if backgroundColor is set
  if (element.backgroundColor && element.backgroundColor !== "transparent") {
    context.fillStyle = isDark
      ? applyDarkModeFilter(element.backgroundColor)
      : element.backgroundColor;
    context.fillRect(0, 0, totalWidth, totalHeight);
  }

  // 2. Draw header row background
  if (headerRow && rows > 0) {
    context.fillStyle = isDark ? TABLE_HEADER_BG_DARK : TABLE_HEADER_BG_LIGHT;
    context.fillRect(0, 0, totalWidth, rowHeights[0]);
  }

  const strokeColor = isDark
    ? applyDarkModeFilter(element.strokeColor)
    : element.strokeColor;
  const gridColor = isDark ? TABLE_GRID_COLOR_DARK : TABLE_GRID_COLOR_LIGHT;

  // 3. Draw inner grid lines (thinner)
  context.strokeStyle = gridColor;
  context.lineWidth = 1;

  // Horizontal inner lines
  let y = 0;
  for (let r = 1; r < rows; r++) {
    y += rowHeights[r - 1];
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(totalWidth, y);
    context.stroke();
  }

  // Vertical inner lines
  let x = 0;
  for (let c = 1; c < columns; c++) {
    x += columnWidths[c - 1];
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, totalHeight);
    context.stroke();
  }

  // 4. Draw cell text — font scales with row height
  context.fillStyle = strokeColor;
  context.textBaseline = "middle";

  y = 0;
  for (let r = 0; r < rows; r++) {
    x = 0;
    const cellH = rowHeights[r];
    const fontSize = getFontSize(cellH);
    const cellPadding = Math.max(4, fontSize * PADDING_RATIO);
    const isHeader = headerRow && r === 0;

    const font = `${
      isHeader ? "bold " : ""
    }${fontSize}px Virgil, Segoe UI Emoji`;
    context.font = font;

    // Skip rows entirely above the visible area for performance
    // The visible region in content-space is [cy + scrollOffset, cy + scrollOffset + viewHeight]
    if (y + cellH < cy + scrollOffset) {
      y += cellH;
      continue;
    }
    // Stop drawing rows entirely below the visible area
    if (y > cy + scrollOffset + viewHeight) {
      break;
    }

    for (let c = 0; c < columns; c++) {
      const text = cells[r]?.[c] || "";
      if (text) {
        const cellW = columnWidths[c];

        context.save();

        // Clip to cell bounds to prevent overflow
        context.beginPath();
        context.rect(x, y, cellW, cellH);
        context.clip();

        context.fillStyle = strokeColor;
        context.textAlign = "left";

        // Truncate text that doesn't fit
        const maxTextWidth = cellW - cellPadding * 2;
        let displayText = text;
        const measured = context.measureText(text);
        if (measured.width > maxTextWidth) {
          while (
            displayText.length > 0 &&
            context.measureText(`${displayText}\u2026`).width > maxTextWidth
          ) {
            displayText = displayText.slice(0, -1);
          }
          displayText += "\u2026";
        }

        context.fillText(
          displayText,
          x + cellPadding,
          y + cellH / 2,
          maxTextWidth,
        );

        context.restore();
      }
      x += columnWidths[c];
    }
    y += rowHeights[r];
  }

  // End scroll translation
  context.restore();

  // 6. Draw scrollbar indicator (outside of scroll translation, inside clip)
  if (isScrollable) {
    const scrollableHeight = contentHeight - cy;
    const maxScroll = scrollableHeight - viewHeight;
    const scrollRatio = scrollOffset / maxScroll;
    const thumbHeight = Math.max(
      SCROLLBAR_MIN_HEIGHT,
      (viewHeight / scrollableHeight) * viewHeight,
    );
    const thumbY = scrollRatio * (viewHeight - thumbHeight);

    context.fillStyle = isDark ? SCROLLBAR_COLOR_DARK : SCROLLBAR_COLOR_LIGHT;
    const radius = SCROLLBAR_WIDTH / 2;
    const sbX = viewWidth - SCROLLBAR_WIDTH - 2;

    // Rounded rect for scrollbar thumb
    context.beginPath();
    context.moveTo(sbX + radius, thumbY);
    context.lineTo(sbX + SCROLLBAR_WIDTH - radius, thumbY);
    context.arcTo(
      sbX + SCROLLBAR_WIDTH,
      thumbY,
      sbX + SCROLLBAR_WIDTH,
      thumbY + radius,
      radius,
    );
    context.lineTo(sbX + SCROLLBAR_WIDTH, thumbY + thumbHeight - radius);
    context.arcTo(
      sbX + SCROLLBAR_WIDTH,
      thumbY + thumbHeight,
      sbX + SCROLLBAR_WIDTH - radius,
      thumbY + thumbHeight,
      radius,
    );
    context.lineTo(sbX + radius, thumbY + thumbHeight);
    context.arcTo(
      sbX,
      thumbY + thumbHeight,
      sbX,
      thumbY + thumbHeight - radius,
      radius,
    );
    context.lineTo(sbX, thumbY + radius);
    context.arcTo(sbX, thumbY, sbX + radius, thumbY, radius);
    context.closePath();
    context.fill();
  }

  context.restore();
};
