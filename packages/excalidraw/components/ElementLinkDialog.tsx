import { useCallback, useEffect, useRef, useState } from "react";

import { normalizeLink, KEYS, randomId } from "@excalidraw/common";

import {
  defaultGetElementLinkFromSelection,
  getLinkIdAndTypeFromSelection,
  parseElementLinkFromURL,
} from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import type { Scene } from "@excalidraw/element";

import { t } from "../i18n";
import { getSelectedElements } from "../scene";

import DialogActionButton from "./DialogActionButton";
import { QUICK_LINK_SENTINEL } from "./QuickLinks";
import { TextField } from "./TextField";
import { ToolButton } from "./ToolButton";
import { TrashIcon } from "./icons";

import "./ElementLinkDialog.scss";

import type { AppProps, AppState, QuickLink, UIAppState } from "../types";
const ElementLinkDialog = ({
  sourceElementId,
  onClose,
  appState,
  scene,
  setAppState,
  generateLinkForSelection = defaultGetElementLinkFromSelection,
}: {
  sourceElementId: ExcalidrawElement["id"];
  appState: UIAppState;
  scene: Scene;
  onClose?: () => void;
  setAppState: React.Component<any, AppState>["setState"];
  generateLinkForSelection: AppProps["generateLinkForSelection"];
}) => {
  const isQuickLinkMode = sourceElementId === QUICK_LINK_SENTINEL;
  const elementsMap = scene.getNonDeletedElementsMap();
  const originalLink = isQuickLinkMode
    ? null
    : (elementsMap.get(sourceElementId)?.link ?? null);

  const [nextLink, setNextLink] = useState<string | null>(originalLink);
  const [linkEdited, setLinkEdited] = useState(false);
  const [quickLinkName, setQuickLinkName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Live-update the link field when the user clicks elements on the canvas
  useEffect(() => {
    const selectedElements = getSelectedElements(elementsMap, appState);
    let nextLink = originalLink;

    if (selectedElements.length > 0 && generateLinkForSelection) {
      const idAndType = getLinkIdAndTypeFromSelection(
        selectedElements,
        appState as AppState,
      );

      if (idAndType) {
        nextLink = normalizeLink(
          generateLinkForSelection(idAndType.id, idAndType.type),
        );
      }
    }

    setNextLink(nextLink);
  }, [
    elementsMap,
    appState,
    appState.selectedElementIds,
    originalLink,
    generateLinkForSelection,
  ]);

  // Auto-focus naming input when a link is selected in quick link mode
  useEffect(() => {
    if (isQuickLinkMode && nextLink) {
      requestAnimationFrame(() => nameInputRef.current?.focus());
    }
  }, [isQuickLinkMode, nextLink]);

  const handleConfirm = useCallback(() => {
    if (isQuickLinkMode) {
      if (nextLink) {
        const targetId = parseElementLinkFromURL(nextLink);
        if (targetId) {
          const trimmedName = quickLinkName.trim();
          if (!trimmedName) {
            // Focus the name input if empty
            nameInputRef.current?.focus();
            return;
          }
          const newLink: QuickLink = {
            id: randomId(),
            elementId: targetId,
            label: trimmedName,
          };
          setAppState((prev: AppState) => ({
            quickLinks: [...(prev.quickLinks ?? []), newLink],
            openDialog: null,
          }));
          return;
        }
      }
      onClose?.();
      return;
    }

    if (nextLink && nextLink !== elementsMap.get(sourceElementId)?.link) {
      const elementToLink = elementsMap.get(sourceElementId);
      elementToLink &&
        scene.mutateElement(elementToLink, {
          link: nextLink,
        });
    }

    if (!nextLink && linkEdited && sourceElementId) {
      const elementToLink = elementsMap.get(sourceElementId);
      elementToLink &&
        scene.mutateElement(elementToLink, {
          link: null,
        });
    }

    onClose?.();
  }, [
    isQuickLinkMode,
    sourceElementId,
    nextLink,
    elementsMap,
    linkEdited,
    scene,
    onClose,
    setAppState,
    quickLinkName,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        appState.openDialog?.name === "elementLinkSelector" &&
        event.key === KEYS.ENTER
      ) {
        handleConfirm();
      }

      if (
        appState.openDialog?.name === "elementLinkSelector" &&
        event.key === KEYS.ESCAPE
      ) {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [appState, onClose, handleConfirm]);

  return (
    <div className="ElementLinkDialog">
      <div className="ElementLinkDialog__header">
        <h2>
          {isQuickLinkMode
            ? t("quickLinks.addLink")
            : t("elementLink.title")}
        </h2>
        <p>{t("elementLink.desc")}</p>
      </div>

      <div className="ElementLinkDialog__input">
        <TextField
          value={nextLink ?? ""}
          onChange={(value) => {
            if (!linkEdited) {
              setLinkEdited(true);
            }
            setNextLink(value);
          }}
          onKeyDown={(event) => {
            if (event.key === KEYS.ENTER) {
              if (isQuickLinkMode) {
                // Move focus to name input instead of confirming
                nameInputRef.current?.focus();
              } else {
                handleConfirm();
              }
            }
          }}
          className="ElementLinkDialog__input-field"
          selectOnRender={!isQuickLinkMode}
        />

        {originalLink && nextLink && (
          <ToolButton
            type="button"
            title={t("buttons.remove")}
            aria-label={t("buttons.remove")}
            label={t("buttons.remove")}
            onClick={() => {
              setNextLink(null);
              setLinkEdited(true);
            }}
            className="ElementLinkDialog__remove"
            icon={TrashIcon}
          />
        )}
      </div>

      {isQuickLinkMode && nextLink && (
        <div className="ElementLinkDialog__naming">
          <label>{t("quickLinks.namePrompt")}</label>
          <input
            ref={nameInputRef}
            type="text"
            value={quickLinkName}
            onChange={(e) => setQuickLinkName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === KEYS.ENTER) {
                e.preventDefault();
                handleConfirm();
              }
            }}
            placeholder={t("quickLinks.namePlaceholder")}
          />
        </div>
      )}

      <div className="ElementLinkDialog__actions">
        <DialogActionButton
          label={t("buttons.cancel")}
          onClick={() => {
            onClose?.();
          }}
          style={{
            marginRight: 10,
          }}
        />

        <DialogActionButton
          label={isQuickLinkMode ? t("quickLinks.save") : t("buttons.confirm")}
          onClick={handleConfirm}
          actionType="primary"
        />
      </div>
    </div>
  );
};

export default ElementLinkDialog;
