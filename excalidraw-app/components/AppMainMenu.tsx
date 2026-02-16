import {
  eyeIcon,
  ProjectsIcon,
  PlusIcon,
  TrashIcon,
} from "@excalidraw/excalidraw/components/icons";
import {
  useExcalidrawSetAppState,
  useApp,
} from "@excalidraw/excalidraw/components/App";
import { MainMenu } from "@excalidraw/excalidraw/index";
import React, { useCallback, useState } from "react";
import ConfirmDialog from "@excalidraw/excalidraw/components/ConfirmDialog";

import { CaptureUpdateAction } from "@excalidraw/element";

import {
  isDevEnv,
  DEFAULT_SIDEBAR,
  PROJECTS_SIDEBAR_TAB,
} from "@excalidraw/common";

import { getDefaultAppState } from "@excalidraw/excalidraw/appState";

import type { Theme } from "@excalidraw/element/types";

import { useSetAtom } from "../app-jotai";

import { LanguageList } from "../app-language/LanguageList";
import {
  ProjectManagerData,
  triggerSaveProjectAtom,
  triggerNewProjectAtom,
  previewCacheAtom,
} from "../data/ProjectManagerData";

import { saveDebugState } from "./DebugCanvas";

export const AppMainMenu: React.FC<{
  theme: Theme | "system";
  setTheme: (theme: Theme | "system") => void;
  refresh: () => void;
}> = React.memo((props) => {
  const setAppState = useExcalidrawSetAppState();
  const app = useApp();
  const triggerSave = useSetAtom(triggerSaveProjectAtom);
  const triggerNewProject = useSetAtom(triggerNewProjectAtom);
  const setPreviewCache = useSetAtom(previewCacheAtom);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const handleStartNewProject = useCallback(() => {
    // Open sidebar to Projects tab and trigger the new project flow
    // (which handles unsaved changes, naming, etc.)
    setAppState({
      openSidebar: {
        name: DEFAULT_SIDEBAR.name,
        tab: PROJECTS_SIDEBAR_TAB,
      },
    });
    triggerNewProject((n) => n + 1);
  }, [setAppState, triggerNewProject]);

  const handleSaveProject = useCallback(() => {
    // Open sidebar to Projects tab and trigger save modal
    setAppState({
      openSidebar: {
        name: DEFAULT_SIDEBAR.name,
        tab: PROJECTS_SIDEBAR_TAB,
      },
    });
    // Trigger the save modal in ProjectManager
    triggerSave((n) => n + 1);
  }, [setAppState, triggerSave]);

  const hasCurrentProject = ProjectManagerData.hasCurrentProject();

  const handleOpenProjectFolder = useCallback(async () => {
    const projectId = await ProjectManagerData.getCurrentProjectId();
    if (projectId) {
      fetch(`/api/projects/${projectId}/open-folder`, { method: "POST" });
    }
  }, []);

  const handleResetCanvas = useCallback(async () => {
    ProjectManagerData.beginProjectSwitch();
    try {
      const projectId = await ProjectManagerData.getCurrentProjectId();

      // Clear image cache
      app.imageCache.clear();

      const defaults = getDefaultAppState();

      // Fully replace elements with an empty array so the welcome screen shows
      app.syncActionResult({
        elements: [],
        appState: {
          ...defaults,
          theme: app.state.theme,
          penMode: app.state.penMode,
          penDetected: app.state.penDetected,
          exportBackground: app.state.exportBackground,
          exportEmbedScene: app.state.exportEmbedScene,
          gridSize: app.state.gridSize,
          gridStep: app.state.gridStep,
          gridModeEnabled: app.state.gridModeEnabled,
          gridType: app.state.gridType,
          gridOpacity: app.state.gridOpacity,
          gridMinorOpacity: app.state.gridMinorOpacity,
          objectsSnapModeEnabled: app.state.objectsSnapModeEnabled,
          viewBackgroundColor: app.state.viewBackgroundColor,
          name: app.state.name,
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      // Save the empty scene to disk and clear the preview for the current project
      if (projectId) {
        await fetch(`/api/projects/${projectId}/scene`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "excalidraw",
            version: 2,
            elements: [],
            appState: {
              viewBackgroundColor: app.state.viewBackgroundColor,
              name: app.state.name,
              gridModeEnabled: app.state.gridModeEnabled,
              gridType: app.state.gridType,
              gridOpacity: app.state.gridOpacity,
              gridMinorOpacity: app.state.gridMinorOpacity,
              objectsSnapModeEnabled: app.state.objectsSnapModeEnabled,
            },
            files: {},
          }),
        });

        // Overwrite preview.png with empty data so it 404s/errors
        // and the card falls back to "NO PREVIEW YET"
        await fetch(`/api/projects/${projectId}/preview`, {
          method: "POST",
          body: new Blob([]),
        });

        // Clear the in-memory preview cache entry
        setPreviewCache((prev) => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });

        // Clear hasCustomPreview flag in the index
        const index = await ProjectManagerData.getIndex();
        const updatedIndex = {
          ...index,
          projects: index.projects.map((p) =>
            p.id === projectId
              ? { ...p, hasCustomPreview: false, updatedAt: Date.now() }
              : p,
          ),
        };
        ProjectManagerData.updateCachedIndex(updatedIndex);
        await fetch("/api/projects/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedIndex),
        });
      }
    } finally {
      ProjectManagerData.endProjectSwitch();
    }
    setShowResetDialog(false);
  }, [app]);

  return (
    <>
      <MainMenu>
        <MainMenu.Item icon={ProjectsIcon} onClick={handleSaveProject}>
          Save Project
        </MainMenu.Item>
        {hasCurrentProject && (
          <MainMenu.Item
            icon={ProjectsIcon}
            onClick={handleOpenProjectFolder}
            title="Open the folder on disk where this project is saved"
          >
            Open Project Folder
          </MainMenu.Item>
        )}
        <MainMenu.Item
          icon={PlusIcon}
          onClick={handleStartNewProject}
        >
          Start New Project
        </MainMenu.Item>
        <MainMenu.Separator />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.CommandPalette className="highlighted" />
        <MainMenu.DefaultItems.Help />
        <MainMenu.Item
          icon={TrashIcon}
          onClick={() => setShowResetDialog(true)}
        >
          Reset the current canvas
        </MainMenu.Item>
        {isDevEnv() && (
          <>
            <MainMenu.Separator />
            <MainMenu.Item
              icon={eyeIcon}
              onClick={() => {
                if (window.visualDebug) {
                  delete window.visualDebug;
                  saveDebugState({ enabled: false });
                } else {
                  window.visualDebug = { data: [] };
                  saveDebugState({ enabled: true });
                }
                props?.refresh();
              }}
            >
              Visual Debug
            </MainMenu.Item>
          </>
        )}
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ToggleTheme
          allowSystemTheme
          theme={props.theme}
          onSelect={props.setTheme}
        />
        <MainMenu.ItemCustom>
          <LanguageList style={{ width: "100%" }} />
        </MainMenu.ItemCustom>
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>

      {showResetDialog && (
        <ConfirmDialog
          onConfirm={handleResetCanvas}
          onCancel={() => setShowResetDialog(false)}
          title="Reset the current canvas"
        >
          <p className="clear-canvas__content">
            This will clear all objects from the current canvas, are you sure
            you want to proceed?
          </p>
        </ConfirmDialog>
      )}
    </>
  );
});
