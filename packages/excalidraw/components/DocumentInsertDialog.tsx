import React, { useState, useCallback } from "react";

import { newDocumentElement } from "@excalidraw/element";
import { CaptureUpdateAction } from "@excalidraw/element";

import { t } from "../i18n";

import { Dialog } from "./Dialog";
import { FilledButton } from "./FilledButton";
import { useApp } from "./App";

import "./DocumentInsertDialog.scss";

interface DocumentInsertDialogProps {
  onClose: () => void;
}

export const DocumentInsertDialog: React.FC<DocumentInsertDialogProps> = ({
  onClose,
}) => {
  const app = useApp();
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

      const ext = data.fileName.split(".").pop() ?? "txt";
      const viewportCenterX =
        -app.state.scrollX + app.state.width / 2 / app.state.zoom.value;
      const viewportCenterY =
        -app.state.scrollY + app.state.height / 2 / app.state.zoom.value;

      const element = newDocumentElement({
        x: viewportCenterX - 100,
        y: viewportCenterY - 40,
        fileName: data.fileName,
        fileType: ext,
        filePath: data.filePath,
        fileContent: data.fileContent ?? "",
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
    } catch {
      // server not available
    }
    setPicking(false);
  }, [app, onClose]);

  return (
    <Dialog
      onCloseRequest={onClose}
      title={t("documentDialog.insertTitle")}
      className="DocumentInsertDialog"
      size="small"
    >
      <div className="DocumentInsertDialog__content">
        <div className="DocumentInsertDialog__filePicker">
          <FilledButton
            label={
              picking
                ? "Opening file dialog..."
                : t("documentDialog.selectFile")
            }
            onClick={picking ? undefined : handlePickFile}
          />
        </div>
      </div>
    </Dialog>
  );
};
