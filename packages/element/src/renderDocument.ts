import type { ExcalidrawDocumentElement } from "./types";
import type { StaticCanvasRenderConfig } from "@excalidraw/excalidraw/scene/types";

const CORNER_RADIUS = 8;
const FONT = '14px sans-serif';
const BADGE_FONT = 'bold 11px sans-serif';
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

export const drawDocumentOnCanvas = (
  element: ExcalidrawDocumentElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
) => {
  const { width, height, fileName, fileType } = element;
  const isDark = renderConfig.theme === "dark";

  context.save();

  // Draw background with rounded corners
  drawRoundedRect(context, 0, 0, width, height, CORNER_RADIUS);
  context.fillStyle = isDark ? DARK_BG : LIGHT_BG;
  context.fill();

  // Draw subtle border
  context.strokeStyle = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  context.lineWidth = 1;
  context.stroke();

  // Draw file type badge
  const badgeColor = getBadgeColor(fileType);
  const extensionLabel = getExtensionLabel(fileType);

  context.font = BADGE_FONT;
  const badgeTextWidth = context.measureText(extensionLabel).width;
  const badgePadH = 6;
  const badgePadV = 3;
  const badgeW = badgeTextWidth + badgePadH * 2;
  const badgeH = 18;
  const badgeX = 10;
  const badgeY = height / 2 - 14;

  drawRoundedRect(context, badgeX, badgeY, badgeW, badgeH, 4);
  context.fillStyle = badgeColor;
  context.fill();

  // Badge text
  context.fillStyle = "#ffffff";
  context.textBaseline = "middle";
  context.fillText(extensionLabel, badgeX + badgePadH, badgeY + badgeH / 2);

  // Draw filename
  context.font = FONT;
  context.fillStyle = isDark ? DARK_TEXT : LIGHT_TEXT;
  context.textBaseline = "middle";

  const fileNameX = badgeX + badgeW + 10;
  const fileNameY = height / 2 + 5;
  const maxFileNameWidth = width - fileNameX - 20;

  let displayName = fileName;
  if (context.measureText(displayName).width > maxFileNameWidth) {
    while (
      displayName.length > 0 &&
      context.measureText(displayName + "...").width > maxFileNameWidth
    ) {
      displayName = displayName.slice(0, -1);
    }
    displayName += "...";
  }

  context.fillText(displayName, fileNameX, fileNameY);

  // Draw subtle document icon decoration (3 horizontal lines at bottom-right)
  const lineColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
  context.strokeStyle = lineColor;
  context.lineWidth = 1.5;
  context.lineCap = "round";

  const decoX = width - 30;
  const decoY = height - 24;
  const decoWidth = 16;

  for (let i = 0; i < 3; i++) {
    const y = decoY + i * 5;
    context.beginPath();
    context.moveTo(decoX, y);
    context.lineTo(decoX + decoWidth, y);
    context.stroke();
  }

  context.restore();
};
