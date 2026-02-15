import type { StaticCanvasRenderConfig } from "@excalidraw/excalidraw/scene/types";

import type { ExcalidrawProjectLinkElement } from "./types";

// Design dimensions — all drawing uses these fixed values,
// then the canvas is scaled to match the actual element size.
const BASE_WIDTH = 240;

const CORNER_RADIUS = 10;
const ARROW_ZONE_WIDTH = 48;
const PADDING = 12;
const TITLE_FONT = "bold 14px sans-serif";
const DESC_FONT = "12px sans-serif";
const PROJECT_FONT = "11px sans-serif";

const LIGHT_BG = "#ffffff";
const DARK_BG = "#2d2d3d";
const LIGHT_BORDER = "#d1d5db";
const DARK_BORDER = "#4b5563";
const ARROW_LIGHT_BG = "#4f46e5";
const ARROW_DARK_BG = "#6366f1";
const LIGHT_TITLE = "#111827";
const DARK_TITLE = "#f3f4f6";
const LIGHT_DESC = "#6b7280";
const DARK_DESC = "#9ca3af";
const LIGHT_PROJECT = "#4f46e5";
const DARK_PROJECT = "#818cf8";

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const truncateText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string => {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let truncated = text;
  while (
    truncated.length > 0 &&
    ctx.measureText(`${truncated}...`).width > maxWidth
  ) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}...`;
};

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines) {
        break;
      }
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  // Truncate last line if needed
  if (lines.length > 0) {
    const lastIdx = lines.length - 1;
    lines[lastIdx] = truncateText(ctx, lines[lastIdx], maxWidth);
  }

  return lines;
};

/**
 * Compute the "design" height for a given element's content,
 * matching the base width (BASE_WIDTH).
 */
export const getProjectLinkBaseHeight = (
  element: ExcalidrawProjectLinkElement,
): number => {
  const hasDescription = !!element.description;
  const hasImage = !!element.imageBase64;
  let h = 56; // base: padding + title + project name
  if (hasDescription) {
    h += 42;
  }
  if (hasImage) {
    h += 42;
  }
  return h;
};

export const drawProjectLinkOnCanvas = (
  element: ExcalidrawProjectLinkElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
) => {
  const { width, height, title, description, projectName, imageBase64 } =
    element;
  const isDark = renderConfig.theme === "dark";

  const baseHeight = getProjectLinkBaseHeight(element);
  const scaleX = width / BASE_WIDTH;
  const scaleY = height / baseHeight;

  const bg = isDark ? DARK_BG : LIGHT_BG;
  const borderColor = isDark ? DARK_BORDER : LIGHT_BORDER;
  const arrowBg = isDark ? ARROW_DARK_BG : ARROW_LIGHT_BG;
  const titleColor = isDark ? DARK_TITLE : LIGHT_TITLE;
  const descColor = isDark ? DARK_DESC : LIGHT_DESC;
  const projectColor = isDark ? DARK_PROJECT : LIGHT_PROJECT;

  context.save();

  // Scale all drawing from design coords to actual element coords
  context.scale(scaleX, scaleY);

  // Card background
  drawRoundedRect(context, 0, 0, BASE_WIDTH, baseHeight, CORNER_RADIUS);
  context.fillStyle = bg;
  context.fill();
  context.strokeStyle = borderColor;
  context.lineWidth = 1.5 / Math.min(scaleX, scaleY); // keep border consistent
  context.stroke();

  // Arrow zone (right side)
  const arrowX = BASE_WIDTH - ARROW_ZONE_WIDTH;
  context.save();
  context.beginPath();
  context.moveTo(arrowX, 0);
  context.lineTo(BASE_WIDTH - CORNER_RADIUS, 0);
  context.quadraticCurveTo(BASE_WIDTH, 0, BASE_WIDTH, CORNER_RADIUS);
  context.lineTo(BASE_WIDTH, baseHeight - CORNER_RADIUS);
  context.quadraticCurveTo(
    BASE_WIDTH,
    baseHeight,
    BASE_WIDTH - CORNER_RADIUS,
    baseHeight,
  );
  context.lineTo(arrowX, baseHeight);
  context.closePath();
  context.fillStyle = arrowBg;
  context.fill();

  // Draw chevron arrow
  const arrowCenterX = arrowX + ARROW_ZONE_WIDTH / 2;
  const arrowCenterY = baseHeight / 2;
  const arrowSize = 14;
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2.5 / Math.min(scaleX, scaleY);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(arrowCenterX - arrowSize / 3, arrowCenterY - arrowSize / 2);
  context.lineTo(arrowCenterX + arrowSize / 3, arrowCenterY);
  context.lineTo(arrowCenterX - arrowSize / 3, arrowCenterY + arrowSize / 2);
  context.stroke();
  context.restore();

  // Content area
  const contentWidth = BASE_WIDTH - ARROW_ZONE_WIDTH - PADDING * 2;
  let yPos = PADDING;

  // Optional image
  if (imageBase64) {
    const imgAreaHeight = 34;
    context.fillStyle = isDark ? "#374151" : "#f3f4f6";
    drawRoundedRect(context, PADDING, yPos, contentWidth, imgAreaHeight, 4);
    context.fill();
    context.fillStyle = descColor;
    context.font = "11px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      "\uD83D\uDDBC",
      PADDING + contentWidth / 2,
      yPos + imgAreaHeight / 2,
    );
    yPos += imgAreaHeight + 6;
  }

  // Title
  context.font = TITLE_FONT;
  context.fillStyle = titleColor;
  context.textAlign = "left";
  context.textBaseline = "top";
  const displayTitle = title || "Untitled Link";
  const truncatedTitle = truncateText(context, displayTitle, contentWidth);
  context.fillText(truncatedTitle, PADDING, yPos);
  yPos += 18;

  // Description
  if (description) {
    context.font = DESC_FONT;
    context.fillStyle = descColor;
    const maxDescLines = imageBase64 ? 2 : 3;
    const descLines = wrapText(
      context,
      description,
      contentWidth,
      maxDescLines,
    );
    for (const line of descLines) {
      context.fillText(line, PADDING, yPos);
      yPos += 15;
    }
    yPos += 3;
  }

  // Project name at bottom
  if (projectName) {
    const projectY = Math.max(yPos, baseHeight - PADDING - 14);
    context.font = PROJECT_FONT;
    context.fillStyle = projectColor;
    const linkText = `\u2192 ${projectName}`;
    const truncatedProject = truncateText(context, linkText, contentWidth);
    context.fillText(truncatedProject, PADDING, projectY);
  }

  context.restore();
};
