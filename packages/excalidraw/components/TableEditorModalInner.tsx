import React, { useRef, useEffect, useCallback, useState } from "react";

import type { HotTableClass } from "@handsontable/react";

import { HotTable } from "@handsontable/react";
import { registerAllModules } from "handsontable/registry";
import "handsontable/dist/handsontable.full.min.css";

import { CaptureUpdateAction } from "@excalidraw/element";

import type { ExcalidrawTableElement } from "@excalidraw/element/types";

import { t } from "../i18n";
import { parseCSV, autoSizeColumns } from "../utils/csvParser";

import { useApp } from "./App";

import "./TableEditorModal.scss";

registerAllModules();

const DEFAULT_COL_WIDTH = 120;
const DEFAULT_ROW_HEIGHT = 36;
const INITIAL_ROWS = 100;
const INITIAL_COLS = 26;
const MIN_SPARE_ROWS = 20;

// Canvas ↔ editor scale factors.
// Editor displays at comfortable editing sizes; canvas uses compact sizes.
// A fixed scale ensures: editorWidth = canvasWidth × SCALE, and vice versa.
const CANVAS_COL_WIDTH = 40;
const CANVAS_ROW_HEIGHT = 14;
const CANVAS_TO_EDITOR_COL = DEFAULT_COL_WIDTH / CANVAS_COL_WIDTH; // 3.0
const CANVAS_TO_EDITOR_ROW = DEFAULT_ROW_HEIGHT / CANVAS_ROW_HEIGHT; // ~2.571

interface TableEditorModalInnerProps {
  elementId: string;
  onClose: () => void;
}

const TableEditorModalInner: React.FC<TableEditorModalInnerProps> = ({
  elementId,
  onClose,
}) => {
  const app = useApp();
  const hotRef = useRef<HotTableClass>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const headerMeasured = useRef(false);
  // Capture initial editor dimensions from Handsontable after mount,
  // so we can detect which columns/rows the user actually resized.
  const initEditorWidths = useRef<number[]>([]);
  const initEditorHeights = useRef<number[]>([]);
  // Track actual resized dimensions from manual resize callbacks
  // (more reliable than hot.getRowHeight/getColWidth which can be stale)
  const manualResizedCols = useRef<Record<number, number>>({});
  const manualResizedRows = useRef<Record<number, number>>({});

  const element = app.scene.getElement(elementId) as
    | ExcalidrawTableElement
    | undefined;

  const [frozenRows, setFrozenRows] = useState(element?.frozenRows ?? 0);
  const [frozenColumns, setFrozenColumns] = useState(
    element?.frozenColumns ?? 0,
  );

  // Handsontable header dimensions (measured after mount)
  const [headerDims, setHeaderDims] = useState({
    rowHeaderW: 50,
    colHeaderH: 26,
  });

  // Bumped on column/row resize to force handle position recalc
  const [, setResizeTick] = useState(0);

  // Track whether the element was empty when the editor opened.
  // If still empty on close, treat as cancel and delete the element.
  const wasEmptyOnOpen = useRef(
    !element?.cells?.some((row) => row.some((cell) => cell.trim() !== "")),
  );

  // Build initial data ONCE — stored in a ref so re-renders (e.g. from
  // freeze handle state changes) don't reset HotTable's live data.
  const initDataRef = useRef<string[][] | null>(null);
  if (initDataRef.current === null) {
    if (!element) {
      initDataRef.current = [[""]];
    } else {
      const data: string[][] = [];
      for (let r = 0; r < element.rows; r++) {
        const row: string[] = [];
        for (let c = 0; c < element.columns; c++) {
          row.push(element.cells[r]?.[c] ?? "");
        }
        data.push(row);
      }
      initDataRef.current = data;
    }
  }

  // Column width: canvas width × scale factor → comfortable editor size
  const getColWidth = useCallback(
    (index: number): number => {
      if (element && index < element.columnWidths.length) {
        const canvasW = element.columnWidths[index] || CANVAS_COL_WIDTH;
        return Math.max(Math.round(canvasW * CANVAS_TO_EDITOR_COL), 30);
      }
      return DEFAULT_COL_WIDTH;
    },
    [element],
  );

  // Row height: canvas height × scale factor → comfortable editor size
  const getRowHeight = useCallback(
    (index: number): number => {
      if (element && index < element.rowHeights.length) {
        const canvasH = element.rowHeights[index] || CANVAS_ROW_HEIGHT;
        return Math.max(Math.round(canvasH * CANVAS_TO_EDITOR_ROW), 20);
      }
      return DEFAULT_ROW_HEIGHT;
    },
    [element],
  );

  // Sync data back to element and close — trims to used range
  const handleDone = useCallback(() => {
    const hot = hotRef.current?.hotInstance;
    if (!hot || !element) {
      onClose();
      return;
    }

    const rawData = hot.getData() as string[][];

    // Find the used range (last row/col with any non-empty content)
    let maxRow = -1;
    let maxCol = -1;
    for (let r = 0; r < rawData.length; r++) {
      for (let c = 0; c < (rawData[r]?.length ?? 0); c++) {
        const val = rawData[r][c];
        if (val !== null && val !== undefined && String(val).trim() !== "") {
          if (r > maxRow) {
            maxRow = r;
          }
          if (c > maxCol) {
            maxCol = c;
          }
        }
      }
    }

    // If it was empty when opened and still empty → cancel (delete element)
    if (maxRow === -1 && wasEmptyOnOpen.current) {
      const freshElement = app.scene.getElement(elementId);
      if (freshElement) {
        app.scene.mutateElement(freshElement as any, { isDeleted: true });
      }
      app.syncActionResult({
        appState: { ...app.state, openDialog: null },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      onClose();
      return;
    }

    // Ensure at least 1x1
    const usedRows = Math.max(maxRow + 1, 1);
    const usedCols = Math.max(maxCol + 1, 1);

    // Build trimmed cells
    const newCells: string[][] = [];
    for (let r = 0; r < usedRows; r++) {
      const row: string[] = [];
      for (let c = 0; c < usedCols; c++) {
        row.push(String(rawData[r]?.[c] ?? ""));
      }
      newCells.push(row);
    }

    // Map editor sizes → canvas sizes using fixed scale factors.
    // Unchanged columns/rows keep their exact canvas values (no drift).
    // Changed columns/rows use: canvasSize = editorSize / SCALE.
    // We use manually tracked resize data (from afterColumnResize/afterRowResize
    // callbacks) since hot.getRowHeight()/getColWidth() can return stale values.
    const newColumnWidths: number[] = [];
    for (let c = 0; c < usedCols; c++) {
      if (c in manualResizedCols.current) {
        // User explicitly resized this column — use the captured size
        newColumnWidths.push(
          Math.max(1, Math.round(manualResizedCols.current[c] / CANVAS_TO_EDITOR_COL)),
        );
      } else {
        // Not resized — keep exact canvas width (prevents drift)
        newColumnWidths.push(
          c < element.columnWidths.length
            ? element.columnWidths[c]
            : CANVAS_COL_WIDTH,
        );
      }
    }

    const newRowHeights: number[] = [];
    for (let r = 0; r < usedRows; r++) {
      if (r in manualResizedRows.current) {
        // User explicitly resized this row — use the captured size
        newRowHeights.push(
          Math.max(1, Math.round(manualResizedRows.current[r] / CANVAS_TO_EDITOR_ROW)),
        );
      } else {
        // Not resized — keep exact canvas height
        newRowHeights.push(
          r < element.rowHeights.length
            ? element.rowHeights[r]
            : CANVAS_ROW_HEIGHT,
        );
      }
    }

    const contentWidth = newColumnWidths.reduce((s, w) => s + w, 0);
    const contentHeight = newRowHeights.reduce((s, h) => s + h, 0);

    // Cap viewport to reasonable defaults — content stays full-size and scrollable
    const MAX_VIEWPORT_W = 400;
    const MAX_VIEWPORT_H = 450;
    const newWidth = Math.min(contentWidth, MAX_VIEWPORT_W);
    const newHeight = Math.min(contentHeight, MAX_VIEWPORT_H);

    // Mutate element as one atomic change
    const freshElement = app.scene.getElement(elementId);
    if (freshElement) {
      app.scene.mutateElement(freshElement as any, {
        cells: newCells,
        rows: usedRows,
        columns: usedCols,
        columnWidths: newColumnWidths,
        rowHeights: newRowHeights,
        headerRow: frozenRows > 0,
        frozenRows: Math.min(frozenRows, usedRows),
        frozenColumns: Math.min(frozenColumns, usedCols),
        width: newWidth,
        height: newHeight,
        scrollOffsetY: 0,
        cropX: 0,
        cropY: 0,
      });
    }

    // Capture as a single undo step
    app.syncActionResult({
      appState: {
        ...app.state,
        openDialog: null,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    onClose();
  }, [app, element, elementId, frozenRows, frozenColumns, onClose]);

  // Handle CSV import
  const handleCSVImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const parsed = parseCSV(text);
        if (parsed.length === 0) {
          return;
        }
        const hot = hotRef.current?.hotInstance;
        if (hot) {
          // Size columns based on content
          const colWidths = autoSizeColumns(parsed);
          hot.updateSettings({
            colWidths,
          });
          hot.loadData(parsed);
        }
      };
      reader.readAsText(file);
      // Reset input so the same file can be selected again
      e.target.value = "";
    },
    [],
  );

  // Sync freeze settings to Handsontable when stepper values change
  useEffect(() => {
    const hot = hotRef.current?.hotInstance;
    if (hot) {
      hot.updateSettings({
        fixedRowsTop: frozenRows,
        fixedColumnsStart: frozenColumns,
      });
    }
  }, [frozenRows, frozenColumns]);

  // ── Keyboard isolation ──────────────────────────────────────────────
  // Capture-phase document listener intercepts ALL keyboard events.
  // For events inside the modal we either handle them directly via
  // Handsontable's API (Ctrl+A, Ctrl+Z, Ctrl+Y, Escape) or let them
  // through to Handsontable by NOT stopping propagation.
  // Events from outside the modal are ignored (not our concern).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) {
        return;
      }

      const hot = hotRef.current?.hotInstance;

      // ── Escape — always works while modal is open ──
      if (e.key === "Escape") {
        if (hot) {
          const activeEditor = hot.getActiveEditor();
          if (activeEditor && activeEditor.isOpened()) {
            // Let Handsontable close the cell editor
            return;
          }
        }
        e.preventDefault();
        e.stopPropagation();
        handleDone();
        return;
      }

      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      // ── Ctrl+A  →  select all cells ──
      if (ctrlOrCmd && e.key.toLowerCase() === "a" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (hot) {
          const rows = hot.countRows();
          const cols = hot.countCols();
          if (rows > 0 && cols > 0) {
            hot.selectCell(0, 0, rows - 1, cols - 1, false);
          }
        }
        return;
      }

      // ── Ctrl+Z  →  undo ──
      if (ctrlOrCmd && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (hot && hot.isUndoAvailable()) {
          hot.undo();
        }
        return;
      }

      // ── Ctrl+Shift+Z / Ctrl+Y  →  redo ──
      if (
        (ctrlOrCmd && e.key.toLowerCase() === "z" && e.shiftKey) ||
        (ctrlOrCmd && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (hot && hot.isRedoAvailable()) {
          hot.redo();
        }
        return;
      }

      // All other keys: let them propagate normally to Handsontable.
      // App.onKeyDown already bails when the table editor dialog is open,
      // so Excalidraw won't interfere with normal typing / navigation.
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [handleDone]);

  // Block keyup, keydown (bubble), and clipboard events from reaching
  // Excalidraw's native document listeners.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }
    const stop = (e: Event) => e.stopPropagation();
    const events = ["keydown", "keyup"];
    events.forEach((evt) => wrapper.addEventListener(evt, stop));
    return () => {
      events.forEach((evt) => wrapper.removeEventListener(evt, stop));
    };
  }, []);

  // Track whether we've auto-focused the grid after first render
  const didAutoFocus = useRef(false);

  // ── Freeze handle drag ──────────────────────────────────────────────
  const handleRowDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const sheetEl = sheetRef.current;
      const indicator = indicatorRef.current;
      const hot = hotRef.current?.hotInstance;
      if (!sheetEl || !indicator || !hot || !element) {
        return;
      }

      const sheetRect = sheetEl.getBoundingClientRect();

      // Compute initial indicator position
      let initY = headerDims.colHeaderH;
      for (let r = 0; r < frozenRows; r++) {
        initY += hot.getRowHeight(r) ?? DEFAULT_ROW_HEIGHT;
      }

      // Show horizontal indicator line spanning the data area
      indicator.style.display = "block";
      indicator.style.left = `${headerDims.rowHeaderW}px`;
      indicator.style.width = `${sheetRect.width - headerDims.rowHeaderW}px`;
      indicator.style.height = "2px";
      indicator.style.top = `${initY}px`;

      let snapValue = frozenRows;

      const onMove = (me: PointerEvent) => {
        const localY = me.clientY - sheetRect.top;
        let accum = headerDims.colHeaderH;
        let newSnap = 0;
        for (let r = 0; r < element.rows; r++) {
          const rh = hot.getRowHeight(r) ?? DEFAULT_ROW_HEIGHT;
          if (localY >= accum + rh / 2) {
            newSnap = r + 1;
            accum += rh;
          } else {
            break;
          }
        }
        newSnap = Math.max(0, Math.min(newSnap, element.rows - 1));
        snapValue = newSnap;

        // Update indicator position
        let snapY = headerDims.colHeaderH;
        for (let r = 0; r < newSnap; r++) {
          snapY += hot.getRowHeight(r) ?? DEFAULT_ROW_HEIGHT;
        }
        indicator.style.top = `${snapY}px`;
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        indicator.style.display = "none";
        setFrozenRows(snapValue);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [element, headerDims, frozenRows],
  );

  const handleColDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const sheetEl = sheetRef.current;
      const indicator = indicatorRef.current;
      const hot = hotRef.current?.hotInstance;
      if (!sheetEl || !indicator || !hot || !element) {
        return;
      }

      const sheetRect = sheetEl.getBoundingClientRect();

      // Compute initial indicator position
      let initX = headerDims.rowHeaderW;
      for (let c = 0; c < frozenColumns; c++) {
        initX += hot.getColWidth(c) ?? DEFAULT_COL_WIDTH;
      }

      // Show vertical indicator line spanning the data area
      indicator.style.display = "block";
      indicator.style.top = `${headerDims.colHeaderH}px`;
      indicator.style.height = `${sheetRect.height - headerDims.colHeaderH}px`;
      indicator.style.width = "2px";
      indicator.style.left = `${initX}px`;

      let snapValue = frozenColumns;

      const onMove = (me: PointerEvent) => {
        const localX = me.clientX - sheetRect.left;
        let accum = headerDims.rowHeaderW;
        let newSnap = 0;
        for (let c = 0; c < element.columns; c++) {
          const cw = hot.getColWidth(c) ?? DEFAULT_COL_WIDTH;
          if (localX >= accum + cw / 2) {
            newSnap = c + 1;
            accum += cw;
          } else {
            break;
          }
        }
        newSnap = Math.max(0, Math.min(newSnap, element.columns - 1));
        snapValue = newSnap;

        // Update indicator position
        let snapX = headerDims.rowHeaderW;
        for (let c = 0; c < newSnap; c++) {
          snapX += hot.getColWidth(c) ?? DEFAULT_COL_WIDTH;
        }
        indicator.style.left = `${snapX}px`;
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        indicator.style.display = "none";
        setFrozenColumns(snapValue);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [element, headerDims, frozenColumns],
  );

  // Compute freeze handle positions for the overlay
  const computeFreezeHandlePos = () => {
    const hot = hotRef.current?.hotInstance;
    let rowPx = 0;
    for (let r = 0; r < frozenRows; r++) {
      rowPx += hot?.getRowHeight(r) ?? DEFAULT_ROW_HEIGHT;
    }
    let colPx = 0;
    for (let c = 0; c < frozenColumns; c++) {
      colPx += hot?.getColWidth(c) ?? DEFAULT_COL_WIDTH;
    }
    return { frozenRowsPx: rowPx, frozenColsPx: colPx };
  };
  const { frozenRowsPx, frozenColsPx } = computeFreezeHandlePos();

  // Detect dark mode
  const isDark = document.querySelector(".excalidraw.theme--dark") !== null;

  if (!element) {
    onClose();
    return null;
  }

  return (
    <div
      className="TableEditorModal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          handleDone();
        }
      }}
    >
      <div
        ref={wrapperRef}
        className={`TableEditorModal ${isDark ? "TableEditorModal--dark" : ""}`}
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="TableEditorModal__toolbar">
          <span className="TableEditorModal__title">
            {t("tableEditor.title")}
          </span>
          <div className="TableEditorModal__toolbarActions">
            {(frozenRows > 0 || frozenColumns > 0) && (
              <span className="TableEditorModal__freezeInfo">
                {frozenRows > 0 && `${frozenRows} ${t("tableEditor.freezeRows").toLowerCase()}`}
                {frozenRows > 0 && frozenColumns > 0 && ", "}
                {frozenColumns > 0 && `${frozenColumns} ${t("tableEditor.freezeCols").toLowerCase()}`}
              </span>
            )}
            <button
              className="TableEditorModal__btn"
              onClick={() => fileInputRef.current?.click()}
            >
              {t("tableEditor.importCSV")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleCSVImport}
              style={{ display: "none" }}
            />
            <button
              className="TableEditorModal__btn TableEditorModal__btn--primary"
              onClick={handleDone}
            >
              {t("tableEditor.done")}
            </button>
          </div>
        </div>

        {/* Spreadsheet */}
        <div className="TableEditorModal__sheet" ref={sheetRef}>
          <HotTable
            ref={hotRef}
            data={initDataRef.current!}
            colWidths={getColWidth}
            rowHeights={getRowHeight}
            minRows={INITIAL_ROWS}
            minCols={INITIAL_COLS}
            minSpareRows={MIN_SPARE_ROWS}
            fixedRowsTop={frozenRows}
            fixedColumnsStart={frozenColumns}
            contextMenu={true}
            manualColumnResize={true}
            manualRowResize={true}
            copyPaste={true}
            undo={true}
            fillHandle={true}
            autoWrapRow={true}
            autoWrapCol={true}
            enterMoves={{ row: 1, col: 0 }}
            tabMoves={{ row: 0, col: 1 }}
            rowHeaders={true}
            colHeaders={true}
            stretchH="none"
            width="100%"
            height="100%"
            licenseKey="non-commercial-and-evaluation"
            afterColumnResize={(newSize: number, col: number) => {
              manualResizedCols.current[col] = newSize;
              setResizeTick((n) => n + 1);
            }}
            afterRowResize={(newSize: number, row: number) => {
              manualResizedRows.current[row] = newSize;
              setResizeTick((n) => n + 1);
            }}
            afterRender={() => {
              const hot = hotRef.current?.hotInstance;
              if (!hot) {
                return;
              }
              // Focus Handsontable after first render so keyboard shortcuts
              // (Ctrl+A, Ctrl+Z, arrows, etc.) work immediately.
              if (!didAutoFocus.current) {
                didAutoFocus.current = true;
                hot.selectCell(0, 0);
                hot.listen();
              }
              if (headerMeasured.current) {
                return;
              }
              // Measure column header height from master thead (stable,
              // unaffected by frozen rows — unlike the corner element).
              // Measure row header width from a tbody <th> (stable,
              // unaffected by frozen columns).
              const masterThead = hot.rootElement?.querySelector(
                ".ht_master thead",
              );
              const rowHeaderCell = hot.rootElement?.querySelector(
                ".ht_master tbody tr th",
              );
              if (
                masterThead &&
                (masterThead as HTMLElement).offsetHeight > 0 &&
                rowHeaderCell &&
                (rowHeaderCell as HTMLElement).offsetWidth > 0
              ) {
                headerMeasured.current = true;
                setHeaderDims({
                  rowHeaderW: (rowHeaderCell as HTMLElement).offsetWidth,
                  colHeaderH: (masterThead as HTMLElement).offsetHeight,
                });
                // Capture initial editor dimensions for change detection
                for (let c = 0; c < INITIAL_COLS; c++) {
                  initEditorWidths.current.push(
                    hot.getColWidth(c) || DEFAULT_COL_WIDTH,
                  );
                }
                for (let r = 0; r < INITIAL_ROWS; r++) {
                  initEditorHeights.current.push(
                    hot.getRowHeight(r) || DEFAULT_ROW_HEIGHT,
                  );
                }
              }
            }}
          />
          {/* Freeze handle overlay — drag these bars to freeze rows/cols */}
          <div className="TableEditorModal__freezeOverlay">
            <div
              className="TableEditorModal__freezeHandle TableEditorModal__freezeHandle--row"
              style={{
                top: headerDims.colHeaderH + frozenRowsPx - 2,
                left: Math.max(0, (headerDims.rowHeaderW - 36) / 2),
              }}
              onPointerDown={handleRowDragStart}
              title={t("tableEditor.freezeRows")}
            />
            <div
              className="TableEditorModal__freezeHandle TableEditorModal__freezeHandle--col"
              style={{
                left: headerDims.rowHeaderW + frozenColsPx - 2,
                top: Math.max(0, (headerDims.colHeaderH - 24) / 2),
              }}
              onPointerDown={handleColDragStart}
              title={t("tableEditor.freezeCols")}
            />
            <div
              ref={indicatorRef}
              className="TableEditorModal__freezeIndicator"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableEditorModalInner;
