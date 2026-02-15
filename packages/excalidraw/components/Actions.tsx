import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";

import {
  CLASSES,
  KEYS,
  capitalizeString,
  isTransparent,
} from "@excalidraw/common";

import {
  shouldAllowVerticalAlign,
  suppportsHorizontalAlign,
  hasBoundTextElement,
  isElbowArrow,
  isImageElement,
  isLinearElement,
  isTextElement,
  isArrowElement,
  hasStrokeColor,
  toolIsArrow,
  newTableElement,
  newCodeBlockElement,
  CaptureUpdateAction,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawElementType,
  NonDeletedElementsMap,
  NonDeletedSceneElementsMap,
} from "@excalidraw/element/types";

import { actionToggleZenMode } from "../actions";

import { alignActionsPredicate } from "../actions/actionAlign";
import { trackEvent } from "../analytics";

import { t } from "../i18n";
import {
  canChangeRoundness,
  canHaveArrowheads,
  getTargetElements,
  hasBackground,
  hasStrokeStyle,
  hasStrokeWidth,
} from "../scene";

import { getFormValue } from "../actions/actionProperties";

import { useTextEditorFocus } from "../hooks/useTextEditorFocus";

import { actionToggleViewMode } from "../actions/actionToggleViewMode";

import { getToolbarTools } from "./shapes";

import "./Actions.scss";

import {
  useEditorInterface,
  useStylesPanelMode,
  useExcalidrawContainer,
} from "./App";
import Stack from "./Stack";
import { ToolButton } from "./ToolButton";
import { ToolPopover } from "./ToolPopover";
import { Tooltip } from "./Tooltip";
import { PropertiesPopover } from "./PropertiesPopover";
import {
  EmbedIcon,
  VideoIcon,
  TableIcon,
  CodeBlockIcon,
  DocumentInsertIcon,
  ProjectLinkIcon,
  frameToolIcon,
  laserPointerToolIcon,
  LassoIcon,
  sharpArrowIcon,
  roundArrowIcon,
  elbowArrowIcon,
  TextSizeIcon,
  adjustmentsIcon,
  DotsHorizontalIcon,
  SelectionIcon,
  pencilIcon,
  LockedIcon,
  UnlockedIcon,
  RectangleIcon,
  DiamondIcon,
  EllipseIcon,
  ArrowIcon,
  LineIcon,
  ImageIcon,
  EraserIcon,
} from "./icons";

import { Island } from "./Island";

import type {
  AppClassProperties,
  AppProps,
  UIAppState,
  Zoom,
  AppState,
} from "../types";
import type { ActionManager } from "../actions/manager";

// Common CSS class combinations
const PROPERTIES_CLASSES = clsx([
  CLASSES.SHAPE_ACTIONS_THEME_SCOPE,
  "properties-content",
]);

export const canChangeStrokeColor = (
  appState: UIAppState,
  targetElements: ExcalidrawElement[],
) => {
  let commonSelectedType: ExcalidrawElementType | null =
    targetElements[0]?.type || null;

  for (const element of targetElements) {
    if (element.type !== commonSelectedType) {
      commonSelectedType = null;
      break;
    }
  }

  return (
    (hasStrokeColor(appState.activeTool.type) &&
      commonSelectedType !== "image" &&
      commonSelectedType !== "frame" &&
      commonSelectedType !== "magicframe") ||
    targetElements.some((element) => hasStrokeColor(element.type))
  );
};

export const canChangeBackgroundColor = (
  appState: UIAppState,
  targetElements: ExcalidrawElement[],
) => {
  return (
    hasBackground(appState.activeTool.type) ||
    targetElements.some((element) => hasBackground(element.type))
  );
};

export const SelectedShapeActions = ({
  appState,
  elementsMap,
  renderAction,
  app,
}: {
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
  renderAction: ActionManager["renderAction"];
  app: AppClassProperties;
}) => {
  const targetElements = getTargetElements(elementsMap, appState);

  let isSingleElementBoundContainer = false;
  if (
    targetElements.length === 2 &&
    (hasBoundTextElement(targetElements[0]) ||
      hasBoundTextElement(targetElements[1]))
  ) {
    isSingleElementBoundContainer = true;
  }
  const isEditingTextOrNewElement = Boolean(
    appState.editingTextElement || appState.newElement,
  );
  const editorInterface = useEditorInterface();
  const isRTL = document.documentElement.getAttribute("dir") === "rtl";

  const showFillIcons =
    (hasBackground(appState.activeTool.type) &&
      !isTransparent(appState.currentItemBackgroundColor)) ||
    targetElements.some(
      (element) =>
        hasBackground(element.type) && !isTransparent(element.backgroundColor),
    );

  const showLinkIcon =
    targetElements.length === 1 || isSingleElementBoundContainer;

  const showLineEditorAction =
    !appState.selectedLinearElement?.isEditing &&
    targetElements.length === 1 &&
    isLinearElement(targetElements[0]) &&
    !isElbowArrow(targetElements[0]);

  const showCropEditorAction =
    !appState.croppingElementId &&
    targetElements.length === 1 &&
    isImageElement(targetElements[0]);

  const showAlignActions =
    !isSingleElementBoundContainer && alignActionsPredicate(appState, app);

  return (
    <div className="selected-shape-actions">
      <div>
        {canChangeStrokeColor(appState, targetElements) &&
          renderAction("changeStrokeColor")}
      </div>
      {canChangeBackgroundColor(appState, targetElements) && (
        <div>{renderAction("changeBackgroundColor")}</div>
      )}
      {showFillIcons && renderAction("changeFillStyle")}

      {(hasStrokeWidth(appState.activeTool.type) ||
        targetElements.some((element) => hasStrokeWidth(element.type))) &&
        renderAction("changeStrokeWidth")}

      {(appState.activeTool.type === "freedraw" ||
        targetElements.some((element) => element.type === "freedraw")) &&
        renderAction("changeStrokeShape")}

      {(hasStrokeStyle(appState.activeTool.type) ||
        targetElements.some((element) => hasStrokeStyle(element.type))) && (
        <>
          {renderAction("changeStrokeStyle")}
          {renderAction("changeSloppiness")}
        </>
      )}

      {(canChangeRoundness(appState.activeTool.type) ||
        targetElements.some((element) => canChangeRoundness(element.type))) && (
        <>{renderAction("changeRoundness")}</>
      )}

      {(toolIsArrow(appState.activeTool.type) ||
        targetElements.some((element) => toolIsArrow(element.type))) && (
        <>{renderAction("changeArrowType")}</>
      )}

      {(appState.activeTool.type === "text" ||
        targetElements.some(isTextElement)) && (
        <>
          {renderAction("changeFontFamily")}
          {renderAction("changeFontSize")}
          {(appState.activeTool.type === "text" ||
            suppportsHorizontalAlign(targetElements, elementsMap)) &&
            renderAction("changeTextAlign")}
        </>
      )}

      {shouldAllowVerticalAlign(targetElements, elementsMap) &&
        renderAction("changeVerticalAlign")}
      {(canHaveArrowheads(appState.activeTool.type) ||
        targetElements.some((element) => canHaveArrowheads(element.type))) && (
        <>{renderAction("changeArrowhead")}</>
      )}

      {renderAction("changeOpacity")}

      <fieldset>
        <legend>{t("labels.layers")}</legend>
        <div className="buttonList">
          {renderAction("sendToBack")}
          {renderAction("sendBackward")}
          {renderAction("bringForward")}
          {renderAction("bringToFront")}
        </div>
      </fieldset>

      {showAlignActions && !isSingleElementBoundContainer && (
        <fieldset>
          <legend>{t("labels.align")}</legend>
          <div className="buttonList">
            {
              // swap this order for RTL so the button positions always match their action
              // (i.e. the leftmost button aligns left)
            }
            {isRTL ? (
              <>
                {renderAction("alignRight")}
                {renderAction("alignHorizontallyCentered")}
                {renderAction("alignLeft")}
              </>
            ) : (
              <>
                {renderAction("alignLeft")}
                {renderAction("alignHorizontallyCentered")}
                {renderAction("alignRight")}
              </>
            )}
            {targetElements.length > 2 &&
              renderAction("distributeHorizontally")}
            {/* breaks the row ˇˇ */}
            <div style={{ flexBasis: "100%", height: 0 }} />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: ".5rem",
                marginTop: "-0.5rem",
              }}
            >
              {renderAction("alignTop")}
              {renderAction("alignVerticallyCentered")}
              {renderAction("alignBottom")}
              {targetElements.length > 2 &&
                renderAction("distributeVertically")}
            </div>
          </div>
        </fieldset>
      )}
      {!isEditingTextOrNewElement && targetElements.length > 0 && (
        <fieldset>
          <legend>{t("labels.actions")}</legend>
          <div className="buttonList">
            {editorInterface.formFactor !== "phone" &&
              renderAction("duplicateSelection")}
            {editorInterface.formFactor !== "phone" &&
              renderAction("deleteSelectedElements")}
            {renderAction("group")}
            {renderAction("ungroup")}
            {showLinkIcon && renderAction("hyperlink")}
            {showCropEditorAction && renderAction("cropEditor")}
            {showLineEditorAction && renderAction("toggleLinearEditor")}
          </div>
        </fieldset>
      )}
    </div>
  );
};

const CombinedShapeProperties = ({
  appState,
  renderAction,
  setAppState,
  targetElements,
  container,
}: {
  targetElements: ExcalidrawElement[];
  appState: UIAppState;
  renderAction: ActionManager["renderAction"];
  setAppState: React.Component<any, AppState>["setState"];
  container: HTMLDivElement | null;
}) => {
  const showFillIcons =
    (hasBackground(appState.activeTool.type) &&
      !isTransparent(appState.currentItemBackgroundColor)) ||
    targetElements.some(
      (element) =>
        hasBackground(element.type) && !isTransparent(element.backgroundColor),
    );

  const shouldShowCombinedProperties =
    targetElements.length > 0 ||
    (appState.activeTool.type !== "selection" &&
      appState.activeTool.type !== "eraser" &&
      appState.activeTool.type !== "hand" &&
      appState.activeTool.type !== "laser" &&
      appState.activeTool.type !== "lasso");
  const isOpen = appState.openPopup === "compactStrokeStyles";

  if (!shouldShowCombinedProperties) {
    return null;
  }

  return (
    <div className="compact-action-item">
      <Popover.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            setAppState({ openPopup: "compactStrokeStyles" });
          } else {
            setAppState({ openPopup: null });
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx("compact-action-button properties-trigger", {
              active: isOpen,
            })}
            title={t("labels.stroke")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              setAppState({
                openPopup: isOpen ? null : "compactStrokeStyles",
              });
            }}
          >
            {adjustmentsIcon}
          </button>
        </Popover.Trigger>
        {isOpen && (
          <PropertiesPopover
            className={PROPERTIES_CLASSES}
            container={container}
            style={{ maxWidth: "13rem" }}
            onClose={() => {}}
          >
            <div className="selected-shape-actions">
              {showFillIcons && renderAction("changeFillStyle")}
              {(hasStrokeWidth(appState.activeTool.type) ||
                targetElements.some((element) =>
                  hasStrokeWidth(element.type),
                )) &&
                renderAction("changeStrokeWidth")}
              {(hasStrokeStyle(appState.activeTool.type) ||
                targetElements.some((element) =>
                  hasStrokeStyle(element.type),
                )) && (
                <>
                  {renderAction("changeStrokeStyle")}
                  {renderAction("changeSloppiness")}
                </>
              )}
              {(canChangeRoundness(appState.activeTool.type) ||
                targetElements.some((element) =>
                  canChangeRoundness(element.type),
                )) &&
                renderAction("changeRoundness")}
              {renderAction("changeOpacity")}
            </div>
          </PropertiesPopover>
        )}
      </Popover.Root>
    </div>
  );
};

const CombinedArrowProperties = ({
  appState,
  renderAction,
  setAppState,
  targetElements,
  container,
  app,
}: {
  targetElements: ExcalidrawElement[];
  appState: UIAppState;
  renderAction: ActionManager["renderAction"];
  setAppState: React.Component<any, AppState>["setState"];
  container: HTMLDivElement | null;
  app: AppClassProperties;
}) => {
  const showShowArrowProperties =
    toolIsArrow(appState.activeTool.type) ||
    targetElements.some((element) => toolIsArrow(element.type));
  const isOpen = appState.openPopup === "compactArrowProperties";

  if (!showShowArrowProperties) {
    return null;
  }

  return (
    <div className="compact-action-item">
      <Popover.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            setAppState({ openPopup: "compactArrowProperties" });
          } else {
            setAppState({ openPopup: null });
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx("compact-action-button properties-trigger", {
              active: isOpen,
            })}
            title={t("labels.arrowtypes")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              setAppState({
                openPopup: isOpen ? null : "compactArrowProperties",
              });
            }}
          >
            {(() => {
              // Show an icon based on the current arrow type
              const arrowType = getFormValue(
                targetElements,
                app,
                (element) => {
                  if (isArrowElement(element)) {
                    return element.elbowed
                      ? "elbow"
                      : element.roundness
                      ? "round"
                      : "sharp";
                  }
                  return null;
                },
                (element) => isArrowElement(element),
                (hasSelection) =>
                  hasSelection ? null : appState.currentItemArrowType,
              );

              if (arrowType === "elbow") {
                return elbowArrowIcon;
              }
              if (arrowType === "round") {
                return roundArrowIcon;
              }
              return sharpArrowIcon;
            })()}
          </button>
        </Popover.Trigger>
        {isOpen && (
          <PropertiesPopover
            container={container}
            className="properties-content"
            style={{ maxWidth: "13rem" }}
            onClose={() => {}}
          >
            {renderAction("changeArrowProperties")}
          </PropertiesPopover>
        )}
      </Popover.Root>
    </div>
  );
};

const CombinedTextProperties = ({
  appState,
  renderAction,
  setAppState,
  targetElements,
  container,
  elementsMap,
}: {
  appState: UIAppState;
  renderAction: ActionManager["renderAction"];
  setAppState: React.Component<any, AppState>["setState"];
  targetElements: ExcalidrawElement[];
  container: HTMLDivElement | null;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
}) => {
  const { saveCaretPosition, restoreCaretPosition } = useTextEditorFocus();
  const isOpen = appState.openPopup === "compactTextProperties";

  return (
    <div className="compact-action-item">
      <Popover.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            if (appState.editingTextElement) {
              saveCaretPosition();
            }
            setAppState({ openPopup: "compactTextProperties" });
          } else {
            setAppState({ openPopup: null });
            if (appState.editingTextElement) {
              restoreCaretPosition();
            }
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx("compact-action-button properties-trigger", {
              active: isOpen,
            })}
            title={t("labels.textAlign")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();

              if (isOpen) {
                setAppState({ openPopup: null });
              } else {
                if (appState.editingTextElement) {
                  saveCaretPosition();
                }
                setAppState({ openPopup: "compactTextProperties" });
              }
            }}
          >
            {TextSizeIcon}
          </button>
        </Popover.Trigger>
        {appState.openPopup === "compactTextProperties" && (
          <PropertiesPopover
            className={PROPERTIES_CLASSES}
            container={container}
            style={{ maxWidth: "13rem" }}
            // Improve focus handling for text editing scenarios
            preventAutoFocusOnTouch={!!appState.editingTextElement}
            onClose={() => {
              // Refocus text editor when popover closes with caret restoration
              if (appState.editingTextElement) {
                restoreCaretPosition();
              }
            }}
          >
            <div className="selected-shape-actions">
              {(appState.activeTool.type === "text" ||
                targetElements.some(isTextElement)) &&
                renderAction("changeFontSize")}
              {(appState.activeTool.type === "text" ||
                suppportsHorizontalAlign(targetElements, elementsMap)) &&
                renderAction("changeTextAlign")}
              {shouldAllowVerticalAlign(targetElements, elementsMap) &&
                renderAction("changeVerticalAlign")}
            </div>
          </PropertiesPopover>
        )}
      </Popover.Root>
    </div>
  );
};

const CombinedExtraActions = ({
  appState,
  renderAction,
  targetElements,
  setAppState,
  container,
  app,
  showDuplicate,
  showDelete,
}: {
  appState: UIAppState;
  targetElements: ExcalidrawElement[];
  renderAction: ActionManager["renderAction"];
  setAppState: React.Component<any, AppState>["setState"];
  container: HTMLDivElement | null;
  app: AppClassProperties;
  showDuplicate?: boolean;
  showDelete?: boolean;
}) => {
  const isEditingTextOrNewElement = Boolean(
    appState.editingTextElement || appState.newElement,
  );
  const showCropEditorAction =
    !appState.croppingElementId &&
    targetElements.length === 1 &&
    isImageElement(targetElements[0]);
  const showLinkIcon = targetElements.length === 1;
  const showAlignActions = alignActionsPredicate(appState, app);
  let isSingleElementBoundContainer = false;
  if (
    targetElements.length === 2 &&
    (hasBoundTextElement(targetElements[0]) ||
      hasBoundTextElement(targetElements[1]))
  ) {
    isSingleElementBoundContainer = true;
  }

  const isRTL = document.documentElement.getAttribute("dir") === "rtl";
  const isOpen = appState.openPopup === "compactOtherProperties";

  if (isEditingTextOrNewElement || targetElements.length === 0) {
    return null;
  }

  return (
    <div className="compact-action-item">
      <Popover.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            setAppState({ openPopup: "compactOtherProperties" });
          } else {
            setAppState({ openPopup: null });
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx("compact-action-button properties-trigger", {
              active: isOpen,
            })}
            title={t("labels.actions")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setAppState({
                openPopup: isOpen ? null : "compactOtherProperties",
              });
            }}
          >
            {DotsHorizontalIcon}
          </button>
        </Popover.Trigger>
        {isOpen && (
          <PropertiesPopover
            className={PROPERTIES_CLASSES}
            container={container}
            style={{
              maxWidth: "12rem",
              justifyContent: "center",
              alignItems: "center",
            }}
            onClose={() => {}}
          >
            <div className="selected-shape-actions">
              <fieldset>
                <legend>{t("labels.layers")}</legend>
                <div className="buttonList">
                  {renderAction("sendToBack")}
                  {renderAction("sendBackward")}
                  {renderAction("bringForward")}
                  {renderAction("bringToFront")}
                </div>
              </fieldset>

              {showAlignActions && !isSingleElementBoundContainer && (
                <fieldset>
                  <legend>{t("labels.align")}</legend>
                  <div className="buttonList">
                    {isRTL ? (
                      <>
                        {renderAction("alignRight")}
                        {renderAction("alignHorizontallyCentered")}
                        {renderAction("alignLeft")}
                      </>
                    ) : (
                      <>
                        {renderAction("alignLeft")}
                        {renderAction("alignHorizontallyCentered")}
                        {renderAction("alignRight")}
                      </>
                    )}
                    {targetElements.length > 2 &&
                      renderAction("distributeHorizontally")}
                    {/* breaks the row ˇˇ */}
                    <div style={{ flexBasis: "100%", height: 0 }} />
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: ".5rem",
                        marginTop: "-0.5rem",
                      }}
                    >
                      {renderAction("alignTop")}
                      {renderAction("alignVerticallyCentered")}
                      {renderAction("alignBottom")}
                      {targetElements.length > 2 &&
                        renderAction("distributeVertically")}
                    </div>
                  </div>
                </fieldset>
              )}
              <fieldset>
                <legend>{t("labels.actions")}</legend>
                <div className="buttonList">
                  {renderAction("group")}
                  {renderAction("ungroup")}
                  {showLinkIcon && renderAction("hyperlink")}
                  {showCropEditorAction && renderAction("cropEditor")}
                  {showDuplicate && renderAction("duplicateSelection")}
                  {showDelete && renderAction("deleteSelectedElements")}
                </div>
              </fieldset>
            </div>
          </PropertiesPopover>
        )}
      </Popover.Root>
    </div>
  );
};

const LinearEditorAction = ({
  appState,
  renderAction,
  targetElements,
}: {
  appState: UIAppState;
  targetElements: ExcalidrawElement[];
  renderAction: ActionManager["renderAction"];
}) => {
  const showLineEditorAction =
    !appState.selectedLinearElement?.isEditing &&
    targetElements.length === 1 &&
    isLinearElement(targetElements[0]) &&
    !isElbowArrow(targetElements[0]);

  if (!showLineEditorAction) {
    return null;
  }

  return (
    <div className="compact-action-item">
      {renderAction("toggleLinearEditor")}
    </div>
  );
};

export const CompactShapeActions = ({
  appState,
  elementsMap,
  renderAction,
  app,
  setAppState,
}: {
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
  renderAction: ActionManager["renderAction"];
  app: AppClassProperties;
  setAppState: React.Component<any, AppState>["setState"];
}) => {
  const targetElements = getTargetElements(elementsMap, appState);
  const { container } = useExcalidrawContainer();

  const isEditingTextOrNewElement = Boolean(
    appState.editingTextElement || appState.newElement,
  );

  const showLineEditorAction =
    !appState.selectedLinearElement?.isEditing &&
    targetElements.length === 1 &&
    isLinearElement(targetElements[0]) &&
    !isElbowArrow(targetElements[0]);

  return (
    <div className="compact-shape-actions">
      {/* Stroke Color */}
      {canChangeStrokeColor(appState, targetElements) && (
        <div className={clsx("compact-action-item")}>
          {renderAction("changeStrokeColor")}
        </div>
      )}

      {/* Background Color */}
      {canChangeBackgroundColor(appState, targetElements) && (
        <div className="compact-action-item">
          {renderAction("changeBackgroundColor")}
        </div>
      )}

      <CombinedShapeProperties
        appState={appState}
        renderAction={renderAction}
        setAppState={setAppState}
        targetElements={targetElements}
        container={container}
      />

      <CombinedArrowProperties
        appState={appState}
        renderAction={renderAction}
        setAppState={setAppState}
        targetElements={targetElements}
        container={container}
        app={app}
      />
      {/* Linear Editor */}
      {showLineEditorAction && (
        <div className="compact-action-item">
          {renderAction("toggleLinearEditor")}
        </div>
      )}

      {/* Text Properties */}
      {(appState.activeTool.type === "text" ||
        targetElements.some(isTextElement)) && (
        <>
          <div className="compact-action-item">
            {renderAction("changeFontFamily")}
          </div>
          <CombinedTextProperties
            appState={appState}
            renderAction={renderAction}
            setAppState={setAppState}
            targetElements={targetElements}
            container={container}
            elementsMap={elementsMap}
          />
        </>
      )}

      {/* Dedicated Copy Button */}
      {!isEditingTextOrNewElement && targetElements.length > 0 && (
        <div className="compact-action-item">
          {renderAction("duplicateSelection")}
        </div>
      )}

      {/* Dedicated Delete Button */}
      {!isEditingTextOrNewElement && targetElements.length > 0 && (
        <div className="compact-action-item">
          {renderAction("deleteSelectedElements")}
        </div>
      )}

      <CombinedExtraActions
        appState={appState}
        renderAction={renderAction}
        targetElements={targetElements}
        setAppState={setAppState}
        container={container}
        app={app}
      />
    </div>
  );
};

export const MobileShapeActions = ({
  appState,
  elementsMap,
  renderAction,
  app,
  setAppState,
}: {
  appState: UIAppState;
  elementsMap: NonDeletedElementsMap | NonDeletedSceneElementsMap;
  renderAction: ActionManager["renderAction"];
  app: AppClassProperties;
  setAppState: React.Component<any, AppState>["setState"];
}) => {
  const targetElements = getTargetElements(elementsMap, appState);
  const { container } = useExcalidrawContainer();
  const mobileActionsRef = useRef<HTMLDivElement>(null);

  const ACTIONS_WIDTH =
    mobileActionsRef.current?.getBoundingClientRect()?.width ?? 0;

  // 7 actions + 2 for undo/redo
  const MIN_ACTIONS = 9;

  const GAP = 6;
  const WIDTH = 32;

  const MIN_WIDTH = MIN_ACTIONS * WIDTH + (MIN_ACTIONS - 1) * GAP;

  const ADDITIONAL_WIDTH = WIDTH + GAP;

  const showDeleteOutside = ACTIONS_WIDTH >= MIN_WIDTH + ADDITIONAL_WIDTH;
  const showDuplicateOutside =
    ACTIONS_WIDTH >= MIN_WIDTH + 2 * ADDITIONAL_WIDTH;

  return (
    <Island
      className="compact-shape-actions mobile-shape-actions"
      style={{
        flexDirection: "row",
        boxShadow: "none",
        padding: 0,
        zIndex: 2,
        backgroundColor: "transparent",
        height: WIDTH * 1.35,
        marginBottom: 4,
        alignItems: "center",
        gap: GAP,
        pointerEvents: "none",
      }}
      ref={mobileActionsRef}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: GAP,
          flex: 1,
        }}
      >
        {canChangeStrokeColor(appState, targetElements) && (
          <div className={clsx("compact-action-item")}>
            {renderAction("changeStrokeColor")}
          </div>
        )}
        {canChangeBackgroundColor(appState, targetElements) && (
          <div className="compact-action-item">
            {renderAction("changeBackgroundColor")}
          </div>
        )}
        <CombinedShapeProperties
          appState={appState}
          renderAction={renderAction}
          setAppState={setAppState}
          targetElements={targetElements}
          container={container}
        />
        {/* Combined Arrow Properties */}
        <CombinedArrowProperties
          appState={appState}
          renderAction={renderAction}
          setAppState={setAppState}
          targetElements={targetElements}
          container={container}
          app={app}
        />
        {/* Linear Editor */}
        <LinearEditorAction
          appState={appState}
          renderAction={renderAction}
          targetElements={targetElements}
        />
        {/* Text Properties */}
        {(appState.activeTool.type === "text" ||
          targetElements.some(isTextElement)) && (
          <>
            <div className="compact-action-item">
              {renderAction("changeFontFamily")}
            </div>
            <CombinedTextProperties
              appState={appState}
              renderAction={renderAction}
              setAppState={setAppState}
              targetElements={targetElements}
              container={container}
              elementsMap={elementsMap}
            />
          </>
        )}

        {/* Combined Other Actions */}
        <CombinedExtraActions
          appState={appState}
          renderAction={renderAction}
          targetElements={targetElements}
          setAppState={setAppState}
          container={container}
          app={app}
          showDuplicate={!showDuplicateOutside}
          showDelete={!showDeleteOutside}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: GAP,
        }}
      >
        <div className="compact-action-item">{renderAction("undo")}</div>
        <div className="compact-action-item">{renderAction("redo")}</div>
        {showDuplicateOutside && (
          <div className="compact-action-item">
            {renderAction("duplicateSelection")}
          </div>
        )}
        {showDeleteOutside && (
          <div className="compact-action-item">
            {renderAction("deleteSelectedElements")}
          </div>
        )}
      </div>
    </Island>
  );
};

export const ShapesSwitcher = ({
  activeTool,
  setAppState,
  app,
  UIOptions,
  onLockToggle,
}: {
  activeTool: UIAppState["activeTool"];
  setAppState: React.Component<any, AppState>["setState"];
  app: AppClassProperties;
  UIOptions: AppProps["UIOptions"];
  onLockToggle?: () => void;
}) => {
  const stylesPanelMode = useStylesPanelMode();
  const isFullStylesPanel = stylesPanelMode === "full";
  const isCompactStylesPanel = stylesPanelMode === "compact";

  const SELECTION_TOOLS = [
    {
      type: "selection",
      icon: SelectionIcon,
      title: capitalizeString(t("toolBar.selection")),
    },
    {
      type: "lasso",
      icon: LassoIcon,
      title: capitalizeString(t("toolBar.lasso")),
    },
  ] as const;

  const SHAPE_GROUP_TYPES = [
    "rectangle",
    "diamond",
    "ellipse",
    "arrow",
    "line",
  ] as const;

  const SHAPE_GROUP = [
    { type: "ellipse", icon: EllipseIcon, label: t("toolBar.ellipse") },
    { type: "rectangle", icon: RectangleIcon, label: t("toolBar.rectangle") },
    { type: "diamond", icon: DiamondIcon, label: t("toolBar.diamond") },
    { type: "arrow", icon: ArrowIcon, label: t("toolBar.arrow") },
    { type: "line", icon: LineIcon, label: t("toolBar.line") },
  ] as const;

  const [preferredShape, setPreferredShape] = useState<string>("ellipse");

  // Sync preferred shape when active tool changes (e.g. via keyboard shortcut)
  useEffect(() => {
    if ((SHAPE_GROUP_TYPES as readonly string[]).includes(activeTool.type)) {
      setPreferredShape(activeTool.type);
    }
  }, [activeTool.type]);

  // If the active tool is one of the grouped shapes, show that one
  const displayedShape =
    SHAPE_GROUP.find((s) => s.type === activeTool.type) ||
    SHAPE_GROUP.find((s) => s.type === preferredShape) ||
    SHAPE_GROUP[0];

  const INSERT_GROUP = [
    {
      type: "image",
      icon: ImageIcon,
      label: t("toolBar.image"),
      action: () => app.setActiveTool({ type: "image" }),
    },
    {
      type: "video",
      icon: VideoIcon,
      label: t("toolBar.video"),
      action: () => app.setOpenDialog({ name: "videoEmbed" as const }),
    },
    {
      type: "embeddable",
      icon: EmbedIcon,
      label: t("toolBar.embeddable"),
      action: () => app.setActiveTool({ type: "embeddable" }),
    },
    {
      type: "table",
      icon: TableIcon,
      label: t("toolBar.table"),
      action: () => {
        const DEFAULT_CELL_WIDTH = 120;
        const DEFAULT_CELL_HEIGHT = 36;
        const cols = 3;
        const rows = 3;
        const colWidths = Array(cols).fill(DEFAULT_CELL_WIDTH);
        const rowHeights = Array(rows).fill(DEFAULT_CELL_HEIGHT);
        const totalWidth = colWidths.reduce((s: number, w: number) => s + w, 0);
        const totalHeight = rowHeights.reduce(
          (s: number, h: number) => s + h,
          0,
        );

        const viewportCenterX =
          -app.state.scrollX + app.state.width / 2 / app.state.zoom.value;
        const viewportCenterY =
          -app.state.scrollY + app.state.height / 2 / app.state.zoom.value;

        const element = newTableElement({
          x: viewportCenterX - totalWidth / 2,
          y: viewportCenterY - totalHeight / 2,
          rows,
          columns: cols,
          columnWidths: colWidths,
          rowHeights,
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
            openDialog: { name: "tableEditor", elementId: element.id },
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      },
    },
    {
      type: "codeblock",
      icon: CodeBlockIcon,
      label: t("toolBar.codeBlock"),
      action: () => {
        const viewportCenterX =
          -app.state.scrollX + app.state.width / 2 / app.state.zoom.value;
        const viewportCenterY =
          -app.state.scrollY + app.state.height / 2 / app.state.zoom.value;

        const element = newCodeBlockElement({
          x: viewportCenterX - 200,
          y: viewportCenterY - 125,
          code: "",
          language: "plaintext",
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
            openDialog: { name: "codeBlockEditor", elementId: element.id },
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      },
    },
    {
      type: "document",
      icon: DocumentInsertIcon,
      label: t("toolBar.document"),
      action: () => app.setOpenDialog({ name: "documentInsert" as const }),
    },
    {
      type: "projectLink",
      icon: ProjectLinkIcon,
      label: t("toolBar.projectLink"),
      action: () => app.setOpenDialog({ name: "projectLinkCreate" as const }),
    },
  ];

  const [preferredInsert, setPreferredInsert] = useState<string>("image");

  const displayedInsert =
    INSERT_GROUP.find((s) => s.type === activeTool.type) ||
    INSERT_GROUP.find((s) => s.type === preferredInsert) ||
    INSERT_GROUP[0];

  // Track whether we already rendered the shape group (skip duplicates)
  let shapeGroupRendered = false;

  return (
    <>
      {getToolbarTools(app).map(
        ({ value, icon, key, numericKey, fillable }, index) => {
          if (
            UIOptions.tools?.[
              value as Extract<
                typeof value,
                keyof AppProps["UIOptions"]["tools"]
              >
            ] === false
          ) {
            return null;
          }

          // Shape group dropdown (rectangle, diamond, ellipse, line)
          if (
            (SHAPE_GROUP_TYPES as readonly string[]).includes(value) &&
            !isCompactStylesPanel
          ) {
            if (shapeGroupRendered) {
              return null;
            }
            shapeGroupRendered = true;

            const isGroupActive = SHAPE_GROUP_TYPES.includes(
              activeTool.type as any,
            );

            return (
              <div key="shape-group" className="tool-hover-dropdown">
                <ToolButton
                  className={clsx("Shape", { fillable: true })}
                  type="radio"
                  icon={displayedShape.icon}
                  checked={isGroupActive}
                  name="editor-current-shape"
                  title={capitalizeString(displayedShape.label)}
                  aria-label={capitalizeString(displayedShape.label)}
                  data-testid={`toolbar-${displayedShape.type}`}
                  onChange={() => {
                    if (activeTool.type !== displayedShape.type) {
                      trackEvent("toolbar", displayedShape.type, "ui");
                    }
                    app.setActiveTool({ type: displayedShape.type as any });
                  }}
                />
                <div className="tool-hover-dropdown__panel">
                  <div className="tool-hover-dropdown__shapes">
                    {SHAPE_GROUP.filter(
                      (shape) => shape.type !== displayedShape.type,
                    ).map((shape) => (
                      <ToolButton
                        key={shape.type}
                        className={clsx("Shape", {
                          fillable: true,
                          active: activeTool.type === shape.type,
                        })}
                        type="radio"
                        icon={shape.icon}
                        checked={activeTool.type === shape.type}
                        name="shape-group-option"
                        title={capitalizeString(shape.label)}
                        aria-label={capitalizeString(shape.label)}
                        data-testid={`toolbar-shape-${shape.type}`}
                        onChange={() => {
                          if (activeTool.type !== shape.type) {
                            trackEvent("toolbar", shape.type, "ui");
                          }
                          app.setActiveTool({ type: shape.type as any });
                          setPreferredShape(shape.type);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          }

          // Insert group dropdown (image, video, embeddable, document, projectLink)
          if (value === "image" && !isCompactStylesPanel) {
            const isInsertGroupActive = INSERT_GROUP.some(
              (s) => s.type === activeTool.type,
            );

            return (
              <div key="insert-group" className="tool-hover-dropdown">
                <ToolButton
                  className={clsx("Shape", { fillable: false })}
                  type="radio"
                  icon={displayedInsert.icon}
                  checked={isInsertGroupActive}
                  name="editor-current-shape"
                  title={capitalizeString(displayedInsert.label)}
                  aria-label={capitalizeString(displayedInsert.label)}
                  data-testid={`toolbar-${displayedInsert.type}`}
                  onChange={() => {
                    displayedInsert.action();
                    trackEvent("toolbar", displayedInsert.type, "ui");
                  }}
                />
                <div className="tool-hover-dropdown__panel">
                  <div className="tool-hover-dropdown__shapes">
                    {INSERT_GROUP.filter(
                      (item) => item.type !== displayedInsert.type,
                    ).map((item) => (
                      <ToolButton
                        key={item.type}
                        className={clsx("Shape", {
                          active: activeTool.type === item.type,
                        })}
                        type="button"
                        icon={item.icon}
                        name={`insert-group-${item.type}`}
                        title={capitalizeString(item.label)}
                        aria-label={capitalizeString(item.label)}
                        data-testid={`toolbar-insert-${item.type}`}
                        onClick={() => {
                          item.action();
                          setPreferredInsert(item.type);
                          trackEvent("toolbar", item.type, "ui");
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          }

          // Skip eraser in the map — rendered manually after frame
          if (value === "eraser" && !isCompactStylesPanel) {
            return null;
          }

          const label = t(`toolBar.${value}`);
          const letter =
            key && capitalizeString(typeof key === "string" ? key : key[0]);
          const shortcut = letter
            ? `${letter} ${t("helpDialog.or")} ${numericKey}`
            : `${numericKey}`;
          // when in compact styles panel mode (tablet)
          // use a ToolPopover for selection/lasso toggle as well
          if (
            (value === "selection" || value === "lasso") &&
            isCompactStylesPanel
          ) {
            return (
              <ToolPopover
                key={"selection-popover"}
                app={app}
                options={SELECTION_TOOLS}
                activeTool={activeTool}
                defaultOption={app.state.preferredSelectionTool.type}
                namePrefix="selectionType"
                title={capitalizeString(t("toolBar.selection"))}
                data-testid="toolbar-selection"
                onToolChange={(type: string) => {
                  if (type === "selection" || type === "lasso") {
                    app.setActiveTool({ type });
                    setAppState({
                      preferredSelectionTool: { type, initialized: true },
                    });
                  }
                }}
                displayedOption={
                  SELECTION_TOOLS.find(
                    (tool) =>
                      tool.type === app.state.preferredSelectionTool.type,
                  ) || SELECTION_TOOLS[0]
                }
                fillable={activeTool.type === "selection"}
              />
            );
          }

          const toolButton = (
            <ToolButton
              className={clsx("Shape", { fillable })}
              key={value}
              type="radio"
              icon={icon}
              checked={activeTool.type === value}
              name="editor-current-shape"
              title={`${capitalizeString(label)} — ${shortcut}`}
              keyBindingLabel={numericKey || letter}
              aria-label={capitalizeString(label)}
              aria-keyshortcuts={shortcut}
              data-testid={`toolbar-${value}`}
              onPointerDown={({ pointerType }) => {
                if (!app.state.penDetected && pointerType === "pen") {
                  app.togglePenMode(true);
                }

                if (value === "selection") {
                  if (app.state.activeTool.type === "selection") {
                    app.setActiveTool({ type: "lasso" });
                  } else {
                    app.setActiveTool({ type: "selection" });
                  }
                }
              }}
              onChange={({ pointerType }) => {
                if (app.state.activeTool.type !== value) {
                  trackEvent("toolbar", value, "ui");
                }
                if (value === "image") {
                  app.setActiveTool({
                    type: value,
                  });
                } else {
                  app.setActiveTool({ type: value });
                }
              }}
            />
          );

          // Wrap selection tool with hover dropdown containing the lock toggle
          if (
            (value === "selection" || value === "lasso") &&
            !isCompactStylesPanel &&
            onLockToggle
          ) {
            return (
              <div key={value} className="tool-hover-dropdown">
                {toolButton}
                <div className="tool-hover-dropdown__panel">
                  <label
                    className={clsx(
                      "ToolIcon ToolIcon__lock tool-hover-dropdown__lock",
                      {
                        "is-locked": activeTool.locked,
                      },
                    )}
                    title={`${t("toolBar.lock")} — Q`}
                  >
                    <input
                      className="ToolIcon_type_checkbox"
                      type="checkbox"
                      onChange={onLockToggle}
                      checked={activeTool.locked}
                      aria-label={t("toolBar.lock")}
                      data-testid="toolbar-lock"
                    />
                    <div className="ToolIcon__icon">
                      {activeTool.locked ? LockedIcon : UnlockedIcon}
                    </div>
                  </label>
                </div>
              </div>
            );
          }

          return toolButton;
        },
      )}
      {/* Frame tool */}
      <ToolButton
        className="Shape"
        type="radio"
        icon={frameToolIcon}
        checked={activeTool.type === "frame"}
        name="editor-current-shape"
        title={`${capitalizeString(
          t("toolBar.frame"),
        )} — ${KEYS.F.toLocaleUpperCase()}`}
        keyBindingLabel={KEYS.F.toLocaleUpperCase()}
        aria-label={capitalizeString(t("toolBar.frame"))}
        data-testid="toolbar-frame"
        onChange={() => {
          if (app.state.activeTool.type !== "frame") {
            trackEvent("toolbar", "frame", "ui");
          }
          app.setActiveTool({ type: "frame" });
        }}
      />
      {/* Eraser tool */}
      <ToolButton
        className="Shape"
        type="radio"
        icon={EraserIcon}
        checked={activeTool.type === "eraser"}
        name="editor-current-shape"
        title={`${capitalizeString(
          t("toolBar.eraser"),
        )} — ${KEYS.E.toLocaleUpperCase()}`}
        keyBindingLabel={KEYS.E.toLocaleUpperCase()}
        aria-label={capitalizeString(t("toolBar.eraser"))}
        data-testid="toolbar-eraser"
        onChange={() => {
          if (app.state.activeTool.type !== "eraser") {
            trackEvent("toolbar", "eraser", "ui");
          }
          app.setActiveTool({ type: "eraser" });
        }}
      />
      {/* Laser tool */}
      <ToolButton
        className="Shape"
        type="radio"
        icon={laserPointerToolIcon}
        checked={activeTool.type === "laser"}
        name="editor-current-shape"
        title={`${capitalizeString(
          t("toolBar.laser"),
        )} — ${KEYS.K.toLocaleUpperCase()}`}
        keyBindingLabel={KEYS.K.toLocaleUpperCase()}
        aria-label={capitalizeString(t("toolBar.laser"))}
        data-testid="toolbar-laser"
        onChange={() => {
          if (app.state.activeTool.type !== "laser") {
            trackEvent("toolbar", "laser", "ui");
          }
          app.setActiveTool({ type: "laser" });
        }}
      />
    </>
  );
};

export const ZoomActions = ({
  renderAction,
  zoom,
}: {
  renderAction: ActionManager["renderAction"];
  zoom: Zoom;
}) => (
  <Stack.Col gap={1} className={CLASSES.ZOOM_ACTIONS}>
    <Stack.Row align="center">
      {renderAction("zoomOut")}
      {renderAction("resetZoom")}
      {renderAction("zoomIn")}
    </Stack.Row>
  </Stack.Col>
);

export const UndoRedoActions = ({
  renderAction,
  className,
}: {
  renderAction: ActionManager["renderAction"];
  className?: string;
}) => (
  <div className={`undo-redo-buttons ${className}`}>
    <div className="undo-button-container">
      <Tooltip label={t("buttons.undo")}>{renderAction("undo")}</Tooltip>
    </div>
    <div className="redo-button-container">
      <Tooltip label={t("buttons.redo")}> {renderAction("redo")}</Tooltip>
    </div>
  </div>
);

export const ExitZenModeButton = ({
  actionManager,
  showExitZenModeBtn,
}: {
  actionManager: ActionManager;
  showExitZenModeBtn: boolean;
}) => (
  <button
    type="button"
    className={clsx("disable-zen-mode", {
      "disable-zen-mode--visible": showExitZenModeBtn,
    })}
    onClick={() => actionManager.executeAction(actionToggleZenMode)}
  >
    {t("buttons.exitZenMode")}
  </button>
);

export const ExitViewModeButton = ({
  actionManager,
}: {
  actionManager: ActionManager;
}) => (
  <button
    type="button"
    className="disable-view-mode"
    onClick={() => actionManager.executeAction(actionToggleViewMode)}
  >
    {pencilIcon}
  </button>
);
