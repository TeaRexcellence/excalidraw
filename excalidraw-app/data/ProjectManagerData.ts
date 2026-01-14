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

// Atom to trigger save modal from outside ProjectManager component
export const triggerSaveProjectAtom = atom(0);

export interface Project {
  id: string;
  title: string;
  groupId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectGroup {
  id: string;
  name: string;
  order: number;
  expanded: boolean;
}

export interface ProjectsIndex {
  projects: Project[];
  groups: ProjectGroup[];
  currentProjectId: string | null;
}

const DEFAULT_INDEX: ProjectsIndex = {
  projects: [],
  groups: [],
  currentProjectId: null,
};

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
};

// Cache for current project state
let cachedIndex: ProjectsIndex | null = null;

// Callback for generating preview (set by ProjectManager component)
let previewGenerator: ((projectId: string) => Promise<void>) | null = null;

export class ProjectManagerData {
  private static saveDebounced = debounce(
    async (
      projectId: string,
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
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

      // Generate preview if callback is registered
      if (previewGenerator) {
        await previewGenerator(projectId);
      }

      // Update the project's updatedAt timestamp
      if (cachedIndex) {
        cachedIndex = {
          ...cachedIndex,
          projects: cachedIndex.projects.map((p) =>
            p.id === projectId ? { ...p, updatedAt: Date.now() } : p,
          ),
        };
        await api.saveIndex(cachedIndex);
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
}
