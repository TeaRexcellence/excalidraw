import {
  DEFAULT_ELEMENT_PROPS,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  FONT_FAMILY,
  DEFAULT_TEXT_ALIGN,
  DEFAULT_VERTICAL_ALIGN,
  VERTICAL_ALIGN,
  randomInteger,
  randomId,
  getFontString,
  getUpdatedTimestamp,
  getLineHeight,
} from "@excalidraw/common";

import type { Radians } from "@excalidraw/math";

import type { MarkOptional, Merge } from "@excalidraw/common/utility-types";

import {
  getElementAbsoluteCoords,
  getResizedElementAbsoluteCoords,
} from "./bounds";
import { newElementWith } from "./mutateElement";
import { getBoundTextMaxWidth } from "./textElement";
import { normalizeText, measureText } from "./textMeasurements";
import { wrapText } from "./textWrapping";

import { isLineElement } from "./typeChecks";

import type {
  ExcalidrawElement,
  ExcalidrawImageElement,
  ExcalidrawTextElement,
  ExcalidrawLinearElement,
  ExcalidrawGenericElement,
  NonDeleted,
  TextAlign,
  VerticalAlign,
  Arrowhead,
  ExcalidrawFreeDrawElement,
  FontFamilyValues,
  ExcalidrawTextContainer,
  ExcalidrawFrameElement,
  ExcalidrawEmbeddableElement,
  ExcalidrawMagicFrameElement,
  ExcalidrawIframeElement,
  ElementsMap,
  ExcalidrawArrowElement,
  ExcalidrawElbowArrowElement,
  ExcalidrawLineElement,
  ExcalidrawTableElement,
  ExcalidrawCodeBlockElement,
  CodeBlockLanguage,
  ExcalidrawDocumentElement,
  ExcalidrawProjectLinkElement,
} from "./types";

export type ElementConstructorOpts = MarkOptional<
  Omit<ExcalidrawGenericElement, "id" | "type" | "isDeleted" | "updated">,
  | "width"
  | "height"
  | "angle"
  | "groupIds"
  | "frameId"
  | "index"
  | "boundElements"
  | "seed"
  | "version"
  | "versionNonce"
  | "link"
  | "strokeStyle"
  | "fillStyle"
  | "strokeColor"
  | "backgroundColor"
  | "roughness"
  | "strokeWidth"
  | "roundness"
  | "locked"
  | "opacity"
  | "customData"
>;

const _newElementBase = <T extends ExcalidrawElement>(
  type: T["type"],
  {
    x,
    y,
    strokeColor = DEFAULT_ELEMENT_PROPS.strokeColor,
    backgroundColor = DEFAULT_ELEMENT_PROPS.backgroundColor,
    fillStyle = DEFAULT_ELEMENT_PROPS.fillStyle,
    strokeWidth = DEFAULT_ELEMENT_PROPS.strokeWidth,
    strokeStyle = DEFAULT_ELEMENT_PROPS.strokeStyle,
    roughness = DEFAULT_ELEMENT_PROPS.roughness,
    opacity = DEFAULT_ELEMENT_PROPS.opacity,
    width = 0,
    height = 0,
    angle = 0 as Radians,
    groupIds = [],
    frameId = null,
    index = null,
    roundness = null,
    boundElements = null,
    link = null,
    locked = DEFAULT_ELEMENT_PROPS.locked,
    ...rest
  }: ElementConstructorOpts & Omit<Partial<ExcalidrawGenericElement>, "type">,
) => {
  // NOTE (mtolmacs): This is a temporary check to detect extremely large
  // element position or sizing
  if (
    x < -1e6 ||
    x > 1e6 ||
    y < -1e6 ||
    y > 1e6 ||
    width < -1e6 ||
    width > 1e6 ||
    height < -1e6 ||
    height > 1e6
  ) {
    console.error("New element size or position is too large", {
      x,
      y,
      width,
      height,
      // @ts-ignore
      points: rest.points,
    });
  }

  // assign type to guard against excess properties
  const element: Merge<ExcalidrawGenericElement, { type: T["type"] }> = {
    id: rest.id || randomId(),
    type,
    x,
    y,
    width,
    height,
    angle,
    strokeColor,
    backgroundColor,
    fillStyle,
    strokeWidth,
    strokeStyle,
    roughness,
    opacity,
    groupIds,
    frameId,
    index,
    roundness,
    seed: rest.seed ?? randomInteger(),
    version: rest.version || 1,
    versionNonce: rest.versionNonce ?? 0,
    isDeleted: false as false,
    boundElements,
    updated: getUpdatedTimestamp(),
    link,
    locked,
    customData: rest.customData,
  };
  return element;
};

export const newElement = (
  opts: {
    type: ExcalidrawGenericElement["type"];
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawGenericElement> =>
  _newElementBase<ExcalidrawGenericElement>(opts.type, opts);

export const newEmbeddableElement = (
  opts: {
    type: "embeddable";
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawEmbeddableElement> => {
  return _newElementBase<ExcalidrawEmbeddableElement>("embeddable", opts);
};

export const newIframeElement = (
  opts: {
    type: "iframe";
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawIframeElement> => {
  return {
    ..._newElementBase<ExcalidrawIframeElement>("iframe", opts),
  };
};

export const newFrameElement = (
  opts: {
    name?: string;
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawFrameElement> => {
  const frameElement = newElementWith(
    {
      ..._newElementBase<ExcalidrawFrameElement>("frame", opts),
      type: "frame",
      name: opts?.name || null,
    },
    {},
  );

  return frameElement;
};

export const newMagicFrameElement = (
  opts: {
    name?: string;
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawMagicFrameElement> => {
  const frameElement = newElementWith(
    {
      ..._newElementBase<ExcalidrawMagicFrameElement>("magicframe", opts),
      type: "magicframe",
      name: opts?.name || null,
    },
    {},
  );

  return frameElement;
};

/** computes element x/y offset based on textAlign/verticalAlign */
const getTextElementPositionOffsets = (
  opts: {
    textAlign: ExcalidrawTextElement["textAlign"];
    verticalAlign: ExcalidrawTextElement["verticalAlign"];
  },
  metrics: {
    width: number;
    height: number;
  },
) => {
  return {
    x:
      opts.textAlign === "center"
        ? metrics.width / 2
        : opts.textAlign === "right"
        ? metrics.width
        : 0,
    y: opts.verticalAlign === "middle" ? metrics.height / 2 : 0,
  };
};

export const newTextElement = (
  opts: {
    text: string;
    originalText?: string;
    fontSize?: number;
    fontFamily?: FontFamilyValues;
    textAlign?: TextAlign;
    verticalAlign?: VerticalAlign;
    containerId?: ExcalidrawTextContainer["id"] | null;
    lineHeight?: ExcalidrawTextElement["lineHeight"];
    autoResize?: ExcalidrawTextElement["autoResize"];
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawTextElement> => {
  const fontFamily = opts.fontFamily || DEFAULT_FONT_FAMILY;
  const fontSize = opts.fontSize || DEFAULT_FONT_SIZE;
  const lineHeight = opts.lineHeight || getLineHeight(fontFamily);
  const text = normalizeText(opts.text);
  const metrics = measureText(
    text,
    getFontString({ fontFamily, fontSize }),
    lineHeight,
  );
  const textAlign = opts.textAlign || DEFAULT_TEXT_ALIGN;
  const verticalAlign = opts.verticalAlign || DEFAULT_VERTICAL_ALIGN;
  const offsets = getTextElementPositionOffsets(
    { textAlign, verticalAlign },
    metrics,
  );

  const textElementProps: ExcalidrawTextElement = {
    ..._newElementBase<ExcalidrawTextElement>("text", opts),
    text,
    fontSize,
    fontFamily,
    textAlign,
    verticalAlign,
    x: opts.x - offsets.x,
    y: opts.y - offsets.y,
    width: metrics.width,
    height: metrics.height,
    containerId: opts.containerId || null,
    originalText: opts.originalText ?? text,
    autoResize: opts.autoResize ?? true,
    lineHeight,
  };

  const textElement: ExcalidrawTextElement = newElementWith(
    textElementProps,
    {},
  );

  return textElement;
};

const getAdjustedDimensions = (
  element: ExcalidrawTextElement,
  elementsMap: ElementsMap,
  nextText: string,
): {
  x: number;
  y: number;
  width: number;
  height: number;
} => {
  let { width: nextWidth, height: nextHeight } = measureText(
    nextText,
    getFontString(element),
    element.lineHeight,
  );

  // wrapped text
  if (!element.autoResize) {
    nextWidth = element.width;
  }

  const { textAlign, verticalAlign } = element;
  let x: number;
  let y: number;
  if (
    textAlign === "center" &&
    verticalAlign === VERTICAL_ALIGN.MIDDLE &&
    !element.containerId &&
    element.autoResize
  ) {
    const prevMetrics = measureText(
      element.text,
      getFontString(element),
      element.lineHeight,
    );
    const offsets = getTextElementPositionOffsets(element, {
      width: nextWidth - prevMetrics.width,
      height: nextHeight - prevMetrics.height,
    });

    x = element.x - offsets.x;
    y = element.y - offsets.y;
  } else {
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);

    const [nextX1, nextY1, nextX2, nextY2] = getResizedElementAbsoluteCoords(
      element,
      nextWidth,
      nextHeight,
      false,
    );
    const deltaX1 = (x1 - nextX1) / 2;
    const deltaY1 = (y1 - nextY1) / 2;
    const deltaX2 = (x2 - nextX2) / 2;
    const deltaY2 = (y2 - nextY2) / 2;

    [x, y] = adjustXYWithRotation(
      {
        s: true,
        e: textAlign === "center" || textAlign === "left",
        w: textAlign === "center" || textAlign === "right",
      },
      element.x,
      element.y,
      element.angle,
      deltaX1,
      deltaY1,
      deltaX2,
      deltaY2,
    );
  }

  return {
    width: nextWidth,
    height: nextHeight,
    x: Number.isFinite(x) ? x : element.x,
    y: Number.isFinite(y) ? y : element.y,
  };
};

const adjustXYWithRotation = (
  sides: {
    n?: boolean;
    e?: boolean;
    s?: boolean;
    w?: boolean;
  },
  x: number,
  y: number,
  angle: number,
  deltaX1: number,
  deltaY1: number,
  deltaX2: number,
  deltaY2: number,
): [number, number] => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  if (sides.e && sides.w) {
    x += deltaX1 + deltaX2;
  } else if (sides.e) {
    x += deltaX1 * (1 + cos);
    y += deltaX1 * sin;
    x += deltaX2 * (1 - cos);
    y += deltaX2 * -sin;
  } else if (sides.w) {
    x += deltaX1 * (1 - cos);
    y += deltaX1 * -sin;
    x += deltaX2 * (1 + cos);
    y += deltaX2 * sin;
  }

  if (sides.n && sides.s) {
    y += deltaY1 + deltaY2;
  } else if (sides.n) {
    x += deltaY1 * sin;
    y += deltaY1 * (1 - cos);
    x += deltaY2 * -sin;
    y += deltaY2 * (1 + cos);
  } else if (sides.s) {
    x += deltaY1 * -sin;
    y += deltaY1 * (1 + cos);
    x += deltaY2 * sin;
    y += deltaY2 * (1 - cos);
  }
  return [x, y];
};

export const refreshTextDimensions = (
  textElement: ExcalidrawTextElement,
  container: ExcalidrawTextContainer | null,
  elementsMap: ElementsMap,
  text = textElement.text,
) => {
  if (textElement.isDeleted) {
    return;
  }
  if (container || !textElement.autoResize) {
    text = wrapText(
      text,
      getFontString(textElement),
      container
        ? getBoundTextMaxWidth(container, textElement)
        : textElement.width,
    );
  }
  const dimensions = getAdjustedDimensions(textElement, elementsMap, text);
  return { text, ...dimensions };
};

export const newFreeDrawElement = (
  opts: {
    type: "freedraw";
    points?: ExcalidrawFreeDrawElement["points"];
    simulatePressure: boolean;
    pressures?: ExcalidrawFreeDrawElement["pressures"];
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawFreeDrawElement> => {
  return {
    ..._newElementBase<ExcalidrawFreeDrawElement>(opts.type, opts),
    points: opts.points || [],
    pressures: opts.pressures || [],
    simulatePressure: opts.simulatePressure,
  };
};

export const newLinearElement = (
  opts: {
    type: ExcalidrawLinearElement["type"];
    points?: ExcalidrawLinearElement["points"];
    polygon?: ExcalidrawLineElement["polygon"];
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawLinearElement> => {
  const element = {
    ..._newElementBase<ExcalidrawLinearElement>(opts.type, opts),
    points: opts.points || [],

    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
  };

  if (isLineElement(element)) {
    const lineElement: NonDeleted<ExcalidrawLineElement> = {
      ...element,
      polygon: opts.polygon ?? false,
    };

    return lineElement;
  }

  return element;
};

export const newArrowElement = <T extends boolean>(
  opts: {
    type: ExcalidrawArrowElement["type"];
    startArrowhead?: Arrowhead | null;
    endArrowhead?: Arrowhead | null;
    points?: ExcalidrawArrowElement["points"];
    elbowed?: T;
    fixedSegments?: ExcalidrawElbowArrowElement["fixedSegments"] | null;
  } & ElementConstructorOpts,
): T extends true
  ? NonDeleted<ExcalidrawElbowArrowElement>
  : NonDeleted<ExcalidrawArrowElement> => {
  if (opts.elbowed) {
    return {
      ..._newElementBase<ExcalidrawElbowArrowElement>(opts.type, opts),
      points: opts.points || [],
      startBinding: null,
      endBinding: null,
      startArrowhead: opts.startArrowhead || null,
      endArrowhead: opts.endArrowhead || null,
      elbowed: true,
      fixedSegments: opts.fixedSegments || [],
      startIsSpecial: false,
      endIsSpecial: false,
    } as NonDeleted<ExcalidrawElbowArrowElement>;
  }

  return {
    ..._newElementBase<ExcalidrawArrowElement>(opts.type, opts),
    points: opts.points || [],
    startBinding: null,
    endBinding: null,
    startArrowhead: opts.startArrowhead || null,
    endArrowhead: opts.endArrowhead || null,
    elbowed: false,
  } as T extends true
    ? NonDeleted<ExcalidrawElbowArrowElement>
    : NonDeleted<ExcalidrawArrowElement>;
};

export const newImageElement = (
  opts: {
    type: ExcalidrawImageElement["type"];
    status?: ExcalidrawImageElement["status"];
    fileId?: ExcalidrawImageElement["fileId"];
    scale?: ExcalidrawImageElement["scale"];
    crop?: ExcalidrawImageElement["crop"];
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawImageElement> => {
  return {
    ..._newElementBase<ExcalidrawImageElement>("image", opts),
    // in the future we'll support changing stroke color for some SVG elements,
    // and `transparent` will likely mean "use original colors of the image"
    strokeColor: "transparent",
    status: opts.status ?? "pending",
    fileId: opts.fileId ?? null,
    scale: opts.scale ?? [1, 1],
    crop: opts.crop ?? null,
  };
};

export const DEFAULT_TABLE_CELL_WIDTH = 50;
export const DEFAULT_TABLE_CELL_HEIGHT = 14;
export const DEFAULT_TABLE_FONT_SIZE = 8;
export const DEFAULT_TABLE_CELL_PADDING = 8;

// Soft max viewport dimensions for initial element creation.
// Content beyond these bounds is scrollable — user can resize/crop to reveal more.
const DEFAULT_MAX_VIEWPORT_WIDTH = 400;
const DEFAULT_MAX_VIEWPORT_HEIGHT = 315;

export const newTableElement = (
  opts: {
    rows?: number;
    columns?: number;
    cells?: string[][];
    columnWidths?: number[];
    rowHeights?: number[];
    headerRow?: boolean;
    fontSize?: number;
    fontFamily?: number;
    frozenRows?: number;
    frozenColumns?: number;
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawTableElement> => {
  const rows = Math.max(1, opts.rows || 3);
  const columns = Math.max(1, opts.columns || 3);

  const columnWidths =
    opts.columnWidths || Array(columns).fill(DEFAULT_TABLE_CELL_WIDTH);
  const rowHeights =
    opts.rowHeights || Array(rows).fill(DEFAULT_TABLE_CELL_HEIGHT);

  const cells =
    opts.cells || Array.from({ length: rows }, () => Array(columns).fill(""));

  const contentWidth = columnWidths.reduce(
    (sum: number, w: number) => sum + w,
    0,
  );
  const contentHeight = rowHeights.reduce(
    (sum: number, h: number) => sum + h,
    0,
  );

  // Use viewport defaults for a generous initial crop — content stays small inside
  const width = opts.width || DEFAULT_MAX_VIEWPORT_WIDTH;
  const height = opts.height || DEFAULT_MAX_VIEWPORT_HEIGHT;

  return {
    ..._newElementBase<ExcalidrawTableElement>("table", {
      ...opts,
      width,
      height,
    }),
    type: "table",
    columns,
    rows,
    cells,
    columnWidths,
    rowHeights,
    headerRow: opts.headerRow ?? true,
    scrollOffsetY: 0,
    cropX: 0,
    cropY: 0,
    fontSize: opts.fontSize ?? DEFAULT_TABLE_FONT_SIZE,
    fontFamily: opts.fontFamily ?? FONT_FAMILY.Helvetica,
    frozenRows: opts.frozenRows ?? 0,
    frozenColumns: opts.frozenColumns ?? 0,
  };
};

export const newCodeBlockElement = (
  opts: {
    code?: string;
    language?: CodeBlockLanguage;
    showLineNumbers?: boolean;
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawCodeBlockElement> => {
  const fontSize = 6;
  const code = opts.code ?? "";

  // Derive natural content height from code lines
  const s = fontSize / 13; // BASE_FONT_SIZE
  const lineHeight = 20 * s;
  const padding = 10 * s;
  const headerHeight = 22 * s;
  const lineCount = code.split("\n").length;
  const contentHeight = headerHeight + padding + lineCount * lineHeight + padding;

  // Default to full viewport size for a document-shaped initial appearance;
  // content scrolls inside. When inserting a file, use content height if it fits.
  const width = opts.width || 400;
  const height = opts.height || Math.max(contentHeight, DEFAULT_MAX_VIEWPORT_HEIGHT);

  return {
    ..._newElementBase<ExcalidrawCodeBlockElement>("codeblock", {
      ...opts,
      width,
      height,
    }),
    type: "codeblock",
    code,
    language: opts.language ?? "plaintext",
    showLineNumbers: opts.showLineNumbers ?? true,
    scrollOffsetY: 0,
    fontSize,
    fontFamily: FONT_FAMILY.Cascadia,
    cropX: 0,
    cropY: 0,
  };
};

export const newDocumentElement = (
  opts: {
    fileName?: string;
    fileType?: string;
    filePath?: string;
    fileContent?: string;
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawDocumentElement> => {
  return {
    ..._newElementBase<ExcalidrawDocumentElement>("document", {
      ...opts,
      width: opts.width || 200,
      height: opts.height || 80,
    }),
    type: "document",
    fileName: opts.fileName ?? "Untitled",
    fileType: opts.fileType ?? "txt",
    filePath: opts.filePath ?? "",
    fileContent: opts.fileContent ?? "",
  };
};

export const newProjectLinkElement = (
  opts: {
    title?: string;
    description?: string;
    projectId?: string;
    projectName?: string;
    imageBase64?: string;
  } & ElementConstructorOpts,
): NonDeleted<ExcalidrawProjectLinkElement> => {
  // Auto-size height based on content
  const hasDescription = !!opts.description;
  const hasImage = !!opts.imageBase64;
  let autoHeight = 56; // base: padding + title + project name
  if (hasDescription) {
    autoHeight += 42;
  }
  if (hasImage) {
    autoHeight += 42;
  }

  return {
    ..._newElementBase<ExcalidrawProjectLinkElement>("projectLink", {
      ...opts,
      width: opts.width || 240,
      height: opts.height || autoHeight,
    }),
    type: "projectLink",
    title: opts.title ?? "",
    description: opts.description ?? "",
    projectId: opts.projectId ?? "",
    projectName: opts.projectName ?? "",
    imageBase64: opts.imageBase64 ?? "",
  };
};
