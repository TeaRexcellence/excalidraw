import React, { useState, useCallback, useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-markdown";

import { CaptureUpdateAction } from "@excalidraw/element";

import type { ExcalidrawDocumentElement } from "@excalidraw/element/types";

import { t } from "../i18n";
import { detectLanguageFromExtension } from "../utils/languageDetect";

import { Dialog } from "./Dialog";
import { FilledButton } from "./FilledButton";
import { useApp } from "./App";

import "./DocumentViewerDialog.scss";

const LANGUAGE_MAP: Record<string, string | null> = {
  javascript: "javascript",
  python: "python",
  csharp: "csharp",
  cpp: "cpp",
  markdown: "markdown",
  plaintext: null,
};

interface DocumentViewerDialogProps {
  element: ExcalidrawDocumentElement;
  onClose: () => void;
}

export const DocumentViewerDialog: React.FC<DocumentViewerDialogProps> = ({
  element,
  onClose,
}) => {
  const app = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(element.fileContent);
  const preRef = useRef<HTMLPreElement>(null);

  const language = detectLanguageFromExtension(element.fileName);
  const langKey = LANGUAGE_MAP[language];

  useEffect(() => {
    if (!isEditing && preRef.current) {
      let html: string;
      if (langKey && Prism.languages[langKey]) {
        html = Prism.highlight(content, Prism.languages[langKey], langKey);
      } else {
        html = content
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }
      preRef.current.innerHTML = html;
    }
  }, [content, isEditing, langKey]);

  const handleSave = useCallback(() => {
    app.scene.mutateElement(element, {
      fileContent: content,
    });
    app.syncActionResult({
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    setIsEditing(false);
  }, [app, element, content]);

  return (
    <Dialog
      onCloseRequest={onClose}
      title={`${element.fileName} — ${t("documentDialog.viewerTitle")}`}
      className="DocumentViewerDialog"
      size="wide"
    >
      <div className="DocumentViewerDialog__content">
        <div className="DocumentViewerDialog__info">
          <span className="DocumentViewerDialog__path">
            {element.filePath || element.fileName}
          </span>
          <div className="DocumentViewerDialog__actions">
            {isEditing ? (
              <FilledButton
                label={t("documentDialog.save")}
                onClick={handleSave}
              />
            ) : (
              <FilledButton
                variant="outlined"
                color="muted"
                label={t("documentDialog.edit")}
                onClick={() => setIsEditing(true)}
              />
            )}
          </div>
        </div>
        <div className="DocumentViewerDialog__codeArea">
          {isEditing ? (
            <textarea
              className="DocumentViewerDialog__textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
            />
          ) : (
            <pre
              ref={preRef}
              className="DocumentViewerDialog__code"
            />
          )}
        </div>
      </div>
    </Dialog>
  );
};
