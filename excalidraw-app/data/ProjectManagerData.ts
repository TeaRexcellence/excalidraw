/**
 * Project Manager Data Layer
 *
 * This module handles all project persistence through the Project Manager.
 * It replaces/augments the default localStorage persistence.
 */

import { debounce } from "@excalidraw/common";
import { atom } from "jotai";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

// Import types from the canonical source
import type { Project, ProjectGroup, ProjectsIndex } from "@excalidraw/excalidraw/components/ProjectManager/types";
import { DEFAULT_PROJECTS_INDEX } from "@excalidraw/excalidraw/components/ProjectManager/types";

// Re-export types for convenience
export type { Project, ProjectGroup, ProjectsIndex };

// Atom to trigger save modal from outside ProjectManager component
export const triggerSaveProjectAtom = atom(0);

// Atom to trigger project list refresh from outside ProjectManager component
export const triggerRefreshProjectsAtom = atom(0);

const DEFAULT_INDEX: ProjectsIndex = DEFAULT_PROJECTS_INDEX;

// API helpers
const api = {
  async getIndex(): Promise<ProjectsIndex> {
    try {
      const res = await fetch("/api/projects/list");
      if (!res.ok) {
        return DEFAULT_INDEX;
      }
      const data = await res.json();
      // Validate structure
      if (!data || !Array.isArray(data.projects) || !Array.isArray(data.groups)) {
        return DEFAULT_INDEX;
      }
      return data;
    } catch {
      return DEFAULT_INDEX;
    }
  },

  async saveIndex(index: ProjectsIndex): Promise<void> {
    await fetch("/api/projects/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(index),
      keepalive: true,
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
    const res = await fetch(`/api/projects/${projectId}/scene`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sceneData),
      keepalive: true,
    });
    if (!res.ok) {
      throw new Error(
        `Save failed: HTTP ${res.status} for project ${projectId}`,
      );
    }
  },

  async savePreview(projectId: string, blob: Blob): Promise<string> {
    const res = await fetch(`/api/projects/${projectId}/preview`, {
      method: "POST",
      body: blob,
    });
    const data = await res.json();
    return data.url;
  },
};

// Cache for current project state
let cachedIndex: ProjectsIndex | null = null;

// Callback for generating preview (set by ProjectManager component)
let previewGenerator: ((projectId: string) => Promise<void>) | null = null;

export class ProjectManagerData {
  private static switchingProject = false;
  // After a project switch, suppress empty-element auto-saves until
  // real content arrives.  This prevents the multiple React re-renders
  // triggered by syncActionResult (including the showWelcomeScreen
  // setState in componentDidUpdate) from writing empty elements to disk.
  private static skipEmptySavesAfterSwitch = false;

  /**
   * Begin a project switch — suppresses auto-saves until endProjectSwitch()
   */
  static beginProjectSwitch(): void {
    this.switchingProject = true;
    this.skipEmptySavesAfterSwitch = false;
    this.cancelPendingSave();
  }

  /**
   * End a project switch — re-enables auto-saves, but empty-element
   * saves remain suppressed until real content is seen (see save()).
   */
  static endProjectSwitch(): void {
    this.skipEmptySavesAfterSwitch = true;
    this.switchingProject = false;
  }

  private static saveDebounced = debounce(
    async (
      projectId: string,
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      try {
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

        if (elements.length === 0) {
          console.warn(
            `[ProjectManagerData] Auto-saving EMPTY elements for project ${projectId}`,
          );
        }

        await api.saveScene(projectId, sceneData);

        // Generate preview if callback is registered
        if (previewGenerator) {
          try {
            await previewGenerator(projectId);
          } catch (previewErr) {
            console.warn("[ProjectManagerData] Preview generation failed:", previewErr);
            // Don't fail the whole save for preview issues
          }
        }

        // Update the cached index's updatedAt timestamp (but do NOT write
        // the index file here — that races with UI-driven index writes and
        // causes index corruption). The index is persisted by explicit user
        // actions in ProjectManager.tsx.
        if (cachedIndex) {
          cachedIndex = {
            ...cachedIndex,
            projects: cachedIndex.projects.map((p) =>
              p.id === projectId ? { ...p, updatedAt: Date.now() } : p,
            ),
          };
        }
      } catch (err) {
        console.error("[ProjectManagerData] Auto-save failed:", err);
        // Don't throw - debounced functions shouldn't throw unhandled rejections
      }
    },
    1000, // 1 second debounce
  );

  /**
   * Register a preview generator callback (called by ProjectManager component)
   */
  static setPreviewGenerator(generator: ((projectId: string) => Promise<void>) | null): void {
    previewGenerator = generator;
  }

  /**
   * Regenerate the current project's preview (e.g. after theme change).
   * No-op if no preview generator is registered or no current project.
   */
  static async regenerateCurrentPreview(): Promise<void> {
    if (!previewGenerator || !cachedIndex?.currentProjectId) {
      return;
    }
    try {
      await previewGenerator(cachedIndex.currentProjectId);
    } catch (err) {
      console.warn("[ProjectManagerData] Preview regeneration failed:", err);
    }
  }

  /**
   * Get the current projects index
   */
  static async getIndex(): Promise<ProjectsIndex> {
    if (!cachedIndex) {
      cachedIndex = await api.getIndex();
    }
    return cachedIndex;
  }

  /**
   * Refresh the index from the server
   */
  static async refreshIndex(): Promise<ProjectsIndex> {
    cachedIndex = await api.getIndex();
    return cachedIndex;
  }

  /**
   * Get the current project ID
   */
  static async getCurrentProjectId(): Promise<string | null> {
    const index = await this.getIndex();
    return index.currentProjectId;
  }

  /**
   * Load the current project's scene data
   */
  static async loadCurrentProject(): Promise<{
    elements: ExcalidrawElement[];
    appState: Partial<AppState>;
    files: BinaryFiles;
  } | null> {
    const index = await this.getIndex();

    if (!index.currentProjectId) {
      return null;
    }

    const sceneData = await api.getScene(index.currentProjectId);
    if (!sceneData) {
      return null;
    }

    return {
      elements: sceneData.elements || [],
      appState: sceneData.appState || {},
      files: sceneData.files || {},
    };
  }

  /**
   * Save to the current project (debounced)
   */
  static save(
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ): void {
    if (this.switchingProject) {
      return;
    }
    // After a project switch, suppress empty-element saves.  The canvas
    // clear from syncActionResult can trigger multiple React re-renders
    // (e.g. the showWelcomeScreen setState), each calling onChange with
    // elements=[].  We already saved the scene explicitly during the
    // switch, so these empty saves are redundant and destructive.
    if (this.skipEmptySavesAfterSwitch) {
      if (elements.length === 0) {
        return;
      }
      // Real content arrived — resume normal saves.
      this.skipEmptySavesAfterSwitch = false;
    }
    if (cachedIndex?.currentProjectId) {
      this.saveDebounced(cachedIndex.currentProjectId, elements, appState, files);
    }
  }

  /**
   * Force immediate save (e.g., before unload)
   */
  static flushSave(): void {
    this.saveDebounced.flush();
  }

  /**
   * Cancel any pending debounced save (e.g., before switching projects
   * or after clearing the canvas during project creation)
   */
  static cancelPendingSave(): void {
    this.saveDebounced.cancel();
  }

  /**
   * Check if there's a current project
   */
  static hasCurrentProject(): boolean {
    return cachedIndex?.currentProjectId != null;
  }

  /**
   * Set the current project ID
   */
  static async setCurrentProjectId(projectId: string | null): Promise<void> {
    const index = await this.getIndex();
    cachedIndex = {
      ...index,
      currentProjectId: projectId,
    };
    await api.saveIndex(cachedIndex);
  }

  /**
   * Update cached index (used by ProjectManager component)
   */
  static updateCachedIndex(index: ProjectsIndex): void {
    cachedIndex = index;
  }

  /**
   * Full reset: cancel pending saves, clear cached index, clear localStorage.
   * Called after the server-side reset to ensure no stale data remains.
   */
  static resetAll(): void {
    this.switchingProject = false;
    this.skipEmptySavesAfterSwitch = false;
    this.cancelPendingSave();
    cachedIndex = null;
    try {
      localStorage.removeItem("excalidraw");
      localStorage.removeItem("excalidraw-state");
    } catch {
      // localStorage may be unavailable
    }
  }
}
