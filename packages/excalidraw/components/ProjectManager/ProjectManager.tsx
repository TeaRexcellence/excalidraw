import React, { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { useAtomValue } from "jotai";

import { CaptureUpdateAction } from "@excalidraw/element";

import { getDefaultAppState } from "../../appState";
import { t } from "../../i18n";
import { useApp } from "../App";
import { exportToCanvas } from "../../scene/export";
import { Dialog } from "../Dialog";
import { FilledButton } from "../FilledButton";
import { DotsIcon } from "../icons";
import { triggerSaveProjectAtom, triggerRefreshProjectsAtom, ProjectManagerData } from "../../../../excalidraw-app/data/ProjectManagerData";

import { ProjectCard } from "./ProjectCard";
import { ProjectGroup } from "./ProjectGroup";
import { CategoryBar } from "./CategoryBar";
import type { FilterType } from "./CategoryBar";
import type { Project, ProjectGroup as ProjectGroupType, ProjectsIndex } from "./types";
import { DEFAULT_PROJECTS_INDEX } from "./types";

import "./ProjectManager.scss";

const MIN_CARD_SIZE = 100;
const MAX_CARD_SIZE = 300;
const DEFAULT_CARD_SIZE = MIN_CARD_SIZE;
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

  async saveIndex(index: ProjectsIndex): Promise<boolean> {
    try {
      const res = await fetch("/api/projects/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(index),
      });
      if (!res.ok) {
        console.error("[ProjectManager] Failed to save index:", res.status);
        return false;
      }
      // Only update cache after successful save
      ProjectManagerData.updateCachedIndex(index);
      return true;
    } catch (err) {
      console.error("[ProjectManager] Network error saving index:", err);
      return false;
    }
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

  async saveScene(projectId: string, sceneData: any): Promise<boolean> {
    try {
      const res = await fetch(`/api/projects/${projectId}/scene`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sceneData),
      });
      if (!res.ok) {
        console.error("[ProjectManager] Failed to save scene:", res.status);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[ProjectManager] Network error saving scene:", err);
      return false;
    }
  },

  async savePreview(projectId: string, blob: Blob): Promise<string | null> {
    try {
      const res = await fetch(`/api/projects/${projectId}/preview`, {
        method: "POST",
        body: blob,
      });
      if (!res.ok) {
        console.error("[ProjectManager] Failed to save preview:", res.status);
        return null;
      }
      const data = await res.json();
      return data.url;
    } catch (err) {
      console.error("[ProjectManager] Network error saving preview:", err);
      return null;
    }
  },

  async deleteProject(projectId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        console.error("[ProjectManager] Failed to delete project:", res.status);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[ProjectManager] Network error deleting project:", err);
      return false;
    }
  },

  async moveProject(
    projectId: string,
    oldCategoryName: string | null,
    oldTitle: string,
    newCategoryName: string | null,
    newTitle: string,
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/projects/${projectId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldCategoryName: oldCategoryName || "Uncategorized",
          oldTitle,
          newCategoryName: newCategoryName || "Uncategorized",
          newTitle,
        }),
      });
      if (!res.ok) {
        console.error("[ProjectManager] Failed to move project:", res.status);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[ProjectManager] Network error moving project:", err);
      return false;
    }
  },

  async renameCategory(oldName: string, newName: string): Promise<boolean> {
    try {
      const res = await fetch("/api/projects/rename-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName, newName }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[ProjectManager] Failed to rename category:", res.status, data.error);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[ProjectManager] Network error renaming category:", err);
      return false;
    }
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
// "import" = importing a project from zip
// "reset" = reset project manager (delete all projects)
type ModalType = "project" | "save" | "group" | "confirm-save" | "rename-project" | "import" | "reset" | null;

export const ProjectManager: React.FC = () => {
  const app = useApp();
  const [index, setIndex] = useState<ProjectsIndex>(DEFAULT_PROJECTS_INDEX);
  const [cardSize, setCardSize] = useState(DEFAULT_CARD_SIZE);
  const [isLoading, setIsLoading] = useState(true);
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  // Ref to always have current index value (avoids stale closure issues)
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Lock to prevent concurrent project operations
  const operationInProgress = useRef(false);

  // Modal state
  const [modalType, setModalType] = useState<ModalType>(null);
  const [modalName, setModalName] = useState("");
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);

  // Filter state for CategoryBar
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");

  // Settings dropdown state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Import/Export state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Reset state
  const [projectsPath, setProjectsPath] = useState<string>("");
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // Listen for external save trigger (from main menu)
  const saveTrigger = useAtomValue(triggerSaveProjectAtom);

  // Listen for external refresh trigger (from VideoEmbedDialog after creating project)
  const refreshTrigger = useAtomValue(triggerRefreshProjectsAtom);

  // Check if current canvas has unsaved content (not in project manager)
  const hasUnsavedCanvas = index.currentProjectId === null && app.scene.getNonDeletedElements().length > 0;

  // Load projects on mount
  useEffect(() => {
    api.getIndex().then((data) => {
      setIndex(data);
      setIsLoading(false);
    });
  }, []);

  // Refresh project list when triggered externally
  useEffect(() => {
    if (refreshTrigger > 0) {
      api.getIndex().then((data) => {
        setIndex(data);
      });
    }
  }, [refreshTrigger]);

  // Keep ProjectManagerData cache in sync with local index
  // This prevents divergence between auto-save and manual operations
  useEffect(() => {
    ProjectManagerData.updateCachedIndex(index);
  }, [index]);

  // Track pending save trigger (if triggered before loading completes)
  const pendingSaveTriggerRef = useRef(0);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  // Sanitize name for folder path (must match server-side sanitization in vite.config.mts)
  const sanitizeFolderName = useCallback((name: string): string => {
    // Must match the server-side sanitizeFolderName function exactly
    let safe = name
      .replace(/\.\./g, "_") // Prevent path traversal
      .replace(/[\\/:*?"<>|]/g, "_") // Invalid Windows characters
      .replace(/^[\s.]+|[\s.]+$/g, "") // Strip leading/trailing spaces and dots
      .substring(0, 100); // Limit length

    // Double-check no path traversal remains
    while (safe.includes("..")) {
      safe = safe.replace(/\.\./g, "_");
    }

    return safe || "Untitled";
  }, []);

  // Get preview URL for a project
  const getPreviewUrl = useCallback(
    (projectId: string): string | null => {
      if (previewCache[projectId]) {
        return previewCache[projectId];
      }
      // Build path based on category/title structure
      const project = index.projects.find((p) => p.id === projectId);
      if (!project) {
        return null;
      }
      const category = project.groupId
        ? index.groups.find((g) => g.id === project.groupId)?.name || "Uncategorized"
        : "Uncategorized";
      const categoryFolder = sanitizeFolderName(category);
      const projectFolder = sanitizeFolderName(project.title);
      return `/projects/${categoryFolder}/${projectFolder}/preview.png`;
    },
    [previewCache, index.projects, index.groups, sanitizeFolderName],
  );

  // Generate preview using the same export function as "Export Image"
  // This ensures previews look identical to exports (including video thumbnails)
  const generatePreview = useCallback(async (): Promise<Blob | null> => {
    try {
      const elements = app.scene.getNonDeletedElements();
      if (elements.length === 0) {
        return null;
      }

      // Use the same exportToCanvas function as the export dialog
      // Match preview theme to current UI theme
      const isDark = app.state.theme === "dark";
      const canvas = await exportToCanvas(
        elements,
        {
          ...app.state,
          exportWithDarkMode: isDark,
          exportScale: 1, // Use 1x scale for preview (smaller file size)
        },
        app.files,
        {
          exportBackground: true,
          exportPadding: 10,
          viewBackgroundColor: app.state.viewBackgroundColor,
        },
        // Custom canvas creator to limit preview size
        (width, height) => {
          const maxSize = 400;
          const scale = Math.min(maxSize / width, maxSize / height, 1);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          return { canvas, scale };
        },
      );

      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob);
        }, "image/png", 0.85);
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
  // Respects hasCustomPreview — never overwrites a custom preview
  const saveCurrentProject = useCallback(
    async (projectId: string, updatePreview: boolean = true) => {
      await saveProjectData(projectId);

      // Only generate preview when explicitly requested AND project doesn't have custom preview
      if (updatePreview) {
        const currentIndex = indexRef.current;
        const project = currentIndex.projects.find((p) => p.id === projectId);
        if (project?.hasCustomPreview) {
          return; // Don't overwrite custom preview
        }

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
      // Use ref to get fresh index (avoids stale closure if project renamed)
      const currentIndex = indexRef.current;
      // Check if project has custom preview - if so, skip auto-generation
      const project = currentIndex.projects.find((p) => p.id === projectId);
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
  }, [generatePreview]);

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

  // Helper to get category name by group ID
  const getCategoryName = useCallback(
    (groupId: string | null): string | null => {
      if (!groupId) return null;
      return index.groups.find((g) => g.id === groupId)?.name || null;
    },
    [index.groups],
  );

  // Actually rename the project (called from modal confirm)
  const doRenameProject = useCallback(
    async (projectId: string, newTitle: string) => {
      const project = index.projects.find((p) => p.id === projectId);
      if (!project) return;

      const oldTitle = project.title;
      const categoryName = getCategoryName(project.groupId);

      // Move folder first (rename)
      await api.moveProject(projectId, categoryName, oldTitle, categoryName, newTitle);

      // Then update index
      const newIndex: ProjectsIndex = {
        ...index,
        projects: index.projects.map((p) =>
          p.id === projectId ? { ...p, title: newTitle, updatedAt: Date.now() } : p,
        ),
      };
      setIndex(newIndex);
      await api.saveIndex(newIndex);
    },
    [index, getCategoryName],
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

      // Save index FIRST so the API knows the project's path (title/category)
      const newIndex: ProjectsIndex = {
        ...index,
        projects: [...index.projects, newProject],
        currentProjectId: projectId,
      };

      // Update cachedIndex before saving so auto-save targets the new project
      ProjectManagerData.updateCachedIndex(newIndex);
      setIndex(newIndex);
      await api.saveIndex(newIndex);

      // Now save scene and preview (API can now look up the project path)
      await saveCurrentProject(projectId, true);
    } else if (modalType === "project") {
      // Create new blank project
      ProjectManagerData.beginProjectSwitch();
      try {
        // Save current project if there is one
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

        // Update cachedIndex BEFORE clearing canvas so any triggered onChange
        // targets the new project, not the old one
        ProjectManagerData.updateCachedIndex(newIndex);
        setIndex(newIndex);
        await api.saveIndex(newIndex);

        // Save the blank project scene
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

        // NOW clear the canvas (which triggers onChange → save)
        const defaults = getDefaultAppState();
        app.syncActionResult({
          elements: [],
          appState: {
            name,
            viewBackgroundColor: app.state.viewBackgroundColor,
            zoom: defaults.zoom,
            scrollX: 0,
            scrollY: 0,
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      } finally {
        ProjectManagerData.endProjectSwitch();
      }
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
      // Use ref to get current index value (avoids stale closure)
      const currentIndex = indexRef.current;

      console.log("[ProjectManager] Selecting project:", projectId, "current:", currentIndex.currentProjectId);

      // Prevent concurrent operations
      if (operationInProgress.current) {
        console.log("[ProjectManager] Operation in progress, ignoring click");
        return;
      }

      if (projectId === currentIndex.currentProjectId) {
        console.log("[ProjectManager] Already on this project, skipping");
        return;
      }

      operationInProgress.current = true;
      ProjectManagerData.beginProjectSwitch();

      try {
        // Auto-save current project first (save is already cancelled by beginProjectSwitch)
        if (currentIndex.currentProjectId) {
          console.log("[ProjectManager] Saving current project:", currentIndex.currentProjectId);
          await saveCurrentProject(currentIndex.currentProjectId);
        }

        // Load the new project
        console.log("[ProjectManager] Loading scene for:", projectId);
        const sceneData = await api.getScene(projectId);

        // Get fresh index after async operations
        const freshIndex = indexRef.current;

        // Build the new index with currentProjectId pointing to the NEW project
        const newIndex: ProjectsIndex = {
          ...freshIndex,
          currentProjectId: projectId,
          projects: freshIndex.projects.map((p) =>
            p.id === projectId ? { ...p, updatedAt: Date.now() } : p,
          ),
        };

        // Update cachedIndex FIRST so any onChange triggered by syncActionResult
        // targets the correct (new) project
        ProjectManagerData.updateCachedIndex(newIndex);
        setIndex(newIndex);
        await api.saveIndex(newIndex);

        // NOW update the canvas (which triggers onChange → save)
        if (sceneData) {
          console.log("[ProjectManager] Updating scene with elements:", sceneData.elements?.length || 0);
          app.syncActionResult({
            elements: sceneData.elements || [],
            appState: {
              ...sceneData.appState,
              name: freshIndex.projects.find((p) => p.id === projectId)?.title,
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
          app.syncActionResult({
            elements: [],
            appState: {
              name: freshIndex.projects.find((p) => p.id === projectId)?.title,
            },
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          });
        }
      } finally {
        ProjectManagerData.endProjectSwitch();
        operationInProgress.current = false;
      }
    },
    [app, saveCurrentProject],
  );

  // Listen for project link card navigation events
  useEffect(() => {
    const handler = (e: Event) => {
      const projectId = (e as CustomEvent).detail?.projectId;
      if (projectId) {
        handleSelectProject(projectId);
      }
    };
    window.addEventListener("excalidraw-navigate-project", handler);
    return () => {
      window.removeEventListener("excalidraw-navigate-project", handler);
    };
  }, [handleSelectProject]);

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
      const isCurrentProject = index.currentProjectId === projectId;

      await api.deleteProject(projectId);

      const newIndex: ProjectsIndex = {
        ...index,
        projects: index.projects.filter((p) => p.id !== projectId),
        currentProjectId: isCurrentProject ? null : index.currentProjectId,
      };
      setIndex(newIndex);
      await api.saveIndex(newIndex);

      // If we deleted the current project, reset the canvas
      if (isCurrentProject) {
        app.syncActionResult({
          elements: [],
          appState: {
            name: "",
            viewBackgroundColor: app.state.viewBackgroundColor,
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      }
    },
    [app, index],
  );

  // Move project to group
  const handleMoveToGroup = useCallback(
    async (projectId: string, newGroupId: string | null) => {
      const project = index.projects.find((p) => p.id === projectId);
      if (!project) return;

      const oldCategoryName = getCategoryName(project.groupId);
      const newCategoryName = getCategoryName(newGroupId);

      // Move folder to new category
      await api.moveProject(projectId, oldCategoryName, project.title, newCategoryName, project.title);

      // Then update index
      const newIndex: ProjectsIndex = {
        ...index,
        projects: index.projects.map((p) =>
          p.id === projectId ? { ...p, groupId: newGroupId, updatedAt: Date.now() } : p,
        ),
      };
      setIndex(newIndex);
      await api.saveIndex(newIndex);
    },
    [index, getCategoryName],
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
      const group = index.groups.find((g) => g.id === groupId);
      if (!group) return;

      const oldName = group.name;

      // Rename folder first
      await api.renameCategory(oldName, newName);

      // Then update index
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
      const group = index.groups.find((g) => g.id === groupId);
      if (!group) return;

      const categoryName = group.name;

      // Move all projects in this group to Uncategorized
      const projectsInGroup = index.projects.filter((p) => p.groupId === groupId);
      for (const project of projectsInGroup) {
        await api.moveProject(project.id, categoryName, project.title, null, project.title);
      }

      // Then update index
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
        // Sync all caches synchronously so the auto-save preview generator
        // sees hasCustomPreview immediately (before React re-renders)
        indexRef.current = newIndex;
        ProjectManagerData.updateCachedIndex(newIndex);
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
      // Sync all caches synchronously so the auto-save preview generator
      // sees hasCustomPreview: false immediately
      indexRef.current = newIndex;
      ProjectManagerData.updateCachedIndex(newIndex);
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

  // Toggle favorite status
  const handleToggleFavorite = useCallback(
    async (projectId: string) => {
      const project = index.projects.find((p) => p.id === projectId);
      if (!project) return;

      const newIndex: ProjectsIndex = {
        ...index,
        projects: index.projects.map((p) =>
          p.id === projectId ? { ...p, isFavorite: !p.isFavorite } : p,
        ),
      };
      setIndex(newIndex);
      await api.saveIndex(newIndex);
    },
    [index],
  );

  // Create a new category (from CategoryBar or CategoryPicker)
  const handleCreateCategory = useCallback(
    async (name: string) => {
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

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };

    if (settingsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [settingsOpen]);

  // Export current project as zip
  const handleExportProject = useCallback(async () => {
    if (!index.currentProjectId) {
      return;
    }

    setSettingsOpen(false);
    setIsExporting(true);

    try {
      const response = await fetch(`/api/projects/${index.currentProjectId}/export`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      // Get the blob and trigger download
      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || "project.zip";

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[ProjectManager] Export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [index.currentProjectId]);

  // Open import modal
  const handleImportClick = useCallback(() => {
    setSettingsOpen(false);
    setImportError(null);
    setModalType("import");
  }, []);

  // Handle import file selection
  const handleImportFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    // Reset input for re-selection
    e.target.value = "";

    if (!file.name.endsWith(".zip")) {
      setImportError("Please select a .zip file");
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      const response = await fetch("/api/projects/import", {
        method: "POST",
        body: file,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Import failed");
      }

      // Refresh the project list
      const newIndex = await api.getIndex();
      setIndex(newIndex);

      // Close the modal
      setModalType(null);
    } catch (err) {
      console.error("[ProjectManager] Import failed:", err);
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }, []);

  // Open reset modal
  const handleResetClick = useCallback(async () => {
    setSettingsOpen(false);
    setResetConfirmText("");

    // Fetch the projects directory path
    try {
      const response = await fetch("/api/projects/path");
      const data = await response.json();
      setProjectsPath(data.path || "");
    } catch {
      setProjectsPath("");
    }

    setModalType("reset");
  }, []);

  // Handle reset confirmation
  const handleResetConfirm = useCallback(async () => {
    if (resetConfirmText !== "CONFIRM") {
      return;
    }

    setIsResetting(true);

    try {
      const response = await fetch("/api/projects/reset", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Reset failed");
      }

      // Clear the canvas
      app.syncActionResult({
        elements: [],
        appState: {
          name: "",
          viewBackgroundColor: app.state.viewBackgroundColor,
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      // Refresh the project list (should be empty now)
      const newIndex = await api.getIndex();
      setIndex(newIndex);
      setPreviewCache({});

      // Close the modal
      setModalType(null);
    } catch (err) {
      console.error("[ProjectManager] Reset failed:", err);
    } finally {
      setIsResetting(false);
    }
  }, [app, resetConfirmText]);

  // Group projects
  const favoriteProjects = index.projects.filter((p) => p.isFavorite);
  const ungroupedProjects = index.projects.filter((p) => p.groupId === null);
  const availableGroups = index.groups.map((g) => ({ id: g.id, name: g.name }));
  const groupCounts: Record<string, number> = {};
  for (const g of index.groups) {
    groupCounts[g.id] = index.projects.filter((p) => p.groupId === g.id).length;
  }

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
        <div className="ProjectManager__headerControls">
          <div className="ProjectManager__settings" ref={settingsRef}>
            <button
              className="ProjectManager__settingsBtn"
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="Settings"
            >
              {DotsIcon}
            </button>
            {settingsOpen && (
              <div className="ProjectManager__settingsDropdown">
                <button
                  onClick={handleExportProject}
                  disabled={!index.currentProjectId || isExporting}
                >
                  {isExporting ? "Exporting..." : "Export Project"}
                </button>
                <button onClick={handleImportClick}>
                  Import Project
                </button>
                <div className="ProjectManager__settingsDropdown__divider" />
                <button
                  className="ProjectManager__settingsDropdown__danger"
                  onClick={handleResetClick}
                >
                  Reset Project Manager
                </button>
              </div>
            )}
          </div>
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
      </div>

      <CategoryBar
        groups={index.groups}
        activeFilter={activeFilter}
        favoriteCount={favoriteProjects.length}
        uncategorizedCount={ungroupedProjects.length}
        groupCounts={groupCounts}
        onFilterChange={setActiveFilter}
        onCreateCategory={handleCreateCategory}
        onRenameCategory={handleRenameGroup}
        onDeleteCategory={handleDeleteGroup}
      />

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
                  modalType === "group" ? "Enter category name" : "Enter project name"
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

      {/* Import Project Modal */}
      {modalType === "import" && (
        <Dialog
          onCloseRequest={handleModalClose}
          title="Import Project"
          size="small"
        >
          <div className="ProjectManager__dialog">
            <p style={{ marginBottom: "1rem", color: "var(--color-on-surface)" }}>
              Select a project zip file to import. The project will be added to your Uncategorized folder.
            </p>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip"
              onChange={handleImportFileSelect}
              style={{ display: "none" }}
            />
            {importError && (
              <div className="ProjectManager__dialog__error">
                {importError}
              </div>
            )}
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
                label={isImporting ? "Importing..." : "Choose File"}
                onClick={isImporting ? undefined : () => importInputRef.current?.click()}
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* Reset Project Manager Modal */}
      {modalType === "reset" && (
        <Dialog
          onCloseRequest={handleModalClose}
          title="Reset Project Manager"
          size="small"
        >
          <div className="ProjectManager__dialog ProjectManager__dialog--danger">
            <div className="ProjectManager__dialog__warning">
              ⚠️ This action cannot be undone!
            </div>
            <p style={{ color: "var(--color-on-surface)", marginBottom: "0.5rem" }}>
              This will permanently delete <strong>all projects</strong> and their assets (including videos).
            </p>
            {projectsPath && (
              <div className="ProjectManager__dialog__path">
                <span>Projects location:</span>
                <code>{projectsPath}</code>
              </div>
            )}
            <div className="ProjectManager__dialog__inputGroup">
              <label htmlFor="reset-confirm-input" className="ProjectManager__dialog__label">
                Type <strong>CONFIRM</strong> to proceed
              </label>
              <input
                id="reset-confirm-input"
                type="text"
                className="ProjectManager__dialog__input"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && resetConfirmText === "CONFIRM") {
                    handleResetConfirm();
                  } else if (e.key === "Escape") {
                    handleModalClose();
                  }
                }}
                placeholder="CONFIRM"
                autoFocus
                autoComplete="off"
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
                color="danger"
                label={isResetting ? "Resetting..." : "Delete All Projects"}
                onClick={isResetting || resetConfirmText !== "CONFIRM" ? undefined : handleResetConfirm}
              />
            </div>
          </div>
        </Dialog>
      )}

      <div className="ProjectManager__content" ref={contentRef}>
        {(() => {
          // Shared props for all ProjectGroup instances
          const groupSharedProps = {
            currentProjectId: index.currentProjectId,
            justSavedId,
            cardSize,
            allGroups: index.groups,
            onToggleExpand: handleToggleExpand,
            onRenameGroup: handleRenameGroup,
            onDeleteGroup: handleDeleteGroup,
            onSelectProject: handleSelectProject,
            onOpenInNewTab: handleOpenInNewTab,
            onOpenFileLocation: handleOpenFileLocation,
            onRenameProject: handleRenameProject,
            onDeleteProject: handleDeleteProject,
            onMoveToGroup: handleMoveToGroup,
            onSetCustomPreview: handleSetCustomPreview,
            onRemoveCustomPreview: handleRemoveCustomPreview,
            onToggleFavorite: handleToggleFavorite,
            onCreateCategory: handleCreateCategory,
            availableGroups,
            getPreviewUrl,
          };

          if (activeFilter === "favorites") {
            // Show only favorites in a flat grid
            return (
              <div className="ProjectGroup__grid">
                {favoriteProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    isActive={project.id === index.currentProjectId}
                    justSaved={project.id === justSavedId}
                    previewUrl={getPreviewUrl(project.id)}
                    size={cardSize}
                    groups={index.groups}
                    onSelect={handleSelectProject}
                    onOpenInNewTab={handleOpenInNewTab}
                    onOpenFileLocation={handleOpenFileLocation}
                    onRename={handleRenameProject}
                    onDelete={handleDeleteProject}
                    onMoveToGroup={handleMoveToGroup}
                    onSetCustomPreview={handleSetCustomPreview}
                    onRemoveCustomPreview={handleRemoveCustomPreview}
                    onToggleFavorite={handleToggleFavorite}
                    onCreateCategory={handleCreateCategory}
                    availableGroups={availableGroups}
                    showCategoryBadge
                  />
                ))}
                {favoriteProjects.length === 0 && (
                  <div className="ProjectManager__empty">
                    <p>No favorite projects yet</p>
                  </div>
                )}
              </div>
            );
          }

          if (activeFilter === "uncategorized") {
            // Show only uncategorized projects in a flat grid
            return (
              <div className="ProjectGroup__grid">
                {ungroupedProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    isActive={project.id === index.currentProjectId}
                    justSaved={project.id === justSavedId}
                    previewUrl={getPreviewUrl(project.id)}
                    size={cardSize}
                    groups={index.groups}
                    onSelect={handleSelectProject}
                    onOpenInNewTab={handleOpenInNewTab}
                    onOpenFileLocation={handleOpenFileLocation}
                    onRename={handleRenameProject}
                    onDelete={handleDeleteProject}
                    onMoveToGroup={handleMoveToGroup}
                    onSetCustomPreview={handleSetCustomPreview}
                    onRemoveCustomPreview={handleRemoveCustomPreview}
                    onToggleFavorite={handleToggleFavorite}
                    onCreateCategory={handleCreateCategory}
                    availableGroups={availableGroups}
                  />
                ))}
                {ungroupedProjects.length === 0 && (
                  <div className="ProjectManager__empty">
                    <p>No uncategorized projects</p>
                  </div>
                )}
              </div>
            );
          }

          if (activeFilter !== "all") {
            // Filter by specific category
            const filtered = index.projects.filter((p) => p.groupId === activeFilter);
            return (
              <div className="ProjectGroup__grid">
                {filtered.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    isActive={project.id === index.currentProjectId}
                    justSaved={project.id === justSavedId}
                    previewUrl={getPreviewUrl(project.id)}
                    size={cardSize}
                    groups={index.groups}
                    onSelect={handleSelectProject}
                    onOpenInNewTab={handleOpenInNewTab}
                    onOpenFileLocation={handleOpenFileLocation}
                    onRename={handleRenameProject}
                    onDelete={handleDeleteProject}
                    onMoveToGroup={handleMoveToGroup}
                    onSetCustomPreview={handleSetCustomPreview}
                    onRemoveCustomPreview={handleRemoveCustomPreview}
                    onToggleFavorite={handleToggleFavorite}
                    onCreateCategory={handleCreateCategory}
                    availableGroups={availableGroups}
                  />
                ))}
                {filtered.length === 0 && (
                  <div className="ProjectManager__empty">
                    <p>No projects in this category</p>
                  </div>
                )}
              </div>
            );
          }

          // "All" view — cascading sections: Favorites → Named groups → Uncategorized
          return (
            <>
              {/* Favorites section */}
              {favoriteProjects.length > 0 && (
                <ProjectGroup
                  group={null}
                  sectionId="favorites"
                  label="Favorites"
                  icon="star"
                  projects={favoriteProjects}
                  showCategoryBadge
                  {...groupSharedProps}
                />
              )}

              {/* Named groups */}
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
                      {...groupSharedProps}
                    />
                  );
                })}

              {/* Ungrouped projects */}
              <ProjectGroup
                group={null}
                sectionId="uncategorized"
                projects={ungroupedProjects}
                {...groupSharedProps}
              />
            </>
          );
        })()}

        {index.projects.length === 0 && (
          <div className="ProjectManager__empty">
            <p>{t("projectManager.empty")}</p>
            <button onClick={handleNewProjectClick}>
              {t("projectManager.createFirst")}
            </button>
          </div>
        )}
      </div>

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
  );
};
