import Prism from "prismjs";

// Prism language imports — ORDER MATTERS (dependencies first)
import "prismjs/components/prism-markup"; // must be before php, markdown
import "prismjs/components/prism-css"; // must be before markup-templating
import "prismjs/components/prism-javascript"; // must be before typescript
import "prismjs/components/prism-c"; // must be before cpp
import "prismjs/components/prism-markup-templating"; // must be before php
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-php";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-scala";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-powershell";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-lua";
import "prismjs/components/prism-perl";
import "prismjs/components/prism-r";
import "prismjs/components/prism-dart";

import { THEME, getFontFamilyString, applyDarkModeFilter } from "@excalidraw/common";

import type { StaticCanvasRenderConfig } from "@excalidraw/excalidraw/scene/types";

import type { CodeBlockLanguage, ExcalidrawCodeBlockElement } from "./types";

// Base dimensions at fontSize=13. All scale proportionally with element.fontSize.
const BASE_FONT_SIZE = 13;
const BASE_LINE_HEIGHT = 20;
const BASE_PADDING = 10;
const BASE_GUTTER_WIDTH = 36;
const BASE_SCROLLBAR_WIDTH = 3;
const BASE_HEADER_HEIGHT = 22;
const BASE_CORNER_RADIUS = 6;
const DEFAULT_CODE_FONT_FAMILY = 'Consolas, "SF Mono", Monaco, "Fira Code", monospace';

/** Blend a hex color 'amount' (0–1) toward white. */
const lightenHex = (hex: string, amount: number): string => {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr}, ${lg}, ${lb})`;
};

// ── Theme-aware colors ───────────────────────────────────────────────

const LIGHT_TOKENS: Record<string, string> = {
  keyword: "#7c3aed",
  string: "#16a34a",
  char: "#16a34a",
  comment: "#9ca3af",
  number: "#ea580c",
  function: "#2563eb",
  punctuation: "#6b7280",
  operator: "#0891b2",
  "class-name": "#ca8a04",
  builtin: "#ca8a04",
  boolean: "#7c3aed",
  property: "#2563eb",
  tag: "#dc2626",
  "attr-name": "#ea580c",
  "attr-value": "#16a34a",
  regex: "#db2777",
  important: "#dc2626",
  deleted: "#dc2626",
  inserted: "#16a34a",
};

const DARK_TOKENS: Record<string, string> = {
  keyword: "#cba6f7",
  string: "#a6e3a1",
  char: "#a6e3a1",
  comment: "#6c7086",
  number: "#fab387",
  function: "#89b4fa",
  punctuation: "#9399b2",
  operator: "#89dceb",
  "class-name": "#f9e2af",
  builtin: "#f9e2af",
  boolean: "#cba6f7",
  property: "#89b4fa",
  tag: "#f38ba8",
  "attr-name": "#fab387",
  "attr-value": "#a6e3a1",
  regex: "#f5c2e7",
  important: "#f38ba8",
  deleted: "#f38ba8",
  inserted: "#a6e3a1",
};

const LANGUAGE_MAP: Record<CodeBlockLanguage, string | null> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  java: "java",
  csharp: "csharp",
  cpp: "cpp",
  go: "go",
  rust: "rust",
  ruby: "ruby",
  php: "php",
  swift: "swift",
  kotlin: "kotlin",
  scala: "scala",
  html: "markup",
  css: "css",
  json: "json",
  yaml: "yaml",
  sql: "sql",
  bash: "bash",
  powershell: "powershell",
  markdown: "markdown",
  xml: "markup",
  docker: "docker",
  lua: "lua",
  perl: "perl",
  r: "r",
  dart: "dart",
  plaintext: null,
};

export const LANGUAGE_LABELS: Record<CodeBlockLanguage, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  java: "Java",
  csharp: "C#",
  cpp: "C++",
  go: "Go",
  rust: "Rust",
  ruby: "Ruby",
  php: "PHP",
  swift: "Swift",
  kotlin: "Kotlin",
  scala: "Scala",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  yaml: "YAML",
  sql: "SQL",
  bash: "Bash",
  powershell: "PowerShell",
  markdown: "Markdown",
  xml: "XML",
  docker: "Dockerfile",
  lua: "Lua",
  perl: "Perl",
  r: "R",
  dart: "Dart",
  plaintext: "Plain Text",
};

// Language dot color (GitHub-style)
const LANGUAGE_DOT_COLOR: Partial<Record<CodeBlockLanguage, string>> = {
  javascript: "#f7df1e",
  typescript: "#3178c6",
  python: "#3572a5",
  java: "#b07219",
  csharp: "#178600",
  cpp: "#f34b7d",
  go: "#00add8",
  rust: "#dea584",
  ruby: "#cc342d",
  php: "#4F5D95",
  swift: "#f05138",
  kotlin: "#A97BFF",
  html: "#e34c26",
  css: "#563d7c",
  json: "#40a14f",
  yaml: "#cb171e",
  sql: "#e38c00",
  bash: "#89e051",
  powershell: "#012456",
  docker: "#384d54",
  dart: "#00b4ab",
  scala: "#c22d40",
  lua: "#000080",
  r: "#198ce7",
};

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

const renderTokens = (
  ctx: CanvasRenderingContext2D,
  tokens: Array<string | Prism.Token>,
  x: number,
  y: number,
  defaultColor: string,
  tokenColors: Record<string, string>,
): number => {
  let cursorX = x;

  for (const token of tokens) {
    if (typeof token === "string") {
      ctx.fillStyle = defaultColor;
      ctx.fillText(token, cursorX, y);
      cursorX += ctx.measureText(token).width;
    } else {
      // Use the most specific color: this token's type, or inherit parent default
      const color = tokenColors[token.type] ?? defaultColor;

      if (typeof token.content === "string") {
        ctx.fillStyle = color;
        ctx.fillText(token.content, cursorX, y);
        cursorX += ctx.measureText(token.content).width;
      } else if (Array.isArray(token.content)) {
        // Recurse into nested tokens, passing this token's color as the default
        cursorX = renderTokens(
          ctx,
          token.content as Array<string | Prism.Token>,
          cursorX,
          y,
          color,
          tokenColors,
        );
      } else {
        // Token wrapping another single Token
        cursorX = renderTokens(
          ctx,
          [token.content],
          cursorX,
          y,
          color,
          tokenColors,
        );
      }
    }
  }

  return cursorX;
};

export const drawCodeBlockOnCanvas = (
  element: ExcalidrawCodeBlockElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
) => {
  const {
    width,
    height,
    code,
    language,
    showLineNumbers,
    scrollOffsetY,
    cropX,
    cropY,
  } = element;
  const isDark = renderConfig.theme === THEME.DARK;

  // Scale all dimensions proportionally from fontSize
  const s = (element.fontSize || BASE_FONT_SIZE) / BASE_FONT_SIZE;
  const LINE_HEIGHT = BASE_LINE_HEIGHT * s;
  const PADDING = BASE_PADDING * s;
  const GUTTER_WIDTH = BASE_GUTTER_WIDTH * s;
  const SCROLLBAR_WIDTH = Math.max(2, BASE_SCROLLBAR_WIDTH * s);
  const HEADER_HEIGHT = BASE_HEADER_HEIGHT * s;
  const CORNER_RADIUS = BASE_CORNER_RADIUS * s;
  const fontFamilyStr = element.fontFamily
    ? getFontFamilyString({ fontFamily: element.fontFamily })
    : DEFAULT_CODE_FONT_FAMILY;
  const FONT = `${element.fontSize || BASE_FONT_SIZE}px ${fontFamilyStr}`;
  const HEADER_FONT_SIZE = Math.round(10 * s);

  // Theme colors
  const borderColor = isDark ? "#44475a" : "#d1d5db";
  const headerBg = isDark ? "rgba(68,71,90,0.4)" : "rgba(0,0,0,0.04)";
  const headerText = isDark ? "#888" : "#888";
  const lineNumberColor = isDark ? "#555" : "#b0b0b0";
  const gutterBorder = isDark ? "#44475a" : "#e5e7eb";
  const defaultTextColor = isDark ? "#cdd6f4" : "#1f2937";
  const tokenColors = isDark ? DARK_TOKENS : LIGHT_TOKENS;
  const scrollbarColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";

  context.save();

  // Background fill (controlled by backgroundOpacity)
  const bgOpacity = (element.backgroundOpacity ?? 0) / 100;
  if (bgOpacity > 0) {
    const baseColor = isDark
      ? applyDarkModeFilter(renderConfig.canvasBackgroundColor)
      : renderConfig.canvasBackgroundColor;
    const bgColor = lightenHex(baseColor, 0.01);
    drawRoundedRect(context, 0, 0, width, height, CORNER_RADIUS);
    const prevAlpha = context.globalAlpha;
    context.globalAlpha = prevAlpha * bgOpacity;
    context.fillStyle = bgColor;
    context.fill();
    context.globalAlpha = prevAlpha;
  }

  // Rounded border
  drawRoundedRect(context, 0, 0, width, height, CORNER_RADIUS);
  context.strokeStyle = borderColor;
  context.lineWidth = 1;
  context.stroke();

  // Clip to element bounds
  context.clip();

  // Apply crop offset — shift all content by the crop amount
  const cx = cropX || 0;
  const cy = cropY || 0;
  if (cx !== 0 || cy !== 0) {
    context.translate(-cx, -cy);
  }

  // ── Header bar (subtle, transparent) ─────────────────────────────
  // Use full content width for fills so cropped areas still have background
  const contentRenderWidth = width + cx * 2; // generous width for fills
  context.fillStyle = headerBg;
  context.fillRect(0, 0, contentRenderWidth, HEADER_HEIGHT);

  // Header bottom border
  context.strokeStyle = borderColor;
  context.lineWidth = 0.5;
  context.beginPath();
  context.moveTo(0, HEADER_HEIGHT - 0.5);
  context.lineTo(contentRenderWidth, HEADER_HEIGHT - 0.5);
  context.stroke();

  // Language label with dot
  const label = LANGUAGE_LABELS[language] || language;
  context.font = `${HEADER_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.textBaseline = "middle";

  const dotColor = LANGUAGE_DOT_COLOR[language];
  const dotRadius = 3 * s;
  const labelX = PADDING;

  if (dotColor) {
    context.beginPath();
    context.arc(
      labelX + dotRadius + 1,
      HEADER_HEIGHT / 2,
      dotRadius,
      0,
      Math.PI * 2,
    );
    context.fillStyle = dotColor;
    context.fill();

    context.fillStyle = headerText;
    context.fillText(label, labelX + dotRadius * 2 + 6, HEADER_HEIGHT / 2 + 1);
  } else {
    context.fillStyle = headerText;
    context.fillText(label, labelX, HEADER_HEIGHT / 2 + 1);
  }

  // ── Code area ────────────────────────────────────────────────────
  const codeAreaTop = HEADER_HEIGHT;
  context.font = FONT;
  context.textBaseline = "top";

  const lines = code.split("\n");
  const gutterWidth = showLineNumbers ? GUTTER_WIDTH : 0;
  const contentX = gutterWidth + PADDING;
  const totalContentHeight = lines.length * LINE_HEIGHT;
  const viewHeight = height - codeAreaTop - PADDING;

  // Apply scroll offset
  context.save();
  context.translate(0, codeAreaTop - scrollOffsetY);

  // Visible range in content-space (accounts for crop offset)
  const visibleTop = cy + scrollOffsetY;
  const visibleBottom = visibleTop + height;

  // Draw line number gutter
  if (showLineNumbers) {
    context.strokeStyle = gutterBorder;
    context.lineWidth = 0.5;
    context.beginPath();
    context.moveTo(GUTTER_WIDTH - 0.5, visibleTop);
    context.lineTo(GUTTER_WIDTH - 0.5, visibleBottom);
    context.stroke();

    context.fillStyle = lineNumberColor;
    context.textAlign = "right";

    for (let i = 0; i < lines.length; i++) {
      const lineY = PADDING + i * LINE_HEIGHT;
      if (
        lineY + LINE_HEIGHT >= visibleTop &&
        lineY <= visibleBottom
      ) {
        context.fillText(String(i + 1), GUTTER_WIDTH - 8 * s, lineY);
      }
    }

    context.textAlign = "left";
  }

  // Determine grammar for tokenization
  const langKey = LANGUAGE_MAP[language];
  const grammar = langKey ? Prism.languages[langKey] : null;

  // Draw code lines
  for (let i = 0; i < lines.length; i++) {
    const lineY = PADDING + i * LINE_HEIGHT;

    if (lineY + LINE_HEIGHT < visibleTop || lineY > visibleBottom) {
      continue;
    }

    const line = lines[i];

    if (grammar && line.length > 0) {
      const tokens = Prism.tokenize(line, grammar);
      renderTokens(
        context,
        tokens,
        contentX,
        lineY,
        defaultTextColor,
        tokenColors,
      );
    } else {
      context.fillStyle = defaultTextColor;
      context.fillText(line, contentX, lineY);
    }
  }

  context.restore();

  // Draw scrollbar indicator if content exceeds view height
  if (totalContentHeight > viewHeight) {
    const scrollbarHeight = Math.max(
      20 * s,
      (viewHeight / totalContentHeight) * viewHeight,
    );
    const scrollbarY =
      codeAreaTop + PADDING + (scrollOffsetY / totalContentHeight) * viewHeight;

    // Position scrollbar at viewport right edge (account for crop offset)
    const sbRightEdge = cx + width - SCROLLBAR_WIDTH - 2;
    const sbTop = cy + scrollbarY;
    context.fillStyle = scrollbarColor;
    drawRoundedRect(
      context,
      sbRightEdge,
      sbTop,
      SCROLLBAR_WIDTH,
      scrollbarHeight,
      SCROLLBAR_WIDTH / 2,
    );
    context.fill();
  }

  context.restore();
};
