import React, { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";

import { CaptureUpdateAction } from "@excalidraw/element";

import { t } from "../../i18n";
import { useApp } from "../App";

import { ProjectGroup } from "./ProjectGroup";
import type { Project, ProjectGroup as ProjectGroupType, ProjectsIndex } from "./types";
import { DEFAULT_PROJECTS_INDEX } from "./types";

import "./ProjectManager.scss";

const MIN_CARD_SIZE = 100;
const MAX_CARD_SIZE = 300;
const DEFAULT_CARD_SIZE = 150;
const CARD_SIZE_STEP = 25;

// API helpers
const api = {
  async getIndex(): Promise<ProjectsIndex> {
    try {
      const res = await fetch("/api/projects/list");
      if (!res.ok) {
        throw new Error("Failed to fetch projects");
      }
      return res.json();
    } catch {
      return DEFAULT_PROJECTS_INDEX;
    }
  },

  async saveIndex(index: ProjectsIndex): Promise<void> {
    await fetch("/api/projects/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(index),
    });
  },

  async getScene(projectId: string): Promise<any | null> {
    try {
      const res = await fetch(`/api/projects/${projectId}/scene`);
      if (!res.ok) {
        return null;
      }
      return res.json();
    } catch {
      return null;
    }
  },

  async saveScene(projectId: string, sceneData: any): Promise<void> {
    await fetch(`/api/projects/${projectId}/scene`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sceneData),
    });
  },

  async savePreview(projectId: string, blob: Blob): Promise<string> {
    const res = await fetch(`/api/projects/${projectId}/preview`, {
      method: "POST",
      body: blob,
    });
    const data = await res.json();
    return data.url;
  },

  async deleteProject(projectId: string): Promise<void> {
    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
  },
};

export const ProjectManager: React.FC = () => {
  const app = useApp();
  const [index, setIndex] = useState<ProjectsIndex>(DEFAULT_PROJECTS_INDEX);
  const [cardSize, setCardSize] = useState(DEFAULT_CARD_SIZE);
  const [isLoading, setIsLoading] = useState(true);
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({});

  // Load projects on mount
  useEffect(() => {
    api.getIndex().then((data) => {
      setIndex(data);
      setIsLoading(false);
    });
  }, []);

  // Get preview URL for a project
  const getPreviewUrl = useCallback(
    (projectId: string): string | null => {
      if (previewCache[projectId]) {
        return previewCache[projectId];
      }
      // Return the static URL path - browser will cache it
      return `/projects/${projectId}/preview.png`;
    },
    [previewCache],
  );

  // Generate preview for current scene using the static canvas
  const generatePreview = useCallback(async (): Promise<Blob | null> => {
    try {
      const elements = app.scene.getNonDeletedElements();
      if (elements.length === 0) {
        return null;
      }

      // Use the existing canvas and create a scaled preview
      const canvas = app.canvas;
      if (!canvas) {
        return null;
      }

      // Create a smaller canvas for the preview
      const previewCanvas = document.createElement("canvas");
      const maxSize = 300;
      const scale = Math.min(maxSize / canvas.width, maxSize / canvas.height, 1);
      previewCanvas.width = canvas.width * scale;
      previewCanvas.height = canvas.height * scale;

      const ctx = previewCanvas.getContext("2d");
      if (!ctx) {
        return null;
      }

      ctx.scale(scale, scale);
      ctx.drawImage(canvas, 0, 0);

      return new Promise((resolve) => {
        previewCanvas.toBlob((blob) => resolve(blob), "image/png", 0.8);
      });
    } catch (err) {
      console.error("Failed to generate preview:", err);
      return null;
    }
  }, [app]);

  // Save current project
  const saveCurrentProject = useCallback(
    async (projectId: string) => {
      const elements = app.scene.getElementsIncludingDeleted();
      const appState = app.state;
      const files = app.files;

      const sceneData = {
        type: "excalidraw",
        version: 2,
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          zoom: appState.zoom,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          name: appState.name,
        },
        files,
      };

      await api.saveScene(projectId, sceneData);

      // Generate and save preview
      const previewBlob = await generatePreview();
      if (previewBlob) {
        const previewUrl = await api.savePreview(projectId, previewBlob);
        setPreviewCache((prev) => ({
          ...prev,
          [projectId]: previewUrl + "?t=" + Date.now(),
        }));
      }
    },
    [app, generatePreview],
  );

  // Create new project with blank canvas
  const handleNewProject = useCallback(async () => {
    // First, save current project if there is one
    if (index.currentProjectId) {
      await saveCurrentProject(index.currentProjectId);
    }

    const projectId = nanoid(10);
    const title = `Project ${index.projects.length + 1}`;

    const newProject: Project = {
      id: projectId,
      title,
      groupId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const newIndex: ProjectsIndex = {
      ...index,
      projects: [...index.projects, newProject],
      currentProjectId: projectId,
    };

    // Clear the canvas to start fresh
    app.syncActionResult({
      elements: [],
      appState: {
        name: title,
        viewBackgroundColor: app.state.viewBackgroundColor,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    // Save the blank project
    await api.saveScene(projectId, {
      type: "excalidraw",
      version: 2,
      elements: [],
      appState: {
        viewBackgroundColor: app.state.viewBackgroundColor,
        name: title,
      },
      files: {},
    });

    setIndex(newIndex);
    await api.saveIndex(newIndex);
  }, [app, index, saveCurrentProject]);

  // Create new group
  const handleNewGroup = useCallback(async () => {
    const groupId = nanoid(10);
    const name = `Group ${index.groups.length + 1}`;

    const newGroup: ProjectGroupType = {
      id: groupId,
      name,
      order: index.groups.length,
      expanded: true,
    };

    const newIndex: ProjectsIndex = {
      ...index,
      groups: [...index.groups, newGroup],
    };

    setIndex(newIndex);
    await api.saveIndex(newIndex);
  }, [index]);

  // Select/switch to a project
  const handleSelectProject = useCallback(
    async (projectId: string) => {
      if (projectId === index.currentProjectId) {
        return;
      }

      // Auto-save current project first
      if (index.currentProjectId) {
        await saveCurrentProject(index.currentProjectId);
      }

      // Load the new project
      const sceneData = await api.getScene(projectId);
      if (sceneData) {
        // Use syncActionResult to update the scene
        app.syncActionResult({
          elements: sceneData.elements || [],
          appState: {
            ...sceneData.appState,
            name: index.projects.find((p) => p.id === projectId)?.title,
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });

        // Load files if present
        if (sceneData.files) {
          const filesArray = Object.entries(sceneData.files).map(
            ([id, file]: [string, any]) => ({ ...file, id }),
          );
          if (filesArray.length > 0) {
            app.addFiles(filesArray);
          }
        }
      }

      // Update current project ID
      const newIndex: ProjectsIndex = {
        ...index,
        currentProjectId: projectId,
        projects: index.projects.map((p) =>
          p.id === projectId ? { ...p, updatedAt: Date.now() } : p,
        ),
      };
      setIndex(newIndex);
      await api.saveIndex(newIndex);
    },
    [app, index, saveCurrentProject],
  );

  // Open project in new tab
  const handleOpenInNewTab = useCallback(
    async (projectId: string) => {
      // Save current project first
      if (index.currentProjectId) {
        await saveCurrentProject(index.currentProjectId);
      }

      // Open in new tab with project ID in hash
      window.open(`${window.location.origin}#project=${projectId}`, "_blank");
    },
    [index.currentProjectId, saveCurrentProject],
  );

  // Rename project
  const handleRenameProject = useCallback(
    async (projectId: string, newTitle: string) => {
      const newIndex: ProjectsIndex = {
        ...index,
        projects: index.projects.map((p) =>
          p.id === projectId ? { ...p, title: newTitle, updatedAt: Date.now() } : p,
        ),
      };
      setIndex(newIndex);
      await api.saveIndex(newIndex);
    },
    [index],
  );

  // Delete project
  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      await api.deleteProject(projectId);

      const newIndex: ProjectsIndex = {
        ...index,
        projects: index.projects.filter((p) => p.id !== projectId),
        currentProjectId:
          index.currentProjectId === projectId ? null : index.currentProjectId,
      };
      setIndex(newIndex);
      await api.saveIndex(newIndex);
    },
    [index],
  );

  // Move project to group
  const handleMoveToGroup = useCallback(
    async (projectId: string, groupId: string | null) => {
      const newIndex: ProjectsIndex = {
        ...index,
        projects: index.projects.map((p) =>
          p.id === projectId ? { ...p, groupId, updatedAt: Date.now() } : p,
        ),
      };
      setIndex(newIndex);
      await api.saveIndex(newIndex);
    },
    [index],
  );

  // Toggle group expanded state
  const handleToggleExpand = useCallback(
    async (groupId: string) => {
      const newIndex: ProjectsIndex = {
        ...index,
        groups: index.groups.map((g) =>
          g.id === groupId ? { ...g, expanded: !g.expanded } : g,
        ),
      };
      setIndex(newIndex);
      await api.saveIndex(newIndex);
    },
    [index],
  );

  // Rename group
  const handleRenameGroup = useCallback(
    async (groupId: string, newName: string) => {
      const newIndex: ProjectsIndex = {
        ...index,
        groups: index.groups.map((g) =>
          g.id === groupId ? { ...g, name: newName } : g,
        ),
      };
      setIndex(newIndex);
      await api.saveIndex(newIndex);
    },
    [index],
  );

  // Delete group (move projects to ungrouped)
  const handleDeleteGroup = useCallback(
    async (groupId: string) => {
      const newIndex: ProjectsIndex = {
        ...index,
        groups: index.groups.filter((g) => g.id !== groupId),
        projects: index.projects.map((p) =>
          p.groupId === groupId ? { ...p, groupId: null } : p,
        ),
      };
      setIndex(newIndex);
      await api.saveIndex(newIndex);
    },
    [index],
  );

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setCardSize((prev) => Math.min(prev + CARD_SIZE_STEP, MAX_CARD_SIZE));
  }, []);

  const handleZoomOut = useCallback(() => {
    setCardSize((prev) => Math.max(prev - CARD_SIZE_STEP, MIN_CARD_SIZE));
  }, []);

  // Group projects
  const ungroupedProjects = index.projects.filter((p) => p.groupId === null);
  const availableGroups = index.groups.map((g) => ({ id: g.id, name: g.name }));

  if (isLoading) {
    return (
      <div className="ProjectManager ProjectManager--loading">
        <span>Loading projects...</span>
      </div>
    );
  }

  return (
    <div className="ProjectManager">
      <div className="ProjectManager__header">
        <div className="ProjectManager__title">{t("projectManager.title")}</div>
        <div className="ProjectManager__zoomControls">
          <button
            className="ProjectManager__zoomBtn"
            onClick={handleZoomOut}
            disabled={cardSize <= MIN_CARD_SIZE}
            title="Zoom out"
          >
            −
          </button>
          <button
            className="ProjectManager__zoomBtn"
            onClick={handleZoomIn}
            disabled={cardSize >= MAX_CARD_SIZE}
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      <div className="ProjectManager__actions">
        <button className="ProjectManager__actionBtn" onClick={handleNewProject}>
          + {t("projectManager.newProject")}
        </button>
        <button className="ProjectManager__actionBtn" onClick={handleNewGroup}>
          + {t("projectManager.newGroup")}
        </button>
      </div>

      <div className="ProjectManager__content">
        {/* Render groups */}
        {index.groups
          .sort((a, b) => a.order - b.order)
          .map((group) => {
            const groupProjects = index.projects.filter(
              (p) => p.groupId === group.id,
            );
            return (
              <ProjectGroup
                key={group.id}
                group={group}
                projects={groupProjects}
                currentProjectId={index.currentProjectId}
                cardSize={cardSize}
                onToggleExpand={handleToggleExpand}
                onRenameGroup={handleRenameGroup}
                onDeleteGroup={handleDeleteGroup}
                onSelectProject={handleSelectProject}
                onOpenInNewTab={handleOpenInNewTab}
                onRenameProject={handleRenameProject}
                onDeleteProject={handleDeleteProject}
                onMoveToGroup={handleMoveToGroup}
                availableGroups={availableGroups}
                getPreviewUrl={getPreviewUrl}
              />
            );
          })}

        {/* Render ungrouped projects */}
        <ProjectGroup
          group={null}
          projects={ungroupedProjects}
          currentProjectId={index.currentProjectId}
          cardSize={cardSize}
          onToggleExpand={handleToggleExpand}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
          onSelectProject={handleSelectProject}
          onOpenInNewTab={handleOpenInNewTab}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          onMoveToGroup={handleMoveToGroup}
          availableGroups={availableGroups}
          getPreviewUrl={getPreviewUrl}
        />

        {index.projects.length === 0 && (
          <div className="ProjectManager__empty">
            <p>{t("projectManager.empty")}</p>
            <button onClick={handleNewProject}>
              {t("projectManager.createFirst")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
