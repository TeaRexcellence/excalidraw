import React, { useRef, useEffect, useCallback, useState } from "react";
import { HotTable, HotTableClass } from "@handsontable/react";
import { registerAllModules } from "handsontable/registry";
import "handsontable/dist/handsontable.full.min.css";

import type { ExcalidrawTableElement } from "@excalidraw/element/types";
import { CaptureUpdateAction } from "@excalidraw/element";

import { t } from "../i18n";
import { parseCSV, autoSizeColumns } from "../utils/csvParser";

import { useApp } from "./App";

import "./TableEditorModal.scss";

registerAllModules();

const DEFAULT_COL_WIDTH = 120;
const DEFAULT_ROW_HEIGHT = 36;

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

  const element = app.scene.getElement(elementId) as
    | ExcalidrawTableElement
    | undefined;

  const [headerRow, setHeaderRow] = useState(element?.headerRow ?? true);

  // Build initial data from element
  const initialData = useCallback((): string[][] => {
    if (!element) {
      return [["", "", ""], ["", "", ""], ["", "", ""]];
    }
    const data: string[][] = [];
    for (let r = 0; r < element.rows; r++) {
      const row: string[] = [];
      for (let c = 0; c < element.columns; c++) {
        row.push(element.cells[r]?.[c] ?? "");
      }
      data.push(row);
    }
    return data;
  }, [element]);

  const initialColWidths = useCallback((): number[] => {
    if (!element) {
      return [DEFAULT_COL_WIDTH, DEFAULT_COL_WIDTH, DEFAULT_COL_WIDTH];
    }
    return element.columnWidths.map((w) => Math.max(w || DEFAULT_COL_WIDTH, 50));
  }, [element]);

  // Sync data back to element and close
  const handleDone = useCallback(() => {
    const hot = hotRef.current?.hotInstance;
    if (!hot || !element) {
      onClose();
      return;
    }

    const newData = hot.getData() as string[][];
    const newRows = newData.length;
    const newCols = newData.length > 0 ? newData[0].length : element.columns;

    // Build cells
    const newCells: string[][] = [];
    for (let r = 0; r < newRows; r++) {
      const row: string[] = [];
      for (let c = 0; c < newCols; c++) {
        row.push(String(newData[r]?.[c] ?? ""));
      }
      newCells.push(row);
    }

    // Read column widths
    const newColumnWidths: number[] = [];
    for (let c = 0; c < newCols; c++) {
      const w = hot.getColWidth(c);
      newColumnWidths.push(
        typeof w === "number" && w > 0 ? w : DEFAULT_COL_WIDTH,
      );
    }

    // Read row heights
    const newRowHeights: number[] = [];
    for (let r = 0; r < newRows; r++) {
      const h = hot.getRowHeight(r);
      newRowHeights.push(
        typeof h === "number" && h > 0 ? h : DEFAULT_ROW_HEIGHT,
      );
    }

    const newWidth = newColumnWidths.reduce((s, w) => s + w, 0);
    const newHeight = newRowHeights.reduce((s, h) => s + h, 0);

    // Mutate element as one atomic change
    const freshElement = app.scene.getElement(elementId);
    if (freshElement) {
      app.scene.mutateElement(freshElement as any, {
        cells: newCells,
        rows: newRows,
        columns: newCols,
        columnWidths: newColumnWidths,
        rowHeights: newRowHeights,
        headerRow,
        width: newWidth,
        height: newHeight,
        scrollOffsetY: 0,
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
  }, [app, element, elementId, headerRow, onClose]);

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

  // Escape key to close (when not editing a cell)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const hot = hotRef.current?.hotInstance;
        if (hot) {
          const activeEditor = hot.getActiveEditor();
          if (activeEditor && activeEditor.isOpened()) {
            // Let Handsontable handle Escape (close cell editor)
            return;
          }
        }
        e.preventDefault();
        e.stopPropagation();
        handleDone();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [handleDone]);

  // Detect dark mode
  const isDark =
    document.querySelector(".excalidraw.theme--dark") !== null;

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
            <label className="TableEditorModal__headerToggle">
              <input
                type="checkbox"
                checked={headerRow}
                onChange={(e) => setHeaderRow(e.target.checked)}
              />
              {t("tableEditor.headerRow")}
            </label>
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
        <div className="TableEditorModal__sheet">
          <HotTable
            ref={hotRef}
            data={initialData()}
            colWidths={initialColWidths()}
            rowHeights={DEFAULT_ROW_HEIGHT}
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
          />
        </div>
      </div>
    </div>
  );
};

export default TableEditorModalInner;
