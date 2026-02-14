import jspreadsheet from "jspreadsheet-ce";
import "jspreadsheet-ce/dist/jspreadsheet.css";

import type { ExcalidrawTableElement } from "@excalidraw/element/types";

import type App from "../components/App";

import "./tableSpreadsheetEditor.scss";

// ── Constants ───────────────────────────────────────────────────────────
const DEFAULT_COL_WIDTH = 140;
const DEFAULT_ROW_HEIGHT = 36;

// ── Public API ──────────────────────────────────────────────────────────

interface OpenTableEditorOpts {
  tableElement: ExcalidrawTableElement;
  app: App;
  excalidrawContainer: HTMLElement | null;
  onClose: () => void;
}

/**
 * Opens a full-screen modal with a jspreadsheet-ce editor for the given
 * table element. Returns a function that closes the modal and syncs data back.
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

  let closed = false;

  // ── Backdrop ────────────────────────────────────────────────────────
  const backdrop = document.createElement("div");
  backdrop.className = "excalidraw-tableEditor-backdrop";

  // ── Modal container ────────────────────────────────────────────────
  const modal = document.createElement("div");
  modal.className = "excalidraw-tableEditor";

  // ── Toolbar ────────────────────────────────────────────────────────
  const toolbar = document.createElement("div");
  toolbar.className = "excalidraw-tableEditor__toolbar";

  const titleSpan = document.createElement("span");
  titleSpan.className = "excalidraw-tableEditor__title";
  titleSpan.textContent = "Table Editor";

  const closeBtn = document.createElement("button");
  closeBtn.className = "excalidraw-tableEditor__closeBtn";
  closeBtn.textContent = "Done (Esc)";

  toolbar.appendChild(titleSpan);
  toolbar.appendChild(closeBtn);
  modal.appendChild(toolbar);

  // ── Spreadsheet area ──────────────────────────────────────────────
  const sheetWrap = document.createElement("div");
  sheetWrap.className = "excalidraw-tableEditor__sheetWrap";
  modal.appendChild(sheetWrap);

  backdrop.appendChild(modal);
  excalidrawContainer.appendChild(backdrop);

  // ── Prepare data / columns for jspreadsheet ───────────────────────
  const data: string[][] = [];
  for (let r = 0; r < tableElement.rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < tableElement.columns; c++) {
      row.push(tableElement.cells[r]?.[c] ?? "");
    }
    data.push(row);
  }

  const columns = tableElement.columnWidths.map((w) => ({
    width: Math.max(w || DEFAULT_COL_WIDTH, 80),
  }));

  // ── Init jspreadsheet ─────────────────────────────────────────────
  const instance = jspreadsheet(sheetWrap, {
    data,
    columns,
    minDimensions: [tableElement.columns, tableElement.rows],
    tableOverflow: true,
    tableWidth: "100%",
    tableHeight: "100%",
    allowInsertRow: true,
    allowInsertColumn: true,
    allowDeleteRow: true,
    allowDeleteColumn: true,
    allowManualInsertRow: true,
    allowManualInsertColumn: true,
    columnSorting: false,
    columnDrag: false,
    columnResize: true,
    rowResize: true,
    rowDrag: false,
    defaultColWidth: DEFAULT_COL_WIDTH,
    defaultColAlign: "left",
    editable: true,
    copyCompatibility: true,
    // Use the built-in context menu for spreadsheet operations
    contextMenu: undefined,
  });

  // ── Apply row heights via DOM ─────────────────────────────────────
  applyRowHeights(sheetWrap, tableElement.rowHeights);

  // ── Apply header styling ──────────────────────────────────────────
  applyHeaderStyling(sheetWrap, tableElement);

  // ── Event isolation ───────────────────────────────────────────────
  const stopPropagation = (e: Event) => {
    e.stopPropagation();
  };
  backdrop.addEventListener("keydown", stopPropagation);
  backdrop.addEventListener("keyup", stopPropagation);
  backdrop.addEventListener("keypress", stopPropagation);
  backdrop.addEventListener("wheel", (e) => e.stopPropagation());

  // ── Close & sync ──────────────────────────────────────────────────
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;

    // 1. Read data back
    const newData = instance.getData();
    const newRows = newData.length;
    const newCols =
      newData.length > 0 ? newData[0].length : tableElement.columns;

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
          typeof w === "number"
            ? w
            : parseInt(String(w), 10) || DEFAULT_COL_WIDTH,
        );
      } catch {
        newColumnWidths.push(
          tableElement.columnWidths[c] || DEFAULT_COL_WIDTH,
        );
      }
    }

    // Read row heights from DOM (jspreadsheet v4 stores these in the DOM)
    const newRowHeights: number[] = [];
    const tbody = sheetWrap.querySelector("tbody");
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
        newRowHeights.push(tableElement.rowHeights[r] || DEFAULT_ROW_HEIGHT);
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
    document.removeEventListener("keydown", handleKeyDown, true);

    try {
      instance.destroy();
    } catch {
      // jspreadsheet may throw if already destroyed
    }
    backdrop.remove();
    onClose();
  };

  // ── Escape key ────────────────────────────────────────────────────
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      // Check if jspreadsheet has an active cell editor
      const activeEditor = sheetWrap.querySelector(
        ".jexcel .editor",
      ) as HTMLElement | null;
      if (activeEditor && activeEditor.style.display !== "none") {
        // Let jspreadsheet handle this Escape (close cell editor)
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener("keydown", handleKeyDown, true);

  // ── Close button ──────────────────────────────────────────────────
  closeBtn.addEventListener("click", close);

  // ── Click on backdrop (outside modal) → close ─────────────────────
  backdrop.addEventListener("pointerdown", (e) => {
    if (e.target === backdrop) {
      close();
    }
  });

  return close;
};

// ── Helpers ─────────────────────────────────────────────────────────────

function applyRowHeights(
  container: HTMLElement,
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
    const tds = trs[r].querySelectorAll("td");
    tds.forEach((td) => {
      (td as HTMLElement).style.height = `${h}px`;
    });
  }
}

function applyHeaderStyling(
  container: HTMLElement,
  tableElement: ExcalidrawTableElement,
) {
  if (!tableElement.headerRow) {
    return;
  }
  const tbody = container.querySelector("tbody");
  if (!tbody) {
    return;
  }
  const firstRow = tbody.querySelector("tr");
  if (!firstRow) {
    return;
  }
  const tds = firstRow.querySelectorAll("td:not(.jexcel_row)");
  tds.forEach((td) => {
    (td as HTMLElement).style.fontWeight = "bold";
  });
}
