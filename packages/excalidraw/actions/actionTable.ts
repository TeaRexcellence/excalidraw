import { isTableElement, CaptureUpdateAction } from "@excalidraw/element";
import {
  DEFAULT_TABLE_CELL_WIDTH,
  DEFAULT_TABLE_CELL_HEIGHT,
} from "@excalidraw/element";

import type { ExcalidrawTableElement } from "@excalidraw/element/types";

import { register } from "./register";

const getSelectedTable = (
  appState: { selectedElementIds: Record<string, boolean> },
  app: { scene: any },
): ExcalidrawTableElement | null => {
  const selectedIds = Object.keys(appState.selectedElementIds);
  if (selectedIds.length !== 1) {
    return null;
  }
  const el = app.scene.getElement(selectedIds[0]);
  return el && isTableElement(el) ? (el as ExcalidrawTableElement) : null;
};

const isTableSelected = (
  _elements: any,
  appState: { selectedElementIds: Record<string, boolean> },
  _value: any,
  app: any,
): boolean => {
  return getSelectedTable(appState, app) !== null;
};

export const actionAddRowBelow = register({
  name: "addRowBelow",
  label: "tableActions.addRowBelow",
  trackEvent: { category: "element" },
  predicate: isTableSelected,
  perform: (elements, appState, _, app) => {
    const table = getSelectedTable(appState, app);
    if (!table) {
      return { appState, elements, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }
    const newCells = [
      ...table.cells.map((r) => [...r]),
      Array(table.columns).fill(""),
    ];
    const newRowHeights = [...table.rowHeights, DEFAULT_TABLE_CELL_HEIGHT];
    const newHeight = newRowHeights.reduce((s, h) => s + h, 0);
    app.scene.mutateElement(table, {
      rows: table.rows + 1,
      cells: newCells,
      rowHeights: newRowHeights,
      height: newHeight,
    });
    return { appState, elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY };
  },
});

export const actionAddRowAbove = register({
  name: "addRowAbove",
  label: "tableActions.addRowAbove",
  trackEvent: { category: "element" },
  predicate: isTableSelected,
  perform: (elements, appState, _, app) => {
    const table = getSelectedTable(appState, app);
    if (!table) {
      return { appState, elements, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }
    const newCells = [
      Array(table.columns).fill(""),
      ...table.cells.map((r) => [...r]),
    ];
    const newRowHeights = [DEFAULT_TABLE_CELL_HEIGHT, ...table.rowHeights];
    const newHeight = newRowHeights.reduce((s, h) => s + h, 0);
    app.scene.mutateElement(table, {
      rows: table.rows + 1,
      cells: newCells,
      rowHeights: newRowHeights,
      height: newHeight,
    });
    return { appState, elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY };
  },
});

export const actionDeleteRow = register({
  name: "deleteRow",
  label: "tableActions.deleteRow",
  trackEvent: { category: "element" },
  predicate: (elements, appState, _, app) => {
    const table = getSelectedTable(appState, app);
    return table !== null && table.rows > 1;
  },
  perform: (elements, appState, _, app) => {
    const table = getSelectedTable(appState, app);
    if (!table || table.rows <= 1) {
      return { appState, elements, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }
    // Remove last row
    const newCells = table.cells.slice(0, -1).map((r) => [...r]);
    const newRowHeights = table.rowHeights.slice(0, -1);
    const newHeight = newRowHeights.reduce((s, h) => s + h, 0);
    app.scene.mutateElement(table, {
      rows: table.rows - 1,
      cells: newCells,
      rowHeights: newRowHeights,
      height: newHeight,
    });
    return { appState, elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY };
  },
});

export const actionAddColumnRight = register({
  name: "addColumnRight",
  label: "tableActions.addColumnRight",
  trackEvent: { category: "element" },
  predicate: isTableSelected,
  perform: (elements, appState, _, app) => {
    const table = getSelectedTable(appState, app);
    if (!table) {
      return { appState, elements, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }
    const newCells = table.cells.map((r) => [...r, ""]);
    const newColumnWidths = [...table.columnWidths, DEFAULT_TABLE_CELL_WIDTH];
    const newWidth = newColumnWidths.reduce((s, w) => s + w, 0);
    app.scene.mutateElement(table, {
      columns: table.columns + 1,
      cells: newCells,
      columnWidths: newColumnWidths,
      width: newWidth,
    });
    return { appState, elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY };
  },
});

export const actionAddColumnLeft = register({
  name: "addColumnLeft",
  label: "tableActions.addColumnLeft",
  trackEvent: { category: "element" },
  predicate: isTableSelected,
  perform: (elements, appState, _, app) => {
    const table = getSelectedTable(appState, app);
    if (!table) {
      return { appState, elements, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }
    const newCells = table.cells.map((r) => ["", ...r]);
    const newColumnWidths = [DEFAULT_TABLE_CELL_WIDTH, ...table.columnWidths];
    const newWidth = newColumnWidths.reduce((s, w) => s + w, 0);
    app.scene.mutateElement(table, {
      columns: table.columns + 1,
      cells: newCells,
      columnWidths: newColumnWidths,
      width: newWidth,
    });
    return { appState, elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY };
  },
});

export const actionDeleteColumn = register({
  name: "deleteColumn",
  label: "tableActions.deleteColumn",
  trackEvent: { category: "element" },
  predicate: (elements, appState, _, app) => {
    const table = getSelectedTable(appState, app);
    return table !== null && table.columns > 1;
  },
  perform: (elements, appState, _, app) => {
    const table = getSelectedTable(appState, app);
    if (!table || table.columns <= 1) {
      return { appState, elements, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }
    // Remove last column
    const newCells = table.cells.map((r) => [...r].slice(0, -1));
    const newColumnWidths = table.columnWidths.slice(0, -1);
    const newWidth = newColumnWidths.reduce((s, w) => s + w, 0);
    app.scene.mutateElement(table, {
      columns: table.columns - 1,
      cells: newCells,
      columnWidths: newColumnWidths,
      width: newWidth,
    });
    return { appState, elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY };
  },
});
