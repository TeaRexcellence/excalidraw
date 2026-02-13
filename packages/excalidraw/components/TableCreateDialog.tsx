import React, { useState, useCallback, useRef } from "react";
import clsx from "clsx";

import { newTableElement } from "@excalidraw/element";
import { CaptureUpdateAction } from "@excalidraw/element";

import { t } from "../i18n";
import { parseCSV, autoSizeColumns } from "../utils/csvParser";

import { Dialog } from "./Dialog";
import { FilledButton } from "./FilledButton";
import { useApp } from "./App";

import "./TableCreateDialog.scss";

const DEFAULT_CELL_WIDTH = 120;
const DEFAULT_CELL_HEIGHT = 36;
const MAX_GRID_SIZE = 8;

type Mode = "choose" | "new" | "csv";

interface TableCreateDialogProps {
  onClose: () => void;
}

const GridPicker: React.FC<{
  onSelect: (rows: number, cols: number) => void;
}> = ({ onSelect }) => {
  const [hoverRow, setHoverRow] = useState(0);
  const [hoverCol, setHoverCol] = useState(0);

  return (
    <div className="TableGridPicker">
      <div className="TableGridPicker__label">
        {hoverRow > 0 ? `${hoverRow} \u00d7 ${hoverCol}` : t("tableDialog.selectSize")}
      </div>
      <div className="TableGridPicker__grid">
        {Array.from({ length: MAX_GRID_SIZE }, (_, r) => (
          <div key={r} className="TableGridPicker__row">
            {Array.from({ length: MAX_GRID_SIZE }, (_, c) => (
              <div
                key={c}
                className={clsx("TableGridPicker__cell", {
                  "TableGridPicker__cell--active":
                    r < hoverRow && c < hoverCol,
                })}
                onMouseEnter={() => {
                  setHoverRow(r + 1);
                  setHoverCol(c + 1);
                }}
                onClick={() => onSelect(r + 1, c + 1)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const TableCreateDialog: React.FC<TableCreateDialogProps> = ({
  onClose,
}) => {
  const app = useApp();
  const [mode, setMode] = useState<Mode>("choose");
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const [csvText, setCsvText] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const insertTable = useCallback(
    (
      tableRows: number,
      tableCols: number,
      cells?: string[][],
      columnWidths?: number[],
    ) => {
      const finalColumnWidths =
        columnWidths || Array(tableCols).fill(DEFAULT_CELL_WIDTH);
      const finalRowHeights = Array(tableRows).fill(DEFAULT_CELL_HEIGHT);

      const totalWidth = finalColumnWidths.reduce(
        (s: number, w: number) => s + w,
        0,
      );
      const totalHeight = finalRowHeights.reduce(
        (s: number, h: number) => s + h,
        0,
      );

      // Place in center of viewport
      const viewportCenterX =
        -app.state.scrollX + app.state.width / 2 / app.state.zoom.value;
      const viewportCenterY =
        -app.state.scrollY + app.state.height / 2 / app.state.zoom.value;

      const element = newTableElement({
        x: viewportCenterX - totalWidth / 2,
        y: viewportCenterY - totalHeight / 2,
        rows: tableRows,
        columns: tableCols,
        cells,
        columnWidths: finalColumnWidths,
        rowHeights: finalRowHeights,
        headerRow: true,
        strokeColor: app.state.currentItemStrokeColor,
        backgroundColor: "transparent",
        fillStyle: app.state.currentItemFillStyle,
        strokeWidth: app.state.currentItemStrokeWidth,
        strokeStyle: app.state.currentItemStrokeStyle,
        roughness: 0,
        opacity: app.state.currentItemOpacity,
        locked: false,
      });

      app.scene.insertElement(element);

      app.syncActionResult({
        appState: {
          ...app.state,
          selectedElementIds: { [element.id]: true },
          openDialog: null,
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      onClose();
    },
    [app, onClose],
  );

  const handleCreateNew = useCallback(() => {
    insertTable(rows, columns);
  }, [rows, columns, insertTable]);

  const handleGridSelect = useCallback(
    (gridRows: number, gridCols: number) => {
      insertTable(gridRows, gridCols);
    },
    [insertTable],
  );

  const handleImportCSV = useCallback(() => {
    setError("");
    const parsed = parseCSV(csvText);
    if (parsed.length === 0) {
      setError(t("tableDialog.csvEmpty"));
      return;
    }
    if (parsed.length > 50 || (parsed[0] && parsed[0].length > 50)) {
      setError(t("tableDialog.csvTooLarge"));
      return;
    }
    const colWidths = autoSizeColumns(parsed);
    insertTable(parsed.length, parsed[0].length, parsed, colWidths);
  }, [csvText, insertTable]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setCsvText(reader.result as string);
      };
      reader.readAsText(file);
    },
    [],
  );

  return (
    <Dialog
      onCloseRequest={onClose}
      title={t("tableDialog.title")}
      className="TableCreateDialog"
      size="small"
    >
      {mode === "choose" && (
        <div className="TableCreateDialog__choose">
          <button
            className="TableCreateDialog__option"
            onClick={() => setMode("new")}
          >
            <div className="TableCreateDialog__option-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
                <path d="M3 10h18" />
                <path d="M3 15h18" />
                <path d="M10 3v18" />
              </svg>
            </div>
            <div className="TableCreateDialog__option-label">
              {t("tableDialog.createNew")}
            </div>
          </button>
          <button
            className="TableCreateDialog__option"
            onClick={() => setMode("csv")}
          >
            <div className="TableCreateDialog__option-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
                <path d="M10 13l-1 2l1 2" />
                <path d="M14 13l1 2l-1 2" />
              </svg>
            </div>
            <div className="TableCreateDialog__option-label">
              {t("tableDialog.importCSV")}
            </div>
          </button>
        </div>
      )}

      {mode === "new" && (
        <div className="TableCreateDialog__new">
          <GridPicker onSelect={handleGridSelect} />

          <div className="TableCreateDialog__separator">
            <span>{t("tableDialog.orManual")}</span>
          </div>

          <div className="TableCreateDialog__inputs">
            <label>
              {t("tableDialog.rows")}
              <input
                type="number"
                min={1}
                max={50}
                value={rows}
                onChange={(e) =>
                  setRows(Math.max(1, Math.min(50, Number(e.target.value))))
                }
              />
            </label>
            <label>
              {t("tableDialog.columns")}
              <input
                type="number"
                min={1}
                max={50}
                value={columns}
                onChange={(e) =>
                  setColumns(Math.max(1, Math.min(50, Number(e.target.value))))
                }
              />
            </label>
          </div>

          <div className="TableCreateDialog__actions">
            <FilledButton
              variant="outlined"
              color="muted"
              label={t("tableDialog.back")}
              onClick={() => setMode("choose")}
            />
            <FilledButton
              label={t("tableDialog.insert")}
              onClick={handleCreateNew}
            />
          </div>
        </div>
      )}

      {mode === "csv" && (
        <div className="TableCreateDialog__csv">
          <textarea
            className="TableCreateDialog__csvInput"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={t("tableDialog.csvPlaceholder")}
            rows={8}
          />

          <div className="TableCreateDialog__csvFile">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
            <FilledButton
              variant="outlined"
              color="muted"
              label={t("tableDialog.uploadFile")}
              onClick={() => fileInputRef.current?.click()}
            />
          </div>

          {error && <div className="TableCreateDialog__error">{error}</div>}

          <div className="TableCreateDialog__actions">
            <FilledButton
              variant="outlined"
              color="muted"
              label={t("tableDialog.back")}
              onClick={() => setMode("choose")}
            />
            <FilledButton
              label={t("tableDialog.import")}
              onClick={handleImportCSV}
            />
          </div>
        </div>
      )}
    </Dialog>
  );
};
