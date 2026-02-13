import type { ExcalidrawTableElement } from "./types";

/**
 * Given a point relative to the table element's origin (0,0),
 * returns the cell {row, col} at that point, or null if outside.
 */
export const getCellAtPoint = (
  element: ExcalidrawTableElement,
  localX: number,
  localY: number,
): { row: number; col: number } | null => {
  const { rows, columns, columnWidths, rowHeights } = element;

  const totalWidth = columnWidths.reduce((s, w) => s + w, 0);
  const totalHeight = rowHeights.reduce((s, h) => s + h, 0);

  if (localX < 0 || localY < 0 || localX > totalWidth || localY > totalHeight) {
    return null;
  }

  let col = -1;
  let accX = 0;
  for (let c = 0; c < columns; c++) {
    accX += columnWidths[c];
    if (localX <= accX) {
      col = c;
      break;
    }
  }
  if (col === -1) {
    col = columns - 1;
  }

  let row = -1;
  let accY = 0;
  for (let r = 0; r < rows; r++) {
    accY += rowHeights[r];
    if (localY <= accY) {
      row = r;
      break;
    }
  }
  if (row === -1) {
    row = rows - 1;
  }

  return { row, col };
};

/**
 * Returns the bounds of a cell in the table's local coordinate space.
 */
export const getCellBounds = (
  element: ExcalidrawTableElement,
  row: number,
  col: number,
): { x: number; y: number; width: number; height: number } => {
  let x = 0;
  for (let c = 0; c < col; c++) {
    x += element.columnWidths[c];
  }
  let y = 0;
  for (let r = 0; r < row; r++) {
    y += element.rowHeights[r];
  }
  return {
    x,
    y,
    width: element.columnWidths[col],
    height: element.rowHeights[row],
  };
};
