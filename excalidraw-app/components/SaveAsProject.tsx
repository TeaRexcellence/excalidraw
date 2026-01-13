import React from "react";
import { nanoid } from "nanoid";

import { Card } from "@excalidraw/excalidraw/components/Card";
import { ToolButton } from "@excalidraw/excalidraw/components/ToolButton";
import { ProjectsIcon } from "@excalidraw/excalidraw/components/icons";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import {
  DEFAULT_SIDEBAR,
  PROJECTS_SIDEBAR_TAB,
} from "@excalidraw/common";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

// API helper to save project
const saveAsProject = async (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  title: string,
): Promise<string> => {
  const projectId = nanoid(10);

  // Get existing projects index
  const indexRes = await fetch("/api/projects/list");
  const index = indexRes.ok
    ? await indexRes.json()
    : { projects: [], groups: [], currentProjectId: null };

  // Save scene data
  const sceneData = {
    type: "excalidraw",
    version: 2,
    elements,
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      name: title,
    },
    files,
  };

  await fetch(`/api/projects/${projectId}/scene`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sceneData),
  });

  // Add to projects index
  const newProject = {
    id: projectId,
    title,
    groupId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const newIndex = {
    ...index,
    projects: [...index.projects, newProject],
    currentProjectId: projectId,
  };

  await fetch("/api/projects/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newIndex),
  });

  return projectId;
};

export const SaveAsProject: React.FC<{
  elements: readonly NonDeletedExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  name: string;
  onError: (error: Error) => void;
  onSuccess: () => void;
  excalidrawAPI: ExcalidrawImperativeAPI;
}> = ({ elements, appState, files, name, onError, onSuccess, excalidrawAPI }) => {
  const { t } = useI18n();

  return (
    <Card color="primary">
      <div className="Card-icon">{ProjectsIcon}</div>
      <h2>{t("exportDialog.saveAsProject_title")}</h2>
      <div className="Card-details">
        {t("exportDialog.saveAsProject_details")}
      </div>
      <ToolButton
        className="Card-button"
        type="button"
        title={t("exportDialog.saveAsProject_button")}
        aria-label={t("exportDialog.saveAsProject_button")}
        showAriaLabel={true}
        onClick={async () => {
          try {
            const title = name || `Project ${Date.now()}`;
            await saveAsProject(elements, appState, files, title);

            // Open sidebar to Projects tab
            excalidrawAPI.updateScene({
              appState: {
                openSidebar: {
                  name: DEFAULT_SIDEBAR.name,
                  tab: PROJECTS_SIDEBAR_TAB,
                },
              },
            });

            onSuccess();
          } catch (error: any) {
            console.error(error);
            onError(new Error(t("exportDialog.saveAsProject_error")));
          }
        }}
      />
    </Card>
  );
};
