import clsx from "clsx";
import React from "react";

import {
  CLASSES,
  DEFAULT_SIDEBAR,
  TOOL_TYPE,
  arrayToMap,
  capitalizeString,
  easeToValuesRAF,
  isShallowEqual,
} from "@excalidraw/common";

import {
  mutateElement,
  isDocumentElement,
  isImageElement,
} from "@excalidraw/element";

import { showSelectedShapeActions } from "@excalidraw/element";

import { ShapeCache } from "@excalidraw/element";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import {
  actionToggleStats,
  actionToggleGridMode,
  actionToggleObjectsSnapMode,
  actionToggleSearchMenu,
} from "../actions";
import { trackEvent } from "../analytics";
import { isHandToolActive } from "../appState";
import { TunnelsContext, useInitializeTunnels } from "../context/tunnels";
import { UIAppStateContext } from "../context/ui-appState";
import { useAtom, useAtomValue } from "../editor-jotai";

import { t } from "../i18n";
import { calculateScrollCenter, getNormalizedGridStep } from "../scene";
import { centerScrollOn } from "../scene/scroll";
import { getDefaultAppState } from "../appState";

import {
  SelectedShapeActions,
  ShapesSwitcher,
  CompactShapeActions,
} from "./Actions";
import { LoadingMessage } from "./LoadingMessage";
import { MobileMenu } from "./MobileMenu";
import { PasteChartDialog } from "./PasteChartDialog";
import { Section } from "./Section";
import Stack from "./Stack";
import { UserList } from "./UserList";
import Footer from "./footer/Footer";
import { isSidebarDockedAtom, sidebarWidthAtom } from "./Sidebar/Sidebar";
import MainMenu from "./main-menu/MainMenu";
import { ActiveConfirmDialog } from "./ActiveConfirmDialog";
import { useEditorInterface, useStylesPanelMode } from "./App";
import { OverwriteConfirmDialog } from "./OverwriteConfirm/OverwriteConfirm";
import {
  sidebarRightIcon,
  gridIcon,
  dotGridIcon,
  magnetIcon,
  searchIcon,
  axesIcon,
} from "./icons";
import { DefaultSidebar } from "./DefaultSidebar";
import { TTDDialog } from "./TTDDialog/TTDDialog";
import { Stats } from "./Stats";
import ElementLinkDialog from "./ElementLinkDialog";
import { ErrorDialog } from "./ErrorDialog";
import { EyeDropper, activeEyeDropperAtom } from "./EyeDropper";
import { FixedSideContainer } from "./FixedSideContainer";
import { HandButton } from "./HandButton";
import { ToolButton } from "./ToolButton";
import { Switch } from "./Switch";
import { HelpDialog } from "./HelpDialog";
import { HintViewer } from "./HintViewer";
import { ImageExportDialog } from "./ImageExportDialog";
import { Island } from "./Island";
import { JSONExportDialog } from "./JSONExportDialog";
import { LaserPointerButton } from "./LaserPointerButton";
import { VideoEmbedDialog } from "./VideoEmbedDialog";
import { TableEditorModal } from "./TableEditorModal";
import { CodeBlockEditorModal } from "./CodeBlockEditorModal";
import { DocumentInsertDialog } from "./DocumentInsertDialog";
import { DocumentViewerDialog } from "./DocumentViewerDialog";
import { ImageViewerDialog } from "./ImageViewerDialog";
import { ProjectLinkCreateDialog } from "./ProjectLinkCreateDialog";
import { ProjectLinkEditDialog } from "./ProjectLinkEditDialog";
import { SearchMenu } from "./SearchMenu";

import "./LayerUI.scss";
import "./Toolbar.scss";

import type { ActionManager } from "../actions/manager";

import type { Language } from "../i18n";
import type {
  AppProps,
  AppState,
  ExcalidrawProps,
  BinaryFiles,
  UIAppState,
  AppClassProperties,
} from "../types";

interface LayerUIProps {
  actionManager: ActionManager;
  appState: UIAppState;
  files: BinaryFiles;
  canvas: HTMLCanvasElement;
  setAppState: React.Component<any, AppState>["setState"];
  elements: readonly NonDeletedExcalidrawElement[];
  onLockToggle: () => void;
  onHandToolToggle: () => void;
  onPenModeToggle: AppClassProperties["togglePenMode"];
  showExitZenModeBtn: boolean;
  langCode: Language["code"];
  renderTopLeftUI?: ExcalidrawProps["renderTopLeftUI"];
  renderTopRightUI?: ExcalidrawProps["renderTopRightUI"];
  renderCustomStats?: ExcalidrawProps["renderCustomStats"];
  UIOptions: AppProps["UIOptions"];
  onExportImage: AppClassProperties["onExportImage"];
  renderWelcomeScreen: boolean;
  children?: React.ReactNode;
  app: AppClassProperties;
  isCollaborating: boolean;
  generateLinkForSelection?: AppProps["generateLinkForSelection"];
}

const DefaultMainMenu: React.FC<{
  UIOptions: AppProps["UIOptions"];
}> = ({ UIOptions }) => {
  return (
    <MainMenu __fallback>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      {/* FIXME we should to test for this inside the item itself */}
      {UIOptions.canvasActions.export && <MainMenu.DefaultItems.Export />}
      {/* FIXME we should to test for this inside the item itself */}
      {UIOptions.canvasActions.saveAsImage && (
        <MainMenu.DefaultItems.SaveAsImage />
      )}
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
      <MainMenu.Separator />
      <MainMenu.Group title="Excalidraw links">
        <MainMenu.DefaultItems.Socials />
      </MainMenu.Group>
      <MainMenu.Separator />
      <MainMenu.DefaultItems.ToggleTheme />
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
};

const DefaultOverwriteConfirmDialog = () => {
  return (
    <OverwriteConfirmDialog __fallback>
      <OverwriteConfirmDialog.Actions.SaveToDisk />
      <OverwriteConfirmDialog.Actions.ExportToImage />
    </OverwriteConfirmDialog>
  );
};

const GRID_TYPES = [
  { type: "line" as const, icon: gridIcon, label: "labels.lineGrid" as const },
  { type: "dot" as const, icon: dotGridIcon, label: "labels.dotGrid" as const },
];

const GridStepDragInput = ({
  appState,
  setAppState,
  onDragStateChange,
  disabled,
}: {
  appState: UIAppState;
  setAppState: React.Component<any, AppState>["setState"];
  onDragStateChange?: (dragging: boolean) => void;
  disabled?: boolean;
}) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dragStartX = React.useRef(0);
  const dragStartValue = React.useRef(0);
  const isDragging = React.useRef(false);
  const savedGridState = React.useRef<{
    gridModeEnabled: boolean;
    gridOpacity: number;
    gridMinorOpacity: number;
    majorGridEnabled: boolean;
    minorGridEnabled: boolean;
  } | null>(null);

  const commitEdit = React.useCallback(() => {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed)) {
      setAppState({ gridStep: getNormalizedGridStep(parsed) });
    }
    setIsEditing(false);
  }, [editValue, setAppState]);

  const startDrag = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragStartX.current = e.clientX;
      dragStartValue.current = appState.gridStep;
      isDragging.current = false;

      // Save current grid visual state
      savedGridState.current = {
        gridModeEnabled: appState.gridModeEnabled,
        gridOpacity: appState.gridOpacity,
        gridMinorOpacity: appState.gridMinorOpacity,
        majorGridEnabled: appState.majorGridEnabled,
        minorGridEnabled: appState.minorGridEnabled,
      };

      // Force full visibility for preview
      setAppState({
        gridModeEnabled: true,
        gridOpacity: 100,
        gridMinorOpacity: 100,
        majorGridEnabled: true,
        minorGridEnabled: true,
      });

      document.body.classList.add("excalidraw-cursor-resize");
      onDragStateChange?.(true);

      const onPointerMove = (ev: PointerEvent) => {
        isDragging.current = true;
        const dx = ev.clientX - dragStartX.current;
        const units = Math.round(dx / 8);
        let next: number;
        if (ev.shiftKey) {
          next = dragStartValue.current + Math.round(units / 5) * 5;
        } else {
          next = dragStartValue.current + units;
        }
        setAppState({ gridStep: getNormalizedGridStep(next) });
      };

      const onPointerUp = () => {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.body.classList.remove("excalidraw-cursor-resize");

        // Restore saved grid visual state
        if (savedGridState.current) {
          setAppState(savedGridState.current);
          savedGridState.current = null;
        }
        onDragStateChange?.(false);
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    [appState, setAppState, onDragStateChange],
  );

  return (
    <div className={clsx("grid-step-row", {
      "grid-step-row--disabled": disabled,
    })} title="Grid steps">
      {isEditing && !disabled ? (
        <input
          ref={inputRef}
          className="grid-step-row__input grid-step-row__input--editing"
          type="text"
          value={editValue}
          title="Grid steps"
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitEdit();
            } else if (e.key === "Escape") {
              setIsEditing(false);
            }
          }}
          autoFocus
        />
      ) : (
        <input
          className="grid-step-row__input"
          type="text"
          value={appState.gridStep}
          title="Grid steps"
          readOnly
          disabled={disabled}
          onPointerDown={disabled ? undefined : startDrag}
          onClick={disabled ? undefined : (e) => {
            if (!isDragging.current) {
              setEditValue(String(appState.gridStep));
              setIsEditing(true);
            }
          }}
        />
      )}
    </div>
  );
};

const GridTypeDropdown = ({
  appState,
  setAppState,
  actionManager,
}: {
  appState: UIAppState;
  setAppState: React.Component<any, AppState>["setState"];
  actionManager: ActionManager;
}) => {
  const [hiddenDropdown, setHiddenDropdown] = React.useState(false);
  const [isDraggingStep, setIsDraggingStep] = React.useState(false);
  const majorSliderRef = React.useRef<HTMLInputElement>(null);
  const minorSliderRef = React.useRef<HTMLInputElement>(null);

  const gridOpacity = appState.gridOpacity;
  const gridMinorOpacity = appState.gridMinorOpacity;

  React.useEffect(() => {
    if (majorSliderRef.current) {
      majorSliderRef.current.style.background = `linear-gradient(to top, var(--color-slider-track) 0%, var(--color-slider-track) ${gridOpacity}%, var(--button-bg, var(--color-surface-mid)) ${gridOpacity}%, var(--button-bg, var(--color-surface-mid)) 100%)`;
    }
  }, [gridOpacity]);

  React.useEffect(() => {
    if (minorSliderRef.current) {
      minorSliderRef.current.style.background = `linear-gradient(to top, var(--color-slider-track) 0%, var(--color-slider-track) ${gridMinorOpacity}%, var(--button-bg, var(--color-surface-mid)) ${gridMinorOpacity}%, var(--button-bg, var(--color-surface-mid)) 100%)`;
    }
  }, [gridMinorOpacity]);

  const currentType =
    GRID_TYPES.find((g) => g.type === appState.gridType) || GRID_TYPES[0];
  const otherTypes = GRID_TYPES.filter((g) => g.type !== currentType.type);

  return (
    <div
      className={clsx("tool-hover-dropdown", {
        "tool-hover-dropdown--hidden": hiddenDropdown,
      })}
      onMouseLeave={() => {
        if (hiddenDropdown) {
          setHiddenDropdown(false);
        }
      }}
    >
      <ToolButton
        className="Shape"
        type="button"
        icon={currentType.icon}
        selected={appState.gridModeEnabled}
        title={`${t("labels.toggleGrid")} — Ctrl+'`}
        aria-label={t("labels.toggleGrid")}
        data-testid="toolbar-grid"
        onClick={() => {
          actionManager.executeAction(actionToggleGridMode);
        }}
      />
      <div
        className="tool-hover-dropdown__panel"
        style={isDraggingStep ? { opacity: 1, pointerEvents: "auto" } : undefined}
      >
        <div className="tool-hover-dropdown__shapes">
          {otherTypes.map((gridType) => (
            <ToolButton
              key={gridType.type}
              className="Shape"
              type="button"
              icon={gridType.icon}
              name={`grid-type-${gridType.type}`}
              title={t(gridType.label)}
              aria-label={t(gridType.label)}
              data-testid={`toolbar-grid-${gridType.type}`}
              onClick={() => {
                if (appState.gridModeEnabled) {
                  setAppState({ gridType: gridType.type });
                } else {
                  setAppState({
                    gridType: gridType.type,
                    gridModeEnabled: true,
                    objectsSnapModeEnabled: false,
                  });
                }
                setHiddenDropdown(true);
              }}
            />
          ))}
          <div className={clsx("grid-opacity-sliders-row", {
            "grid-opacity-sliders-row--disabled": appState.objectsSnapModeEnabled,
          })}>
            <div
              className={clsx("grid-slider-group", {
                "grid-slider-group--disabled": !appState.majorGridEnabled,
              })}
            >
              <div
                className="grid-opacity-vertical-slider"
                title={t("labels.gridOpacity")}
              >
                <input
                  ref={majorSliderRef}
                  type="range"
                  min="10"
                  max="100"
                  step="10"
                  value={appState.gridOpacity}
                  disabled={appState.objectsSnapModeEnabled}
                  onChange={(e) => {
                    setAppState({ gridOpacity: +e.target.value });
                  }}
                  className="range-input"
                  data-testid="grid-opacity-slider"
                />
              </div>
              <div className="grid-toggle-switch">
                <Switch
                  name="majorGridToggle"
                  checked={appState.majorGridEnabled}
                  title="Toggle major grid visibility"
                  onChange={(checked) => {
                    // If turning major off while minor is also off,
                    // auto-enable minor to avoid empty grid state
                    if (!checked && !appState.minorGridEnabled) {
                      setAppState({ majorGridEnabled: false, minorGridEnabled: true });
                    } else {
                      setAppState({ majorGridEnabled: checked });
                    }
                  }}
                />
              </div>
            </div>
            <div
              className={clsx("grid-slider-group", {
                "grid-slider-group--disabled": !appState.minorGridEnabled,
              })}
            >
              <div
                className="grid-opacity-vertical-slider"
                title={t("labels.gridMinorOpacity")}
              >
                <input
                  ref={minorSliderRef}
                  type="range"
                  min="10"
                  max="100"
                  step="10"
                  value={appState.gridMinorOpacity}
                  disabled={appState.objectsSnapModeEnabled}
                  onChange={(e) => {
                    setAppState({ gridMinorOpacity: +e.target.value });
                  }}
                  className="range-input"
                  data-testid="grid-minor-opacity-slider"
                />
              </div>
              <div className="grid-toggle-switch">
                <Switch
                  name="minorGridToggle"
                  checked={appState.minorGridEnabled}
                  title="Toggle minor grid visibility"
                  onChange={(checked) => {
                    // If turning minor off while major is also off,
                    // auto-enable major to avoid empty grid state
                    if (!checked && !appState.majorGridEnabled) {
                      setAppState({ minorGridEnabled: false, majorGridEnabled: true });
                    } else {
                      setAppState({ minorGridEnabled: checked });
                    }
                  }}
                />
              </div>
            </div>
          </div>
          <GridStepDragInput
            appState={appState}
            setAppState={setAppState}
            onDragStateChange={setIsDraggingStep}
            disabled={appState.objectsSnapModeEnabled}
          />
          <button
            className={clsx("grid-reset-button", {
              "grid-reset-button--disabled": appState.objectsSnapModeEnabled,
            })}
            title="Reset grid to default settings"
            disabled={appState.objectsSnapModeEnabled}
            onClick={() => {
              const defaults = getDefaultAppState();
              setAppState({
                gridStep: defaults.gridStep,
                gridModeEnabled: defaults.gridModeEnabled,
                gridType: defaults.gridType,
                gridOpacity: defaults.gridOpacity,
                gridMinorOpacity: defaults.gridMinorOpacity,
                majorGridEnabled: defaults.majorGridEnabled,
                minorGridEnabled: defaults.minorGridEnabled,
                axesEnabled: defaults.axesEnabled,
                objectsSnapModeEnabled: false,
              });
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

const LayerUI = ({
  actionManager,
  appState,
  files,
  setAppState,
  elements,
  canvas,
  onLockToggle,
  onHandToolToggle,
  onPenModeToggle,
  showExitZenModeBtn,
  renderTopLeftUI,
  renderTopRightUI,
  renderCustomStats,
  UIOptions,
  onExportImage,
  renderWelcomeScreen,
  children,
  app,
  isCollaborating,
  generateLinkForSelection,
}: LayerUIProps) => {
  const editorInterface = useEditorInterface();
  const stylesPanelMode = useStylesPanelMode();
  const isCompactStylesPanel = stylesPanelMode === "compact";
  const tunnels = useInitializeTunnels();
  const cancelScrollAnimRef = React.useRef<(() => void) | null>(null);

  const spacing = isCompactStylesPanel
    ? {
        menuTopGap: 4,
        toolbarColGap: 4,
        toolbarRowGap: 1,
        toolbarInnerRowGap: 0.5,
        islandPadding: 1,
        collabMarginLeft: 8,
      }
    : {
        menuTopGap: 6,
        toolbarColGap: 4,
        toolbarRowGap: 1,
        toolbarInnerRowGap: 1,
        islandPadding: 1,
        collabMarginLeft: 8,
      };

  const TunnelsJotaiProvider = tunnels.tunnelsJotai.Provider;

  const [eyeDropperState, setEyeDropperState] = useAtom(activeEyeDropperAtom);

  const renderJSONExportDialog = () => {
    if (!UIOptions.canvasActions.export) {
      return null;
    }

    return (
      <JSONExportDialog
        elements={elements}
        appState={appState}
        files={files}
        actionManager={actionManager}
        exportOpts={UIOptions.canvasActions.export}
        canvas={canvas}
        setAppState={setAppState}
      />
    );
  };

  const renderImageExportDialog = () => {
    if (
      !UIOptions.canvasActions.saveAsImage ||
      appState.openDialog?.name !== "imageExport"
    ) {
      return null;
    }

    return (
      <ImageExportDialog
        elements={elements}
        appState={appState}
        files={files}
        actionManager={actionManager}
        onExportImage={onExportImage}
        onCloseRequest={() => setAppState({ openDialog: null })}
        name={app.getName()}
      />
    );
  };

  const renderCanvasActions = () => (
    <div style={{ position: "relative" }}>
      {/* wrapping to Fragment stops React from occasionally complaining
                about identical Keys */}
      <tunnels.MainMenuTunnel.Out />
      {renderWelcomeScreen && <tunnels.WelcomeScreenMenuHintTunnel.Out />}
    </div>
  );

  const renderSelectedShapeActions = () => {
    const isCompactMode = isCompactStylesPanel;

    return (
      <Section
        heading="selectedShapeActions"
        className={clsx("selected-shape-actions zen-mode-transition", {
          "transition-left": appState.zenModeEnabled,
        })}
      >
        {isCompactMode ? (
          <Island
            className={clsx("compact-shape-actions-island")}
            padding={0}
            style={{
              // we want to make sure this doesn't overflow so subtracting the
              // approximate height of hamburgerMenu + footer
              maxHeight: `${appState.height - 166}px`,
            }}
          >
            <CompactShapeActions
              appState={appState}
              elementsMap={app.scene.getNonDeletedElementsMap()}
              renderAction={actionManager.renderAction}
              app={app}
              setAppState={setAppState}
            />
          </Island>
        ) : (
          <Island
            className={CLASSES.SHAPE_ACTIONS_MENU}
            padding={2}
            style={{
              // we want to make sure this doesn't overflow so subtracting the
              // approximate height of hamburgerMenu + footer
              maxHeight: `${appState.height - 166}px`,
            }}
          >
            <SelectedShapeActions
              appState={appState}
              elementsMap={app.scene.getNonDeletedElementsMap()}
              renderAction={actionManager.renderAction}
              app={app}
            />
          </Island>
        )}
      </Section>
    );
  };

  const renderFixedSideContainer = () => {
    const shouldRenderSelectedShapeActions = showSelectedShapeActions(
      appState,
      elements,
    );

    const shouldShowStats =
      appState.stats.open &&
      !appState.zenModeEnabled &&
      !appState.viewModeEnabled &&
      appState.openDialog?.name !== "elementLinkSelector";

    return (
      <FixedSideContainer side="top">
        <div className="App-menu App-menu_top">
          <Stack.Col
            gap={spacing.menuTopGap}
            className={clsx("App-menu_top__left")}
          >
            {renderCanvasActions()}
            <div
              className={clsx("selected-shape-actions-container", {
                "selected-shape-actions-container--compact":
                  isCompactStylesPanel,
              })}
            >
              {shouldRenderSelectedShapeActions && renderSelectedShapeActions()}
            </div>
          </Stack.Col>
          {!appState.viewModeEnabled &&
            appState.openDialog?.name !== "elementLinkSelector" && (
              <Section heading="shapes" className="shapes-section">
                {(heading: React.ReactNode) => (
                  <div style={{ position: "relative" }}>
                    {renderWelcomeScreen && (
                      <tunnels.WelcomeScreenToolbarHintTunnel.Out />
                    )}
                    <Stack.Col gap={spacing.toolbarColGap} align="start">
                      <Stack.Row
                        gap={spacing.toolbarRowGap}
                        className={clsx("App-toolbar-container", {
                          "zen-mode": appState.zenModeEnabled,
                        })}
                      >
                        <Island
                          padding={spacing.islandPadding}
                          className={clsx("App-toolbar", {
                            "zen-mode": appState.zenModeEnabled,
                            "App-toolbar--compact": isCompactStylesPanel,
                          })}
                        >
                          {heading}
                          <Stack.Row gap={spacing.toolbarInnerRowGap}>
                            <HandButton
                              checked={isHandToolActive(appState)}
                              onChange={() => onHandToolToggle()}
                              title={t("toolBar.hand")}
                              isMobile
                            />

                            <ShapesSwitcher
                              setAppState={setAppState}
                              activeTool={appState.activeTool}
                              UIOptions={UIOptions}
                              app={app}
                              onLockToggle={onLockToggle}
                            />
                          </Stack.Row>
                        </Island>
                        <Island
                          padding={spacing.islandPadding}
                          className={clsx("App-toolbar", {
                            "zen-mode": appState.zenModeEnabled,
                          })}
                        >
                          <Stack.Row gap={spacing.toolbarInnerRowGap}>
                            <ToolButton
                              className="Shape"
                              type="button"
                              icon={axesIcon}
                              selected={appState.axesEnabled}
                              title="Toggle coordinate axes"
                              aria-label="Toggle coordinate axes"
                              data-testid="toolbar-axes"
                              onClick={() => {
                                if (!appState.axesEnabled) {
                                  setAppState({ axesEnabled: true });
                                  const target = centerScrollOn({
                                    scenePoint: { x: 0, y: 0 },
                                    viewportDimensions: {
                                      width: app.state.width,
                                      height: app.state.height,
                                    },
                                    zoom: app.state.zoom,
                                  });
                                  cancelScrollAnimRef.current?.();
                                  cancelScrollAnimRef.current =
                                    easeToValuesRAF({
                                      fromValues: {
                                        scrollX: app.state.scrollX,
                                        scrollY: app.state.scrollY,
                                      },
                                      toValues: target,
                                      onStep: (values) => {
                                        setAppState({
                                          scrollX: values.scrollX,
                                          scrollY: values.scrollY,
                                        });
                                      },
                                      duration: 500,
                                      onEnd: () => {
                                        cancelScrollAnimRef.current = null;
                                      },
                                    });
                                } else {
                                  setAppState({ axesEnabled: false });
                                }
                              }}
                            />
                            <GridTypeDropdown
                              appState={appState}
                              setAppState={setAppState}
                              actionManager={actionManager}
                            />
                            <ToolButton
                              className="Shape"
                              type="button"
                              icon={magnetIcon}
                              selected={appState.objectsSnapModeEnabled}
                              title={`${t("buttons.objectsSnapMode")} — Alt+S`}
                              aria-label={t("buttons.objectsSnapMode")}
                              data-testid="toolbar-snap"
                              onClick={() => {
                                actionManager.executeAction(
                                  actionToggleObjectsSnapMode,
                                );
                              }}
                            />
                            <ToolButton
                              className="Shape"
                              type="button"
                              icon={searchIcon}
                              selected={
                                appState.openDialog?.name === "searchMenu"
                              }
                              title={`${t("search.title")} — Ctrl+F`}
                              aria-label={t("search.title")}
                              data-testid="toolbar-search"
                              onClick={() => {
                                actionManager.executeAction(
                                  actionToggleSearchMenu,
                                );
                              }}
                            />
                          </Stack.Row>
                        </Island>
                        {isCollaborating && (
                          <Island
                            style={{
                              marginLeft: spacing.collabMarginLeft,
                              alignSelf: "center",
                              height: "fit-content",
                            }}
                          >
                            <LaserPointerButton
                              title={t("toolBar.laser")}
                              checked={
                                appState.activeTool.type === TOOL_TYPE.laser
                              }
                              onChange={() =>
                                app.setActiveTool({ type: TOOL_TYPE.laser })
                              }
                              isMobile
                            />
                          </Island>
                        )}
                      </Stack.Row>
                    </Stack.Col>
                    <HintViewer
                      appState={appState}
                      isMobile={editorInterface.formFactor === "phone"}
                      editorInterface={editorInterface}
                      app={app}
                    />
                  </div>
                )}
              </Section>
            )}
          <div
            className={clsx(
              "layer-ui__wrapper__top-right zen-mode-transition",
              {
                "transition-right": appState.zenModeEnabled,
                "layer-ui__wrapper__top-right--compact": isCompactStylesPanel,
              },
            )}
          >
            {appState.collaborators.size > 0 && (
              <UserList
                collaborators={appState.collaborators}
                userToFollow={appState.userToFollow?.socketId || null}
              />
            )}
            {renderTopRightUI?.(
              editorInterface.formFactor === "phone",
              appState,
            )}
            {!appState.viewModeEnabled &&
              appState.openDialog?.name !== "elementLinkSelector" &&
              // hide button when sidebar docked
              (!isSidebarDocked ||
                appState.openSidebar?.name !== DEFAULT_SIDEBAR.name) && (
                <tunnels.DefaultSidebarTriggerTunnel.Out />
              )}
            {shouldShowStats && (
              <Stats
                app={app}
                onClose={() => {
                  actionManager.executeAction(actionToggleStats);
                }}
                renderCustomStats={renderCustomStats}
              />
            )}
          </div>
        </div>
      </FixedSideContainer>
    );
  };

  const renderSidebars = () => {
    return (
      <DefaultSidebar
        __fallback
        onDock={(docked) => {
          trackEvent(
            "sidebar",
            `toggleDock (${docked ? "dock" : "undock"})`,
            `(${
              editorInterface.formFactor === "phone" ? "mobile" : "desktop"
            })`,
          );
        }}
      />
    );
  };

  const isSidebarDocked = useAtomValue(isSidebarDockedAtom);
  const sidebarWidth = useAtomValue(sidebarWidthAtom);

  const layerUIJSX = (
    <>
      {/* ------------------------- tunneled UI ---------------------------- */}
      {/* make sure we render host app components first so that we can detect
          them first on initial render to optimize layout shift */}
      {children}
      {/* render component fallbacks. Can be rendered anywhere as they'll be
          tunneled away. We only render tunneled components that actually
        have defaults when host do not render anything. */}
      <DefaultMainMenu UIOptions={UIOptions} />
      <DefaultSidebar.Trigger
        __fallback
        icon={sidebarRightIcon}
        title={capitalizeString(t("toolBar.library"))}
        onToggle={(open) => {
          if (open) {
            trackEvent(
              "sidebar",
              `${DEFAULT_SIDEBAR.name} (open)`,
              `button (${
                editorInterface.formFactor === "phone" ? "mobile" : "desktop"
              })`,
            );
          }
        }}
        tab={DEFAULT_SIDEBAR.defaultTab}
      />
      <DefaultOverwriteConfirmDialog />
      {appState.openDialog?.name === "ttd" && <TTDDialog __fallback />}
      {/* ------------------------------------------------------------------ */}

      {appState.isLoading && <LoadingMessage delay={250} />}
      {appState.errorMessage && (
        <ErrorDialog onClose={() => setAppState({ errorMessage: null })}>
          {appState.errorMessage}
        </ErrorDialog>
      )}
      {eyeDropperState && editorInterface.formFactor !== "phone" && (
        <EyeDropper
          colorPickerType={eyeDropperState.colorPickerType}
          onCancel={() => {
            setEyeDropperState(null);
          }}
          onChange={(colorPickerType, color, selectedElements, { altKey }) => {
            if (
              colorPickerType !== "elementBackground" &&
              colorPickerType !== "elementStroke"
            ) {
              return;
            }

            if (selectedElements.length) {
              for (const element of selectedElements) {
                mutateElement(element, arrayToMap(elements), {
                  [altKey && eyeDropperState.swapPreviewOnAlt
                    ? colorPickerType === "elementBackground"
                      ? "strokeColor"
                      : "backgroundColor"
                    : colorPickerType === "elementBackground"
                    ? "backgroundColor"
                    : "strokeColor"]: color,
                });
                ShapeCache.delete(element);
              }
              app.scene.triggerUpdate();
            } else if (colorPickerType === "elementBackground") {
              setAppState({
                currentItemBackgroundColor: color,
              });
            } else {
              setAppState({ currentItemStrokeColor: color });
            }
          }}
          onSelect={(color, event) => {
            setEyeDropperState((state) => {
              return state?.keepOpenOnAlt && event.altKey ? state : null;
            });
            eyeDropperState?.onSelect?.(color, event);
          }}
        />
      )}
      {appState.openDialog?.name === "help" && (
        <HelpDialog
          onClose={() => {
            setAppState({ openDialog: null });
          }}
        />
      )}
      {appState.openDialog?.name === "videoEmbed" && (
        <VideoEmbedDialog
          onClose={() => {
            setAppState({ openDialog: null });
          }}
        />
      )}
      {appState.openDialog?.name === "tableEditor" && (
        <TableEditorModal
          elementId={appState.openDialog.elementId}
          onClose={() => {
            setAppState({ openDialog: null });
          }}
        />
      )}
      {appState.openDialog?.name === "codeBlockEditor" && (
        <CodeBlockEditorModal
          elementId={appState.openDialog.elementId}
          onClose={() => {
            setAppState({ openDialog: null });
          }}
        />
      )}
      {appState.openDialog?.name === "documentInsert" && (
        <DocumentInsertDialog
          onClose={() => {
            setAppState({ openDialog: null });
          }}
        />
      )}
      {appState.openDialog?.name === "projectLinkCreate" && (
        <ProjectLinkCreateDialog
          onClose={() => {
            setAppState({ openDialog: null });
          }}
        />
      )}
      {appState.openDialog?.name === "projectLinkEdit" && (
        <ProjectLinkEditDialog
          elementId={(appState.openDialog as any).elementId}
          onClose={() => {
            setAppState({ openDialog: null });
          }}
        />
      )}
      {appState.openDialog?.name === "documentViewer" &&
        (() => {
          const docElement = app.scene
            .getElementsIncludingDeleted()
            .find(
              (el) =>
                el.id === (appState.openDialog as any).documentId &&
                isDocumentElement(el),
            );
          if (!docElement || !isDocumentElement(docElement)) {
            return null;
          }
          return (
            <DocumentViewerDialog
              element={docElement}
              onClose={() => {
                setAppState({ openDialog: null });
              }}
            />
          );
        })()}
      {appState.openDialog?.name === "imageViewer" &&
        (() => {
          const imgElement = app.scene
            .getElementsIncludingDeleted()
            .find(
              (el) =>
                el.id === (appState.openDialog as any).imageElementId &&
                isImageElement(el),
            );
          if (!imgElement || !isImageElement(imgElement)) {
            return null;
          }
          return (
            <ImageViewerDialog
              imageElementId={imgElement.id}
              onClose={() => {
                setAppState({ openDialog: null });
              }}
            />
          );
        })()}
      {appState.openDialog?.name === "searchMenu" && (
        <SearchMenu
          onClose={() => {
            setAppState({ openDialog: null });
          }}
        />
      )}
      <ActiveConfirmDialog />
      {appState.openDialog?.name === "elementLinkSelector" && (
        <ElementLinkDialog
          sourceElementId={appState.openDialog.sourceElementId}
          onClose={() => {
            setAppState({
              openDialog: null,
            });
          }}
          scene={app.scene}
          appState={appState}
          setAppState={setAppState}
          generateLinkForSelection={generateLinkForSelection}
        />
      )}
      <tunnels.OverwriteConfirmDialogTunnel.Out />
      {renderImageExportDialog()}
      {renderJSONExportDialog()}
      {appState.pasteDialog.shown && (
        <PasteChartDialog
          setAppState={setAppState}
          appState={appState}
          onClose={() =>
            setAppState({
              pasteDialog: { shown: false, data: null },
            })
          }
        />
      )}
      {editorInterface.formFactor === "phone" && (
        <MobileMenu
          app={app}
          appState={appState}
          elements={elements}
          actionManager={actionManager}
          renderJSONExportDialog={renderJSONExportDialog}
          renderImageExportDialog={renderImageExportDialog}
          setAppState={setAppState}
          onHandToolToggle={onHandToolToggle}
          onPenModeToggle={onPenModeToggle}
          renderTopLeftUI={renderTopLeftUI}
          renderTopRightUI={renderTopRightUI}
          renderSidebars={renderSidebars}
          renderWelcomeScreen={renderWelcomeScreen}
          UIOptions={UIOptions}
        />
      )}
      {editorInterface.formFactor !== "phone" && (
        <>
          <div
            className="layer-ui__wrapper"
          >
            {renderWelcomeScreen && <tunnels.WelcomeScreenCenterTunnel.Out />}
            {renderFixedSideContainer()}
            <Footer
              appState={appState}
              actionManager={actionManager}
              showExitZenModeBtn={showExitZenModeBtn}
              renderWelcomeScreen={renderWelcomeScreen}
            />
            {(() => {
              const showBackToContent = appState.scrolledOutside;
              const showBackToCenter =
                appState.axesEnabled && appState.originOutsideViewport;
              if (!showBackToContent && !showBackToCenter) {
                return null;
              }
              return (
                <div className="scroll-back-buttons">
                  {showBackToContent && (
                    <button
                      type="button"
                      className="scroll-back-to-content"
                      onClick={() => {
                        const target = calculateScrollCenter(
                          elements,
                          app.state,
                        );
                        cancelScrollAnimRef.current?.();
                        cancelScrollAnimRef.current = easeToValuesRAF({
                          fromValues: {
                            scrollX: app.state.scrollX,
                            scrollY: app.state.scrollY,
                          },
                          toValues: target,
                          onStep: (values) => {
                            setAppState({
                              scrollX: values.scrollX,
                              scrollY: values.scrollY,
                            });
                          },
                          duration: 500,
                          onEnd: () => {
                            cancelScrollAnimRef.current = null;
                          },
                        });
                      }}
                    >
                      {t("buttons.scrollBackToContent")}
                    </button>
                  )}
                  {showBackToCenter && (
                    <button
                      type="button"
                      className="scroll-back-to-content"
                      onClick={() => {
                        const target = centerScrollOn({
                          scenePoint: { x: 0, y: 0 },
                          viewportDimensions: {
                            width: app.state.width,
                            height: app.state.height,
                          },
                          zoom: app.state.zoom,
                        });
                        cancelScrollAnimRef.current?.();
                        cancelScrollAnimRef.current = easeToValuesRAF({
                          fromValues: {
                            scrollX: app.state.scrollX,
                            scrollY: app.state.scrollY,
                          },
                          toValues: target,
                          onStep: (values) => {
                            setAppState({
                              scrollX: values.scrollX,
                              scrollY: values.scrollY,
                            });
                          },
                          duration: 500,
                          onEnd: () => {
                            cancelScrollAnimRef.current = null;
                          },
                        });
                      }}
                    >
                      Scroll back to center
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
          {renderSidebars()}
        </>
      )}
    </>
  );

  return (
    <UIAppStateContext.Provider value={appState}>
      <TunnelsJotaiProvider>
        <TunnelsContext.Provider value={tunnels}>
          {layerUIJSX}
        </TunnelsContext.Provider>
      </TunnelsJotaiProvider>
    </UIAppStateContext.Provider>
  );
};

const stripIrrelevantAppStateProps = (appState: AppState): UIAppState => {
  const { startBoundElement, cursorButton, scrollX, scrollY, ...ret } =
    appState;
  return ret;
};

const areEqual = (prevProps: LayerUIProps, nextProps: LayerUIProps) => {
  // short-circuit early
  if (prevProps.children !== nextProps.children) {
    return false;
  }

  const { canvas: _pC, appState: prevAppState, ...prev } = prevProps;
  const { canvas: _nC, appState: nextAppState, ...next } = nextProps;

  return (
    isShallowEqual(
      // asserting AppState because we're being passed the whole AppState
      // but resolve to only the UI-relevant props
      stripIrrelevantAppStateProps(prevAppState as AppState),
      stripIrrelevantAppStateProps(nextAppState as AppState),
      {
        selectedElementIds: isShallowEqual,
        selectedGroupIds: isShallowEqual,
      },
    ) && isShallowEqual(prev, next)
  );
};

export default React.memo(LayerUI, areEqual);
