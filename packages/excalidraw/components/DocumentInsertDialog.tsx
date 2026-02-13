import React, { useState, useCallback } from "react";

import { newCodeBlockElement, newDocumentElement } from "@excalidraw/element";
import { CaptureUpdateAction } from "@excalidraw/element";

import { t } from "../i18n";
import { detectLanguageFromExtension } from "../utils/languageDetect";

import { Dialog } from "./Dialog";
import { FilledButton } from "./FilledButton";
import { useApp } from "./App";

import "./DocumentInsertDialog.scss";

interface PickedFile {
  filePath: string;
  fileName: string;
  fileContent: string;
}

interface DocumentInsertDialogProps {
  onClose: () => void;
}

export const DocumentInsertDialog: React.FC<DocumentInsertDialogProps> = ({
  onClose,
}) => {
  const app = useApp();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [picking, setPicking] = useState(false);

  const handlePickFile = useCallback(async () => {
    setPicking(true);
    try {
      const resp = await fetch("/api/files/pick", { method: "POST" });
      const data = await resp.json();
      if (data.cancelled || !data.filePath) {
        setPicking(false);
        return;
      }
      setFile({
        filePath: data.filePath,
        fileName: data.fileName,
        fileContent: data.fileContent,
      });
    } catch {
      // server not available
    }
    setPicking(false);
  }, []);

  const insertAsCodeBlock = useCallback(() => {
    if (!file) {
      return;
    }

    const language = detectLanguageFromExtension(file.fileName);
    const viewportCenterX =
      -app.state.scrollX + app.state.width / 2 / app.state.zoom.value;
    const viewportCenterY =
      -app.state.scrollY + app.state.height / 2 / app.state.zoom.value;

    const element = newCodeBlockElement({
      x: viewportCenterX - 200,
      y: viewportCenterY - 125,
      code: file.fileContent,
      language,
      showLineNumbers: true,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 0,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
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
  }, [app, file, onClose]);

  const insertAsThumbnail = useCallback(() => {
    if (!file) {
      return;
    }

    const ext = file.fileName.split(".").pop() ?? "txt";
    const viewportCenterX =
      -app.state.scrollX + app.state.width / 2 / app.state.zoom.value;
    const viewportCenterY =
      -app.state.scrollY + app.state.height / 2 / app.state.zoom.value;

    const element = newDocumentElement({
      x: viewportCenterX - 100,
      y: viewportCenterY - 40,
      fileName: file.fileName,
      fileType: ext,
      filePath: file.filePath,
      fileContent: file.fileContent,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 0,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
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
  }, [app, file, onClose]);

  return (
    <Dialog
      onCloseRequest={onClose}
      title={t("documentDialog.insertTitle")}
      className="DocumentInsertDialog"
      size="small"
    >
      <div className="DocumentInsertDialog__content">
        {!file ? (
          <div className="DocumentInsertDialog__filePicker">
            <FilledButton
              label={picking ? "Opening file dialog..." : t("documentDialog.selectFile")}
              onClick={picking ? undefined : handlePickFile}
            />
          </div>
        ) : (
          <div className="DocumentInsertDialog__options">
            <div className="DocumentInsertDialog__fileName">{file.fileName}</div>
            <div className="DocumentInsertDialog__buttons">
              <button
                className="DocumentInsertDialog__option"
                onClick={insertAsCodeBlock}
              >
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 8l-4 4l4 4" />
                  <path d="M17 8l4 4l-4 4" />
                  <path d="M14 4l-4 16" />
                </svg>
                <span>{t("documentDialog.displayAsCodeBlock")}</span>
              </button>
              <button
                className="DocumentInsertDialog__option"
                onClick={insertAsThumbnail}
              >
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                  <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
                </svg>
                <span>{t("documentDialog.displayAsThumbnail")}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
