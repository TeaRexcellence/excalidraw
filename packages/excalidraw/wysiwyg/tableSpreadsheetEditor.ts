import jspreadsheet from "jspreadsheet-ce";
import "jspreadsheet-ce/dist/jspreadsheet.css";

import { sceneCoordsToViewportCoords } from "@excalidraw/common";

import type { ExcalidrawTableElement } from "@excalidraw/element/types";

import type App from "../components/App";

import "./tableSpreadsheetEditor.scss";

// ── Constants ───────────────────────────────────────────────────────────
const DEFAULT_COL_WIDTH = 120;
const DEFAULT_ROW_HEIGHT = 36;
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 72;
const FONT_RATIO = 0.44;

const getFontSize = (rowHeight: number): number =>
  Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, rowHeight * FONT_RATIO));

// ── Public API ──────────────────────────────────────────────────────────

interface OpenTableEditorOpts {
  tableElement: ExcalidrawTableElement;
  app: App;
  excalidrawContainer: HTMLElement | null;
  onClose: () => void;
}

/**
 * Opens a jspreadsheet-ce overlay on top of the given table element.
 * Returns a function that, when called, closes the overlay and syncs data back.
 */
export const openTableSpreadsheetEditor = ({
  tableElement,
  app,
  excalidrawContainer,
  onClose,
}: OpenTableEditorOpts): (() => void) => {
  if (!excalidrawContainer) {
    onClose();
    return () => {};
  }

  const editorContainer = excalidrawContainer.querySelector<HTMLDivElement>(
    ".excalidraw-tableEditorContainer",
  );
  if (!editorContainer) {
    onClose();
    return () => {};
  }

  // ── Create wrapper ──────────────────────────────────────────────────
  const overlayDiv = document.createElement("div");
  overlayDiv.className = "excalidraw-tableSpreadsheetOverlay";
  editorContainer.appendChild(overlayDiv);

  // ── Position helper ─────────────────────────────────────────────────
  const updatePosition = () => {
    const { x: viewportX, y: viewportY } = sceneCoordsToViewportCoords(
      { sceneX: tableElement.x, sceneY: tableElement.y },
      app.state,
    );
    const zoom = app.state.zoom.value;
    const left = viewportX - app.state.offsetLeft;
    const top = viewportY - app.state.offsetTop;

    const totalWidth =
      tableElement.columnWidths.reduce((s, w) => s + w, 0);
    const totalHeight =
      tableElement.rowHeights.reduce((s, h) => s + h, 0);

    Object.assign(overlayDiv.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${totalWidth + 50}px`, // extra for row-header column
      height: `${totalHeight + 30}px`, // extra for column-header row
      transform: `scale(${zoom})`,
    });
  };
  updatePosition();

  // ── Prepare data / columns for jspreadsheet ─────────────────────────
  const data: string[][] = [];
  for (let r = 0; r < tableElement.rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < tableElement.columns; c++) {
      row.push(tableElement.cells[r]?.[c] ?? "");
    }
    data.push(row);
  }

  const columns = tableElement.columnWidths.map((w) => ({
    width: w || DEFAULT_COL_WIDTH,
  }));

  // ── Init jspreadsheet ───────────────────────────────────────────────
  const instance = jspreadsheet(overlayDiv, {
    data,
    columns,
    minDimensions: [tableElement.columns, tableElement.rows],
    tableOverflow: true,
    tableWidth: `${tableElement.columnWidths.reduce((s, w) => s + w, 0) + 50}px`,
    tableHeight: `${tableElement.rowHeights.reduce((s, h) => s + h, 0) + 30}px`,
    allowInsertRow: true,
    allowInsertColumn: true,
    allowDeleteRow: true,
    allowDeleteColumn: true,
    allowManualInsertRow: true,
    allowManualInsertColumn: true,
    columnSorting: false,
    columnDrag: false,
    columnResize: true,
    rowResize: false,
    rowDrag: false,
    defaultColWidth: DEFAULT_COL_WIDTH,
    defaultColAlign: "left",
    editable: true,
    // Use the built-in context menu for spreadsheet operations
    contextMenu: undefined,
  });

  // ── Apply row heights via DOM ───────────────────────────────────────
  applyRowHeights(overlayDiv, tableElement.rowHeights);

  // ── Apply font sizing & header styling ──────────────────────────────
  applyFontStyling(overlayDiv, tableElement);

  // ── Event isolation ─────────────────────────────────────────────────
  // Stop keyboard events from reaching Excalidraw (Delete, Ctrl+Z, etc.)
  const stopPropagation = (e: Event) => {
    e.stopPropagation();
  };
  overlayDiv.addEventListener("keydown", stopPropagation);
  overlayDiv.addEventListener("keyup", stopPropagation);
  overlayDiv.addEventListener("keypress", stopPropagation);
  // Also stop pointer events from deselecting the table
  overlayDiv.addEventListener("pointerdown", stopPropagation);
  overlayDiv.addEventListener("pointerup", stopPropagation);
  overlayDiv.addEventListener("pointermove", stopPropagation);
  overlayDiv.addEventListener("wheel", stopPropagation);

  // ── Zoom/scroll sync ────────────────────────────────────────────────
  const unbindOnScroll = app.onScrollChangeEmitter.on(() => {
    updatePosition();
  });

  const canvas = excalidrawContainer.querySelector("canvas");
  let resizeObserver: ResizeObserver | null = null;
  if (canvas && "ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(() => {
      updatePosition();
    });
    resizeObserver.observe(canvas);
  }

  // ── Close triggers ──────────────────────────────────────────────────
  let isDestroyed = false;

  const closeAndSync = () => {
    if (isDestroyed) {
      return;
    }
    isDestroyed = true;

    // 1. Read data back
    const newData = instance.getData();
    const newRows = newData.length;
    const newCols = newData.length > 0 ? newData[0].length : tableElement.columns;

    // Build new cells
    const newCells: string[][] = [];
    for (let r = 0; r < newRows; r++) {
      const row: string[] = [];
      for (let c = 0; c < newCols; c++) {
        row.push(String(newData[r]?.[c] ?? ""));
      }
      newCells.push(row);
    }

    // Read column widths from jspreadsheet
    const newColumnWidths: number[] = [];
    for (let c = 0; c < newCols; c++) {
      try {
        const w = instance.getWidth(c);
        newColumnWidths.push(
          typeof w === "number" ? w : parseInt(String(w), 10) || DEFAULT_COL_WIDTH,
        );
      } catch {
        newColumnWidths.push(
          tableElement.columnWidths[c] || DEFAULT_COL_WIDTH,
        );
      }
    }

    // Read row heights from DOM (jspreadsheet v4 stores these in the DOM)
    const newRowHeights: number[] = [];
    const tbody = overlayDiv.querySelector("tbody");
    if (tbody) {
      const trs = tbody.querySelectorAll("tr");
      for (let r = 0; r < newRows; r++) {
        if (trs[r]) {
          const h = trs[r].offsetHeight;
          newRowHeights.push(h > 0 ? h : DEFAULT_ROW_HEIGHT);
        } else {
          newRowHeights.push(
            tableElement.rowHeights[r] || DEFAULT_ROW_HEIGHT,
          );
        }
      }
    } else {
      for (let r = 0; r < newRows; r++) {
        newRowHeights.push(
          tableElement.rowHeights[r] || DEFAULT_ROW_HEIGHT,
        );
      }
    }

    const newWidth = newColumnWidths.reduce((s, w) => s + w, 0);
    const newHeight = newRowHeights.reduce((s, h) => s + h, 0);

    // 2. Mutate the element
    const freshElement = app.scene.getElement(tableElement.id);
    if (freshElement) {
      app.scene.mutateElement(freshElement as any, {
        cells: newCells,
        rows: newRows,
        columns: newCols,
        columnWidths: newColumnWidths,
        rowHeights: newRowHeights,
        width: newWidth,
        height: newHeight,
        scrollOffsetY: 0,
      });
    }

    // 3. Cleanup
    unbindOnScroll();
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    window.removeEventListener("pointerdown", onPointerDownOutside, true);
    overlayDiv.removeEventListener("keydown", onOverlayKeydown);
    overlayDiv.removeEventListener("keydown", stopPropagation);
    overlayDiv.removeEventListener("keyup", stopPropagation);
    overlayDiv.removeEventListener("keypress", stopPropagation);
    overlayDiv.removeEventListener("pointerdown", stopPropagation);
    overlayDiv.removeEventListener("pointerup", stopPropagation);
    overlayDiv.removeEventListener("pointermove", stopPropagation);
    overlayDiv.removeEventListener("wheel", stopPropagation);

    try {
      instance.destroy();
    } catch {
      // jspreadsheet may throw if already destroyed
    }
    overlayDiv.remove();
    onClose();
  };

  // Click outside overlay → close
  const onPointerDownOutside = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    // Check if click is inside the overlay or a jspreadsheet context menu
    if (
      overlayDiv.contains(target) ||
      target.closest(".jexcel_contextmenu")
    ) {
      return;
    }
    closeAndSync();
  };

  // Escape key → close (only if jspreadsheet isn't in cell-edit mode)
  const onOverlayKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      // Check if jspreadsheet has an active cell editor
      const activeEditor = overlayDiv.querySelector(
        ".jexcel .editor",
      ) as HTMLElement | null;
      if (activeEditor && activeEditor.style.display !== "none") {
        // Let jspreadsheet handle this Escape (close cell editor)
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      closeAndSync();
    }
  };
  overlayDiv.addEventListener("keydown", onOverlayKeydown);

  // Deferred so we don't catch the double-click that opened us
  requestAnimationFrame(() => {
    window.addEventListener("pointerdown", onPointerDownOutside, {
      capture: true,
    });
  });

  return closeAndSync;
};

// ── Helpers ─────────────────────────────────────────────────────────────

function applyRowHeights(
  container: HTMLDivElement,
  rowHeights: readonly number[],
) {
  const tbody = container.querySelector("tbody");
  if (!tbody) {
    return;
  }
  const trs = tbody.querySelectorAll("tr");
  for (let r = 0; r < rowHeights.length && r < trs.length; r++) {
    const h = rowHeights[r] || DEFAULT_ROW_HEIGHT;
    (trs[r] as HTMLElement).style.height = `${h}px`;
    // Also set td heights
    const tds = trs[r].querySelectorAll("td");
    tds.forEach((td) => {
      (td as HTMLElement).style.height = `${h}px`;
    });
  }
}

function applyFontStyling(
  container: HTMLDivElement,
  tableElement: ExcalidrawTableElement,
) {
  const tbody = container.querySelector("tbody");
  if (!tbody) {
    return;
  }
  const trs = tbody.querySelectorAll("tr");
  for (let r = 0; r < trs.length; r++) {
    const rowH = tableElement.rowHeights[r] || DEFAULT_ROW_HEIGHT;
    const fontSize = getFontSize(rowH);
    const isHeader = tableElement.headerRow && r === 0;
    const tds = trs[r].querySelectorAll("td:not(.jexcel_row)");
    tds.forEach((td) => {
      (td as HTMLElement).style.fontSize = `${fontSize}px`;
      if (isHeader) {
        (td as HTMLElement).style.fontWeight = "bold";
      }
    });
  }
}
