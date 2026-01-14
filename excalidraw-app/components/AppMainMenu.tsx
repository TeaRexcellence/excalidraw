import { eyeIcon, ProjectsIcon } from "@excalidraw/excalidraw/components/icons";
import { useExcalidrawSetAppState } from "@excalidraw/excalidraw/components/App";
import { MainMenu } from "@excalidraw/excalidraw/index";
import React, { useCallback } from "react";
import { useSetAtom } from "jotai";

import { isDevEnv, DEFAULT_SIDEBAR, PROJECTS_SIDEBAR_TAB } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";

import { LanguageList } from "../app-language/LanguageList";
import { ProjectManagerData, triggerSaveProjectAtom } from "../data/ProjectManagerData";

import { saveDebugState } from "./DebugCanvas";

export const AppMainMenu: React.FC<{
  theme: Theme | "system";
  setTheme: (theme: Theme | "system") => void;
  refresh: () => void;
}> = React.memo((props) => {
  const setAppState = useExcalidrawSetAppState();
  const triggerSave = useSetAtom(triggerSaveProjectAtom);

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

  const handleOpenProjectFolder = useCallback(async () => {
    const projectId = await ProjectManagerData.getCurrentProjectId();
    if (projectId) {
      fetch(`/api/projects/${projectId}/open-folder`, { method: "POST" });
    } else {
      // No project - open sidebar so they can save first
      setAppState({
        openSidebar: {
          name: DEFAULT_SIDEBAR.name,
          tab: PROJECTS_SIDEBAR_TAB,
        },
      });
    }
  }, [setAppState]);

  return (
    <MainMenu>
      <MainMenu.Item icon={ProjectsIcon} onClick={handleSaveProject}>
        Save Project
      </MainMenu.Item>
      <MainMenu.Item icon={ProjectsIcon} onClick={handleOpenProjectFolder}>
        Open Project Folder
      </MainMenu.Item>
      <MainMenu.Separator />
      <MainMenu.DefaultItems.SaveAsImage />
      <MainMenu.DefaultItems.CommandPalette className="highlighted" />
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      <MainMenu.DefaultItems.ClearCanvas />
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
  );
});
