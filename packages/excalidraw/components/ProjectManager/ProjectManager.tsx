import React, { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useAtomValue } from "jotai";

import { CaptureUpdateAction } from "@excalidraw/element";

import { t } from "../../i18n";
import { useApp } from "../App";
import { Dialog } from "../Dialog";
import { FilledButton } from "../FilledButton";
import { triggerSaveProjectAtom, ProjectManagerData } from "../../../../excalidraw-app/data/ProjectManagerData";

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
    // IMPORTANT: Also update the cached index in ProjectManagerData to prevent
    // race conditions where the debounced auto-save overwrites our changes
    ProjectManagerData.updateCachedIndex(index);
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

// Generate a random project/group name
const generateRandomName = (prefix: string): string => {
  const adjectives = ["Swift", "Bright", "Cool", "Fresh", "Bold", "Calm", "Wild", "Neat", "Soft", "Sharp"];
  const nouns = ["Canvas", "Sketch", "Draft", "Design", "Board", "Space", "Flow", "Wave", "Spark", "Frame"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${prefix} ${adj} ${noun}`;
};

// Modal types
// "project" = creating new blank project
// "save" = saving current canvas as a project
// "group" = creating new group
// "confirm-save" = confirm dialog before creating new project when unsaved changes exist
// "rename-project" = renaming existing project
type ModalType = "project" | "save" | "group" | "confirm-save" | "rename-project" | null;

export const ProjectManager: React.FC = () => {
  const app = useApp();
  const [index, setIndex] = useState<ProjectsIndex>(DEFAULT_PROJECTS_INDEX);
  const [cardSize, setCardSize] = useState(DEFAULT_CARD_SIZE);
  const [isLoading, setIsLoading] = useState(true);
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  // Modal state
  const [modalType, setModalType] = useState<ModalType>(null);
  const [modalName, setModalName] = useState("");
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);

  // Listen for external save trigger (from main menu)
  const saveTrigger = useAtomValue(triggerSaveProjectAtom);

  // Check if current canvas has unsaved content (not in project manager)
  const hasUnsavedCanvas = index.currentProjectId === null && app.scene.getNonDeletedElements().length > 0;

  // Load projects on mount
  useEffect(() => {
    api.getIndex().then((data) => {
      setIndex(data);
      setIsLoading(false);
    });
  }, []);

  // Track pending save trigger (if triggered before loading completes)
  const pendingSaveTriggerRef = useRef(0);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

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
  // Note: This captures the canvas only, not embeds/iframes (cross-origin limitation)
  const generatePreview = useCallback(async (): Promise<Blob | null> => {
    try {
      const elements = app.scene.getNonDeletedElements();
      console.log("[Preview] Generating preview, elements:", elements.length);
      if (elements.length === 0) {
        console.log("[Preview] No elements, skipping preview");
        return null;
      }

      // Small delay to ensure canvas is fully rendered
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Use the existing canvas and create a scaled preview
      const canvas = app.canvas;
      if (!canvas) {
        console.log("[Preview] No canvas available");
        return null;
      }

      console.log("[Preview] Canvas size:", canvas.width, "x", canvas.height);

      // Create a smaller canvas for the preview
      const previewCanvas = document.createElement("canvas");
      const maxSize = 300;
      const scale = Math.min(maxSize / canvas.width, maxSize / canvas.height, 1);
      previewCanvas.width = canvas.width * scale;
      previewCanvas.height = canvas.height * scale;

      const ctx = previewCanvas.getContext("2d");
      if (!ctx) {
        console.log("[Preview] Failed to get 2d context");
        return null;
      }

      ctx.scale(scale, scale);
      ctx.drawImage(canvas, 0, 0);

      return new Promise((resolve) => {
        previewCanvas.toBlob((blob) => {
          console.log("[Preview] Generated blob:", blob?.size, "bytes");
          resolve(blob);
        }, "image/png", 0.8);
      });
    } catch (err) {
      console.error("[Preview] Failed to generate preview:", err);
      return null;
    }
  }, [app]);

  // Save current project (data only, no preview update)
  const saveProjectData = useCallback(
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
    },
    [app],
  );

  // Save current project with optional preview update
  const saveCurrentProject = useCallback(
    async (projectId: string, updatePreview: boolean = true) => {
      await saveProjectData(projectId);

      // Only generate preview when explicitly requested
      if (updatePreview) {
        const previewBlob = await generatePreview();
        if (previewBlob) {
          const previewUrl = await api.savePreview(projectId, previewBlob);
          setPreviewCache((prev) => ({
            ...prev,
            [projectId]: previewUrl + "?t=" + Date.now(),
          }));
        }
      }
    },
    [saveProjectData, generatePreview],
  );

  // Register preview generator for auto-save (updates preview on every debounced save)
  // Skip if project has a custom preview set
  useEffect(() => {
    const generator = async (projectId: string) => {
      // Check if project has custom preview - if so, skip auto-generation
      const project = index.projects.find((p) => p.id === projectId);
      if (project?.hasCustomPreview) {
        return;
      }

      const previewBlob = await generatePreview();
      if (previewBlob) {
        const previewUrl = await api.savePreview(projectId, previewBlob);
        setPreviewCache((prev) => ({
          ...prev,
          [projectId]: previewUrl + "?t=" + Date.now(),
        }));
      }
    };

    ProjectManagerData.setPreviewGenerator(generator);

    return () => {
      ProjectManagerData.setPreviewGenerator(null);
    };
  }, [generatePreview, index.projects]);

  // Open modal to create new project
  const handleNewProjectClick = useCallback(() => {
    // If there's unsaved content, ask to save first
    if (hasUnsavedCanvas) {
      setModalType("confirm-save");
    } else {
      setModalName(generateRandomName(""));
      setModalType("project");
    }
  }, [hasUnsavedCanvas]);

  // Open modal to save current canvas as a project (with naming)
  const handleSaveCurrentClick = useCallback(() => {
    const name = app.state.name || generateRandomName("");
    setModalName(name);
    setModalType("save");
  }, [app.state.name]);

  // After user confirms they want to save, show the save modal
  const handleConfirmSaveYes = useCallback(() => {
    const name = app.state.name || generateRandomName("");
    setModalName(name);
    setModalType("save");
  }, [app.state.name]);

  // After user says don't save, proceed to new project
  const handleConfirmSaveNo = useCallback(() => {
    setModalName(generateRandomName(""));
    setModalType("project");
  }, []);

  // Open modal to create new group
  const handleNewGroupClick = useCallback(() => {
    setModalName(generateRandomName(""));
    setModalType("group");
  }, []);

  // Close modal
  const handleModalClose = useCallback(() => {
    setModalType(null);
    setModalName("");
  }, []);

  // Actually rename the project (called from modal confirm)
  const doRenameProject = useCallback(
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

  // Confirm create from modal
  const handleModalConfirm = useCallback(async () => {
    const name = modalName.trim() || (modalType === "save" ? "Untitled Project" : modalType === "project" ? "Untitled Project" : "Untitled Group");

    if (modalType === "save") {
      // Save current canvas as a new project (keeps existing content)
      const projectId = nanoid(10);

      const newProject: Project = {
        id: projectId,
        title: name,
        groupId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Save current scene to the new project
      await saveCurrentProject(projectId, true);

      const newIndex: ProjectsIndex = {
        ...index,
        projects: [...index.projects, newProject],
        currentProjectId: projectId,
      };

      setIndex(newIndex);
      await api.saveIndex(newIndex);
    } else if (modalType === "project") {
      // Create new blank project
      // First, save current project if there is one
      if (index.currentProjectId) {
        await saveCurrentProject(index.currentProjectId);
      }

      const projectId = nanoid(10);

      const newProject: Project = {
        id: projectId,
        title: name,
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
          name,
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
          name,
        },
        files: {},
      });

      setIndex(newIndex);
      await api.saveIndex(newIndex);
    } else if (modalType === "group") {
      const groupId = nanoid(10);

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
    } else if (modalType === "rename-project" && renameProjectId) {
      await doRenameProject(renameProjectId, name);
      setRenameProjectId(null);
    }

    handleModalClose();
  }, [app, index, modalName, modalType, saveCurrentProject, handleModalClose, renameProjectId, doRenameProject]);

  // Handle modal key press
  const handleModalKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleModalConfirm();
      } else if (e.key === "Escape") {
        handleModalClose();
      }
    },
    [handleModalConfirm, handleModalClose],
  );

  // Select/switch to a project
  const handleSelectProject = useCallback(
    async (projectId: string) => {
      console.log("[ProjectManager] Selecting project:", projectId, "current:", index.currentProjectId);

      if (projectId === index.currentProjectId) {
        console.log("[ProjectManager] Already on this project, skipping");
        return;
      }

      // Auto-save current project first
      if (index.currentProjectId) {
        console.log("[ProjectManager] Saving current project:", index.currentProjectId);
        await saveCurrentProject(index.currentProjectId);
      }

      // Load the new project
      console.log("[ProjectManager] Loading scene for:", projectId);
      const sceneData = await api.getScene(projectId);
      console.log("[ProjectManager] Scene data:", sceneData);

      if (sceneData) {
        // Use syncActionResult to update the scene
        console.log("[ProjectManager] Updating scene with elements:", sceneData.elements?.length || 0);
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
            console.log("[ProjectManager] Loading files:", filesArray.length);
            app.addFiles(filesArray);
          }
        }
      } else {
        console.log("[ProjectManager] No scene data found, creating empty scene");
        // If no scene exists, create an empty canvas
        app.syncActionResult({
          elements: [],
          appState: {
            name: index.projects.find((p) => p.id === projectId)?.title,
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
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
      // Save current project data (no preview update needed)
      if (index.currentProjectId) {
        await saveCurrentProject(index.currentProjectId, false);
      }

      // Open in new tab with project ID in hash
      window.open(`${window.location.origin}#project=${projectId}`, "_blank");
    },
    [index.currentProjectId, saveCurrentProject],
  );

  // Open file location in system file explorer
  const handleOpenFileLocation = useCallback(async (projectId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/open-folder`, {
        method: "POST",
      });
    } catch (err) {
      console.error("Failed to open file location:", err);
    }
  }, []);

  // Open rename project modal
  const handleRenameProject = useCallback(
    (projectId: string) => {
      const project = index.projects.find((p) => p.id === projectId);
      if (project) {
        setRenameProjectId(projectId);
        setModalName(project.title);
        setModalType("rename-project");
      }
    },
    [index.projects],
  );

  // Handle external save trigger (must be after saveCurrentProject is defined)
  useEffect(() => {
    if (saveTrigger === 0) return; // Skip initial render

    if (isLoading) {
      // Store for later when loading completes
      pendingSaveTriggerRef.current = saveTrigger;
      return;
    }

    if (index.currentProjectId === null) {
      // Not saved yet - show save modal
      const name = app.state.name || generateRandomName("");
      setModalName(name);
      setModalType("save");
    } else {
      // Already saved - force save and show confirmation
      saveCurrentProject(index.currentProjectId, true).then(() => {
        // Show "Saved!" effect
        setJustSavedId(index.currentProjectId);
        setTimeout(() => setJustSavedId(null), 1500);

        // Scroll to current project
        setTimeout(() => {
          const activeCard = contentRef.current?.querySelector(".ProjectCard--active");
          if (activeCard) {
            activeCard.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 100);
      });
    }
  }, [saveTrigger, index.currentProjectId, app.state.name, isLoading, saveCurrentProject]);

  // Handle pending save trigger after loading completes
  useEffect(() => {
    if (!isLoading && pendingSaveTriggerRef.current > 0) {
      pendingSaveTriggerRef.current = 0;

      if (index.currentProjectId === null) {
        const name = app.state.name || generateRandomName("");
        setModalName(name);
        setModalType("save");
      } else {
        // Already saved - force save and show confirmation
        saveCurrentProject(index.currentProjectId, true).then(() => {
          setJustSavedId(index.currentProjectId);
          setTimeout(() => setJustSavedId(null), 1500);

          setTimeout(() => {
            const activeCard = contentRef.current?.querySelector(".ProjectCard--active");
            if (activeCard) {
              activeCard.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }, 100);
        });
      }
    }
  }, [isLoading, index.currentProjectId, app.state.name, saveCurrentProject]);

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

  // Set custom preview for a project
  const handleSetCustomPreview = useCallback(
    async (projectId: string, file: File) => {
      try {
        // Upload the custom preview image
        const previewUrl = await api.savePreview(projectId, file);

        // Mark project as having custom preview
        const newIndex: ProjectsIndex = {
          ...index,
          projects: index.projects.map((p) =>
            p.id === projectId ? { ...p, hasCustomPreview: true, updatedAt: Date.now() } : p,
          ),
        };
        setIndex(newIndex);
        await api.saveIndex(newIndex);

        // Update preview cache to show the new image
        setPreviewCache((prev) => ({
          ...prev,
          [projectId]: previewUrl + "?t=" + Date.now(),
        }));
      } catch (err) {
        console.error("Failed to set custom preview:", err);
      }
    },
    [index],
  );

  // Remove custom preview from a project
  const handleRemoveCustomPreview = useCallback(
    async (projectId: string) => {
      // Mark project as not having custom preview
      const newIndex: ProjectsIndex = {
        ...index,
        projects: index.projects.map((p) =>
          p.id === projectId ? { ...p, hasCustomPreview: false, updatedAt: Date.now() } : p,
        ),
      };
      setIndex(newIndex);
      await api.saveIndex(newIndex);

      // Regenerate preview from canvas
      const previewBlob = await generatePreview();
      if (previewBlob) {
        const previewUrl = await api.savePreview(projectId, previewBlob);
        setPreviewCache((prev) => ({
          ...prev,
          [projectId]: previewUrl + "?t=" + Date.now(),
        }));
      }
    },
    [index, generatePreview],
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

      {hasUnsavedCanvas && (
        <div className="ProjectManager__unsavedBanner">
          <span>Unsaved canvas</span>
          <button onClick={handleSaveCurrentClick}>
            Save
          </button>
        </div>
      )}

      <div className="ProjectManager__actions">
        <button className="ProjectManager__actionBtn" onClick={handleNewProjectClick}>
          + {t("projectManager.newProject")}
        </button>
        <button className="ProjectManager__actionBtn" onClick={handleNewGroupClick}>
          + {t("projectManager.newGroup")}
        </button>
      </div>

      {/* Confirm Save Dialog - shown when creating new project with unsaved changes */}
      {modalType === "confirm-save" && (
        <Dialog
          onCloseRequest={handleModalClose}
          title="Unsaved Changes"
          size="small"
        >
          <div className="ProjectManager__dialog">
            <p style={{ marginBottom: "1rem", color: "var(--color-on-surface)" }}>
              You have unsaved changes. Would you like to save them before creating a new project?
            </p>
            <div className="ProjectManager__dialog__actions">
              <FilledButton
                variant="outlined"
                color="primary"
                label="Don't Save"
                onClick={handleConfirmSaveNo}
              />
              <FilledButton
                variant="filled"
                color="primary"
                label="Save"
                onClick={handleConfirmSaveYes}
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* Create/Save/Rename Modal */}
      {(modalType === "project" || modalType === "save" || modalType === "group" || modalType === "rename-project") && (
        <Dialog
          onCloseRequest={handleModalClose}
          title={
            modalType === "save"
              ? "Save Project"
              : modalType === "project"
              ? t("projectManager.newProject")
              : modalType === "rename-project"
              ? "Rename Project"
              : t("projectManager.newGroup")
          }
          size="small"
        >
          <div className="ProjectManager__dialog">
            <div className="ProjectManager__dialog__inputGroup">
              <label htmlFor="project-name-input" className="ProjectManager__dialog__label">
                Name
              </label>
              <input
                id="project-name-input"
                type="text"
                className="ProjectManager__dialog__input"
                value={modalName}
                onChange={(e) => setModalName(e.target.value)}
                onKeyDown={handleModalKeyDown}
                placeholder={
                  modalType === "group" ? "Enter group name" : "Enter project name"
                }
                autoFocus
              />
            </div>
            <div className="ProjectManager__dialog__actions">
              <FilledButton
                variant="outlined"
                color="primary"
                label="Cancel"
                onClick={handleModalClose}
              />
              <FilledButton
                variant="filled"
                color="primary"
                label={modalType === "save" ? "Save" : modalType === "rename-project" ? "Rename" : "Create"}
                onClick={handleModalConfirm}
              />
            </div>
          </div>
        </Dialog>
      )}

      <div className="ProjectManager__content" ref={contentRef}>
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
                justSavedId={justSavedId}
                cardSize={cardSize}
                onToggleExpand={handleToggleExpand}
                onRenameGroup={handleRenameGroup}
                onDeleteGroup={handleDeleteGroup}
                onSelectProject={handleSelectProject}
                onOpenInNewTab={handleOpenInNewTab}
                onOpenFileLocation={handleOpenFileLocation}
                onRenameProject={handleRenameProject}
                onDeleteProject={handleDeleteProject}
                onMoveToGroup={handleMoveToGroup}
                onSetCustomPreview={handleSetCustomPreview}
                onRemoveCustomPreview={handleRemoveCustomPreview}
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
          justSavedId={justSavedId}
          cardSize={cardSize}
          onToggleExpand={handleToggleExpand}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
          onSelectProject={handleSelectProject}
          onOpenInNewTab={handleOpenInNewTab}
          onOpenFileLocation={handleOpenFileLocation}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          onMoveToGroup={handleMoveToGroup}
          onSetCustomPreview={handleSetCustomPreview}
          onRemoveCustomPreview={handleRemoveCustomPreview}
          availableGroups={availableGroups}
          getPreviewUrl={getPreviewUrl}
        />

        {index.projects.length === 0 && (
          <div className="ProjectManager__empty">
            <p>{t("projectManager.empty")}</p>
            <button onClick={handleNewProjectClick}>
              {t("projectManager.createFirst")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
