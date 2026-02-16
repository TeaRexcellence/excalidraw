import { THEME, applyDarkModeFilter, getFontFamilyString } from "@excalidraw/common";

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

const BASE_SCROLLBAR_WIDTH = 3;
const MIN_SCROLLBAR_WIDTH = 2;
const SCROLLBAR_MIN_HEIGHT = 20;
const SCROLLBAR_COLOR_LIGHT = "rgba(0,0,0,0.12)";
const SCROLLBAR_COLOR_DARK = "rgba(255,255,255,0.15)";

const getFontSize = (rowHeight: number): number => {
  return Math.max(
    MIN_FONT_SIZE,
    Math.min(MAX_FONT_SIZE, rowHeight * FONT_RATIO),
  );
};

/**
 * Draw a rectangular range of cells: opaque background, header highlight,
 * grid lines, and cell text.  The caller sets up translate() and clip()
 * so that content-space coordinates map to the correct viewport position.
 */
const drawCellRange = (
  ctx: CanvasRenderingContext2D,
  element: ExcalidrawTableElement,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
  tableFontSize: number,
  fontFamilyStr: string,
  strokeColor: string,
  gridColor: string,
  isDark: boolean,
  lineWidth: number,
) => {
  const { cells, columnWidths, rowHeights, headerRow } = element;

  // Content-space origin for this range
  let zoneX = 0;
  for (let c = 0; c < colStart; c++) {
    zoneX += columnWidths[c];
  }
  let zoneY = 0;
  for (let r = 0; r < rowStart; r++) {
    zoneY += rowHeights[r];
  }
  let zoneW = 0;
  for (let c = colStart; c < colEnd; c++) {
    zoneW += columnWidths[c];
  }
  let zoneH = 0;
  for (let r = rowStart; r < rowEnd; r++) {
    zoneH += rowHeights[r];
  }

  // 1. Opaque background (must cover scrolled content behind)
  if (element.backgroundColor && element.backgroundColor !== "transparent") {
    ctx.fillStyle = isDark
      ? applyDarkModeFilter(element.backgroundColor)
      : element.backgroundColor;
  } else {
    // Default opaque fill when no explicit background
    ctx.fillStyle = isDark ? "#1e1e1e" : "#ffffff";
  }
  ctx.fillRect(zoneX, zoneY, zoneW, zoneH);

  // 2. Header row background (only if row 0 is in range)
  if (headerRow && rowStart === 0 && element.rows > 0) {
    ctx.fillStyle = isDark ? TABLE_HEADER_BG_DARK : TABLE_HEADER_BG_LIGHT;
    ctx.fillRect(zoneX, 0, zoneW, rowHeights[0]);
  }

  // 3. Grid lines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = lineWidth;

  // Horizontal inner lines
  let y = zoneY;
  for (let r = rowStart; r < rowEnd; r++) {
    y += rowHeights[r];
    if (r < rowEnd - 1) {
      ctx.beginPath();
      ctx.moveTo(zoneX, y);
      ctx.lineTo(zoneX + zoneW, y);
      ctx.stroke();
    }
  }

  // Vertical inner lines
  let x = zoneX;
  for (let c = colStart; c < colEnd; c++) {
    x += columnWidths[c];
    if (c < colEnd - 1) {
      ctx.beginPath();
      ctx.moveTo(x, zoneY);
      ctx.lineTo(x, zoneY + zoneH);
      ctx.stroke();
    }
  }

  // 4. Cell text
  const cellPadding = Math.max(1, tableFontSize * PADDING_RATIO);
  ctx.textBaseline = "middle";

  y = zoneY;
  for (let r = rowStart; r < rowEnd; r++) {
    x = zoneX;
    const cellH = rowHeights[r];
    const isHeader = headerRow && r === 0;
    ctx.font = `${isHeader ? "bold " : ""}${tableFontSize}px ${fontFamilyStr}`;

    for (let c = colStart; c < colEnd; c++) {
      const text = cells[r]?.[c] || "";
      if (text) {
        const cellW = columnWidths[c];
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cellW, cellH);
        ctx.clip();
        ctx.fillStyle = strokeColor;
        ctx.textAlign = "left";
        const maxTextWidth = cellW - cellPadding * 2;
        let displayText = text;
        if (ctx.measureText(text).width > maxTextWidth) {
          while (
            displayText.length > 0 &&
            ctx.measureText(`${displayText}\u2026`).width > maxTextWidth
          ) {
            displayText = displayText.slice(0, -1);
          }
          displayText += "\u2026";
        }
        ctx.fillText(
          displayText,
          x + cellPadding,
          y + cellH / 2,
          maxTextWidth,
        );
        ctx.restore();
      }
      x += columnWidths[c];
    }
    y += rowHeights[r];
  }
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

  // Clamp frozen values to actual dimensions
  const frozenRows = Math.min(element.frozenRows || 0, rows);
  const frozenColumns = Math.min(element.frozenColumns || 0, columns);

  const totalWidth = columnWidths.reduce((s, w) => s + w, 0);
  const totalHeight = rowHeights.reduce((s, h) => s + h, 0);
  const isDark = renderConfig.theme === THEME.DARK;

  const cx = cropX || 0;
  const cy = cropY || 0;

  const viewWidth = element.width;
  const viewHeight = element.height;
  const contentHeight = totalHeight;
  const scrollOffset = scrollOffsetY || 0;
  const isScrollable = contentHeight - cy > viewHeight + 1; // +1 for float tolerance

  // Frozen zone dimensions in content space
  let frozenRowH = 0;
  for (let r = 0; r < frozenRows; r++) {
    frozenRowH += rowHeights[r];
  }
  let frozenColW = 0;
  for (let c = 0; c < frozenColumns; c++) {
    frozenColW += columnWidths[c];
  }

  // Viewport-space height of visible frozen rows (crop may partially hide them)
  const frozenRowClipH = Math.max(0, frozenRowH - cy);
  // Frozen cols are not affected by cropX, so full width is always visible
  const frozenColClipW = frozenColW;

  const hasFrozenRows = frozenRows > 0 && frozenRowClipH > 0;
  const hasFrozenCols = frozenColumns > 0 && frozenColClipW > 0;

  // Clip to element viewport bounds
  context.beginPath();
  context.rect(0, 0, viewWidth, viewHeight);
  context.clip();

  // Common computed values
  const strokeColor = isDark
    ? applyDarkModeFilter(element.strokeColor)
    : element.strokeColor;
  const gridColor = isDark ? TABLE_GRID_COLOR_DARK : TABLE_GRID_COLOR_LIGHT;

  const minRowH = Math.min(...rowHeights);
  const tableFontSize = element.fontSize
    ? Math.min(element.fontSize, minRowH * 0.85)
    : getFontSize(minRowH);
  // Scale scrollbar with font size (base 8px = default), min 2px
  const scrollbarWidth = Math.max(
    MIN_SCROLLBAR_WIDTH,
    BASE_SCROLLBAR_WIDTH * (tableFontSize / 8),
  );
  const fontFamilyStr = element.fontFamily
    ? getFontFamilyString({ fontFamily: element.fontFamily })
    : "Virgil, Segoe UI Emoji";

  // Scale grid lines with table size — 1px at normal size, thinner when small
  // Base reference: 14px row height = 1px lines
  const gridLineWidth = Math.max(0.2, Math.min(1, minRowH / 14));


  // ════════════════════════════════════════════════════════════════════
  // PASS 1: Base content (all rows/cols with scroll + crop translation)
  // ════════════════════════════════════════════════════════════════════
  context.save();
  context.translate(-cx, -cy - scrollOffset);

  // 1. Background fill
  if (element.backgroundColor && element.backgroundColor !== "transparent") {
    context.fillStyle = isDark
      ? applyDarkModeFilter(element.backgroundColor)
      : element.backgroundColor;
    context.fillRect(0, 0, totalWidth, totalHeight);
  }

  // 2. Header row background
  if (headerRow && rows > 0) {
    context.fillStyle = isDark ? TABLE_HEADER_BG_DARK : TABLE_HEADER_BG_LIGHT;
    context.fillRect(0, 0, totalWidth, rowHeights[0]);
  }

  // 3. Inner grid lines
  context.strokeStyle = gridColor;
  context.lineWidth = gridLineWidth;

  let y = 0;
  for (let r = 1; r < rows; r++) {
    y += rowHeights[r - 1];
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(totalWidth, y);
    context.stroke();
  }

  let x = 0;
  for (let c = 1; c < columns; c++) {
    x += columnWidths[c - 1];
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, totalHeight);
    context.stroke();
  }

  // 4. Cell text
  context.fillStyle = strokeColor;
  context.textBaseline = "middle";
  const cellPadding = Math.max(1, tableFontSize * PADDING_RATIO);

  y = 0;
  for (let r = 0; r < rows; r++) {
    x = 0;
    const cellH = rowHeights[r];
    const isHeader = headerRow && r === 0;
    context.font = `${isHeader ? "bold " : ""}${tableFontSize}px ${fontFamilyStr}`;

    // Skip rows entirely above the visible area for performance
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
        context.beginPath();
        context.rect(x, y, cellW, cellH);
        context.clip();

        context.fillStyle = strokeColor;
        context.textAlign = "left";
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

  // End base pass
  context.restore();

  // ════════════════════════════════════════════════════════════════════
  // PASS 2: Frozen rows overlay (top strip)
  // Translates with cropX/cropY but NOT scrollOffset — rows stay pinned
  // ════════════════════════════════════════════════════════════════════
  if (hasFrozenRows) {
    context.save();
    context.beginPath();
    context.rect(0, 0, viewWidth, frozenRowClipH);
    context.clip();
    context.translate(-cx, -cy);
    drawCellRange(
      context,
      element,
      0,
      frozenRows,
      0,
      columns,
      tableFontSize,
      fontFamilyStr,
      strokeColor,
      gridColor,
      isDark,
      gridLineWidth,
    );
    context.restore();
  }

  // ════════════════════════════════════════════════════════════════════
  // PASS 3: Frozen columns overlay (left strip)
  // Translates with scrollOffset but NOT cropX — cols stay pinned left
  // ════════════════════════════════════════════════════════════════════
  if (hasFrozenCols) {
    context.save();
    context.beginPath();
    context.rect(0, 0, frozenColClipW, viewHeight);
    context.clip();
    context.translate(0, -cy - scrollOffset);
    drawCellRange(
      context,
      element,
      0,
      rows,
      0,
      frozenColumns,
      tableFontSize,
      fontFamilyStr,
      strokeColor,
      gridColor,
      isDark,
      gridLineWidth,
    );
    context.restore();
  }

  // ════════════════════════════════════════════════════════════════════
  // PASS 4: Frozen corner overlay (top-left intersection)
  // No cropX and no scrollOffset — corner is fully pinned
  // ════════════════════════════════════════════════════════════════════
  if (hasFrozenRows && hasFrozenCols) {
    context.save();
    context.beginPath();
    context.rect(0, 0, frozenColClipW, frozenRowClipH);
    context.clip();
    context.translate(0, -cy);
    drawCellRange(
      context,
      element,
      0,
      frozenRows,
      0,
      frozenColumns,
      tableFontSize,
      fontFamilyStr,
      strokeColor,
      gridColor,
      isDark,
      gridLineWidth,
    );
    context.restore();
  }

  // ════════════════════════════════════════════════════════════════════
  // Scrollbar indicator (outside scroll translation, inside viewport clip)
  // ════════════════════════════════════════════════════════════════════
  if (isScrollable) {
    // Scrollbar track starts below visible frozen rows
    const trackStart = hasFrozenRows ? frozenRowClipH : 0;
    const trackHeight = viewHeight - trackStart;

    const scrollableHeight = contentHeight - cy;
    const maxScroll = scrollableHeight - viewHeight;
    const scrollRatio = maxScroll > 0 ? scrollOffset / maxScroll : 0;
    const thumbHeight = Math.max(
      SCROLLBAR_MIN_HEIGHT,
      (trackHeight / scrollableHeight) * trackHeight,
    );
    const thumbY = trackStart + scrollRatio * (trackHeight - thumbHeight);

    context.fillStyle = isDark ? SCROLLBAR_COLOR_DARK : SCROLLBAR_COLOR_LIGHT;
    const radius = scrollbarWidth / 2;
    const sbX = viewWidth - scrollbarWidth - 2;

    // Rounded rect for scrollbar thumb
    context.beginPath();
    context.moveTo(sbX + radius, thumbY);
    context.lineTo(sbX + scrollbarWidth - radius, thumbY);
    context.arcTo(
      sbX + scrollbarWidth,
      thumbY,
      sbX + scrollbarWidth,
      thumbY + radius,
      radius,
    );
    context.lineTo(sbX + scrollbarWidth, thumbY + thumbHeight - radius);
    context.arcTo(
      sbX + scrollbarWidth,
      thumbY + thumbHeight,
      sbX + scrollbarWidth - radius,
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
