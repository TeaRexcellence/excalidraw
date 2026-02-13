import React, { useState, useCallback } from "react";

import { newCodeBlockElement } from "@excalidraw/element";
import { CaptureUpdateAction } from "@excalidraw/element";

import type { CodeBlockLanguage } from "@excalidraw/element/types";

import { t } from "../i18n";

import { Dialog } from "./Dialog";
import { FilledButton } from "./FilledButton";
import { useApp } from "./App";

const LANGUAGES: { value: CodeBlockLanguage; label: string }[] = [
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "csharp", label: "C#" },
  { value: "cpp", label: "C++" },
  { value: "markdown", label: "Markdown" },
  { value: "plaintext", label: "Plain Text" },
];

interface CodeBlockCreateDialogProps {
  onClose: () => void;
}

export const CodeBlockCreateDialog: React.FC<CodeBlockCreateDialogProps> = ({
  onClose,
}) => {
  const app = useApp();
  const [language, setLanguage] = useState<CodeBlockLanguage>("javascript");

  const handleCreate = useCallback(() => {
    const viewportCenterX =
      -app.state.scrollX + app.state.width / 2 / app.state.zoom.value;
    const viewportCenterY =
      -app.state.scrollY + app.state.height / 2 / app.state.zoom.value;

    const element = newCodeBlockElement({
      x: viewportCenterX - 200,
      y: viewportCenterY - 125,
      language,
      code: "",
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
  }, [app, language, onClose]);

  return (
    <Dialog
      onCloseRequest={onClose}
      title={t("codeBlockDialog.title")}
      className="CodeBlockCreateDialog"
      size="small"
    >
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span>{t("codeBlockDialog.language")}</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as CodeBlockLanguage)}
            style={{
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid var(--default-border-color)",
              background: "var(--island-bg-color)",
              color: "var(--text-primary-color)",
              fontSize: "14px",
            }}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <FilledButton
            variant="outlined"
            color="muted"
            label={t("buttons.cancel")}
            onClick={onClose}
          />
          <FilledButton
            label={t("codeBlockDialog.create")}
            onClick={handleCreate}
          />
        </div>
      </div>
    </Dialog>
  );
};
