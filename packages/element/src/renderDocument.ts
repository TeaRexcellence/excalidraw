import type { ExcalidrawDocumentElement } from "./types";
import type { StaticCanvasRenderConfig } from "@excalidraw/excalidraw/scene/types";

// Reference dimensions — all drawing is done at this size, then scaled
const REF_W = 200;
const REF_H = 80;

const CORNER_RADIUS = 8;
const NAME_FONT = 'bold 13px sans-serif';
const BADGE_FONT = 'bold 22px sans-serif';
const LIGHT_BG = "#f5f5f5";
const DARK_BG = "#2d2d2d";
const LIGHT_TEXT = "#333333";
const DARK_TEXT = "#e0e0e0";

const BADGE_COLORS: Record<string, string> = {
  js: "#3178c6",
  jsx: "#3178c6",
  ts: "#3178c6",
  tsx: "#3178c6",
  py: "#3776ab",
  cs: "#68217a",
  cpp: "#00599c",
  c: "#00599c",
  h: "#00599c",
  hpp: "#00599c",
  md: "#e67e22",
};

const DEFAULT_BADGE_COLOR = "#6c757d";

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const getBadgeColor = (fileType: string): string => {
  const ext = fileType.toLowerCase().replace(/^\./, "");
  return BADGE_COLORS[ext] ?? DEFAULT_BADGE_COLOR;
};

const getExtensionLabel = (fileType: string): string => {
  const ext = fileType.toLowerCase().replace(/^\./, "");
  return `.${ext}`;
};

const stripExtension = (fileName: string): string => {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot > 0) {
    return fileName.slice(0, lastDot);
  }
  return fileName;
};

export const drawDocumentOnCanvas = (
  element: ExcalidrawDocumentElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
) => {
  const { width, height, fileName, fileType } = element;
  const isDark = renderConfig.theme === "dark";

  context.save();

  // Scale from reference size to actual element size so all content
  // scales uniformly when the element is resized
  const sx = width / REF_W;
  const sy = height / REF_H;
  context.scale(sx, sy);

  // From here on, draw at the fixed reference dimensions (REF_W × REF_H).
  // The scale transform maps it to the real element size.

  // Draw background with rounded corners
  drawRoundedRect(context, 0, 0, REF_W, REF_H, CORNER_RADIUS);
  context.fillStyle = isDark ? DARK_BG : LIGHT_BG;
  context.fill();

  // Draw subtle border
  context.strokeStyle = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  context.lineWidth = 1 / Math.max(sx, sy); // keep border ~1px on screen
  context.stroke();

  // --- Right side: large file type badge ---
  const badgeColor = getBadgeColor(fileType);
  const extensionLabel = getExtensionLabel(fileType);

  const badgePadH = 10;

  context.font = BADGE_FONT;
  const badgeTextWidth = context.measureText(extensionLabel).width;
  const badgeW = badgeTextWidth + badgePadH * 2;
  const badgeH = 30;
  const badgeX = REF_W - badgeW - 10;
  const badgeY = (REF_H - badgeH) / 2;

  drawRoundedRect(context, badgeX, badgeY, badgeW, badgeH, 6);
  context.fillStyle = badgeColor;
  context.fill();

  // Badge text
  context.fillStyle = "#ffffff";
  context.textBaseline = "middle";
  context.fillText(extensionLabel, badgeX + badgePadH, badgeY + badgeH / 2 + 1);

  // --- Left side: filename without extension ---
  context.font = NAME_FONT;
  context.fillStyle = isDark ? DARK_TEXT : LIGHT_TEXT;
  context.textBaseline = "middle";

  const nameX = 12;
  const nameY = REF_H / 2;
  const maxNameWidth = badgeX - nameX - 10;

  let displayName = stripExtension(fileName);
  if (context.measureText(displayName).width > maxNameWidth) {
    while (
      displayName.length > 0 &&
      context.measureText(displayName + "…").width > maxNameWidth
    ) {
      displayName = displayName.slice(0, -1);
    }
    displayName += "…";
  }

  context.fillText(displayName, nameX, nameY);

  context.restore();
};
