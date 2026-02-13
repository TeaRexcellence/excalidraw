import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-markdown";

import type { ExcalidrawCodeBlockElement } from "./types";
import type { StaticCanvasRenderConfig } from "@excalidraw/excalidraw/scene/types";

const LINE_HEIGHT = 20;
const PADDING = 8;
const LINE_NUMBER_GUTTER_WIDTH = 40;
const SCROLLBAR_WIDTH = 6;
const FONT = '14px Consolas, Monaco, monospace';
const BG_COLOR = "#1e1e2e";
const GUTTER_BG_COLOR = "#181825";
const LINE_NUMBER_COLOR = "#858585";
const DEFAULT_COLOR = "#d4d4d4";
const CORNER_RADIUS = 8;

const TOKEN_COLORS: Record<string, string> = {
  keyword: "#569cd6",
  string: "#ce9178",
  char: "#ce9178",
  comment: "#6a9955",
  number: "#b5cea8",
  function: "#dcdcaa",
  punctuation: "#d4d4d4",
  operator: "#d4d4d4",
};

const LANGUAGE_MAP: Record<string, string | null> = {
  javascript: "javascript",
  python: "python",
  csharp: "csharp",
  cpp: "cpp",
  markdown: "markdown",
  plaintext: null,
};

const getTokenColor = (tokenType: string): string => {
  return TOKEN_COLORS[tokenType] ?? DEFAULT_COLOR;
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
): void => {
  let cursorX = x;

  for (const token of tokens) {
    if (typeof token === "string") {
      ctx.fillStyle = DEFAULT_COLOR;
      ctx.fillText(token, cursorX, y);
      cursorX += ctx.measureText(token).width;
    } else {
      ctx.fillStyle = getTokenColor(token.type);
      const content =
        typeof token.content === "string"
          ? token.content
          : String(token.content);
      ctx.fillText(content, cursorX, y);
      cursorX += ctx.measureText(content).width;
    }
  }
};

export const drawCodeBlockOnCanvas = (
  element: ExcalidrawCodeBlockElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
) => {
  const { width, height, code, language, showLineNumbers, scrollOffsetY } =
    element;

  context.save();

  // Draw background with rounded corners
  drawRoundedRect(context, 0, 0, width, height, CORNER_RADIUS);
  context.fillStyle = BG_COLOR;
  context.fill();

  // Clip to element bounds
  context.clip();

  context.font = FONT;
  context.textBaseline = "top";

  const lines = code.split("\n");
  const gutterWidth = showLineNumbers ? LINE_NUMBER_GUTTER_WIDTH : 0;
  const contentX = gutterWidth + PADDING;
  const totalContentHeight = lines.length * LINE_HEIGHT;
  const viewHeight = height - PADDING * 2;

  // Apply scroll offset
  context.save();
  context.translate(0, -scrollOffsetY);

  // Draw line number gutter
  if (showLineNumbers) {
    context.fillStyle = GUTTER_BG_COLOR;
    context.fillRect(
      0,
      scrollOffsetY,
      LINE_NUMBER_GUTTER_WIDTH,
      height + scrollOffsetY,
    );

    context.fillStyle = LINE_NUMBER_COLOR;
    context.textAlign = "right";

    for (let i = 0; i < lines.length; i++) {
      const lineY = PADDING + i * LINE_HEIGHT;
      // Only draw visible lines
      if (
        lineY + LINE_HEIGHT >= scrollOffsetY &&
        lineY <= scrollOffsetY + height
      ) {
        context.fillText(
          String(i + 1),
          LINE_NUMBER_GUTTER_WIDTH - PADDING,
          lineY,
        );
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

    // Only draw visible lines
    if (lineY + LINE_HEIGHT < scrollOffsetY || lineY > scrollOffsetY + height) {
      continue;
    }

    const line = lines[i];

    if (grammar && line.length > 0) {
      const tokens = Prism.tokenize(line, grammar);
      renderTokens(context, tokens, contentX, lineY);
    } else {
      context.fillStyle = DEFAULT_COLOR;
      context.fillText(line, contentX, lineY);
    }
  }

  context.restore();

  // Draw scrollbar indicator if content exceeds view height
  if (totalContentHeight > viewHeight) {
    const scrollbarHeight = Math.max(
      20,
      (viewHeight / totalContentHeight) * viewHeight,
    );
    const scrollbarY =
      PADDING + (scrollOffsetY / totalContentHeight) * viewHeight;

    context.fillStyle = "rgba(255, 255, 255, 0.2)";
    drawRoundedRect(
      context,
      width - SCROLLBAR_WIDTH - 2,
      scrollbarY,
      SCROLLBAR_WIDTH,
      scrollbarHeight,
      SCROLLBAR_WIDTH / 2,
    );
    context.fill();
  }

  context.restore();
};
