import React, { useCallback, useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";

import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { DragStartEvent, DragEndEvent, DragOverEvent } from "@dnd-kit/core";

import { CaptureUpdateAction, getCommonBounds } from "@excalidraw/element";

import { useAtom, useAtomValue } from "../../../../excalidraw-app/app-jotai";

import { MIME_TYPES } from "@excalidraw/common";

import { getDefaultAppState } from "../../appState";
import { loadSceneOrLibraryFromBlob } from "../../data/blob";
import { t } from "../../i18n";
import { useApp } from "../App";
import { exportToCanvas } from "../../scene/export";
import { Dialog } from "../Dialog";
import { FilledButton } from "../FilledButton";
import { DotsIcon, ExportIcon, LoadIcon, TrashIcon } from "../icons";
import DropdownMenu from "../dropdownMenu/DropdownMenu";
import {
  triggerSaveProjectAtom,
  triggerNewProjectAtom,
  triggerRefreshProjectsAtom,
  previewCacheAtom,
  ProjectManagerData,
} from "../../../../excalidraw-app/data/ProjectManagerData";

import { ProjectCard } from "./ProjectCard";
import { ProjectGroup, DragOverlayCard } from "./ProjectGroup";
import { CategoryBar } from "./CategoryBar";

import { DEFAULT_PROJECTS_INDEX } from "./types";

import type { FilterType } from "./CategoryBar";
import type {
  Project,
  ProjectGroup as ProjectGroupType,
  ProjectsIndex,
} from "./types";

import "./ProjectManager.scss";

// ─── Project order normalization ─────────────────────────────────

function normalizeProjectOrders(projects: Project[]): {
  projects: Project[];
  changed: boolean;
} {
  let changed = false;

  // Group projects by their groupId
  const byGroup = new Map<string | null, Project[]>();
  for (const p of projects) {
    const key = p.groupId;
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
    }
    byGroup.get(key)!.push(p);
  }

  // Assign sequential order within each group if any are missing
  const orderMap = new Map<string, number>();
  for (const [, groupProjects] of byGroup) {
    const needsOrders = groupProjects.some((p) => p.order === undefined);
    if (needsOrders) {
      changed = true;
      groupProjects.forEach((p, i) => orderMap.set(p.id, i));
    }
  }

  // Assign favoriteOrder for favorites if any are missing
  const favorites = projects.filter((p) => p.isFavorite);
  const needsFavOrders = favorites.some((p) => p.favoriteOrder === undefined);
  if (needsFavOrders && favorites.length > 0) {
    changed = true;
    favorites.forEach((p, i) => {
      const existing = orderMap.get(p.id);
      // Store favoriteOrder separately — we'll handle in the map below
      if (existing === undefined) {
        orderMap.set(p.id, p.order ?? 0);
      }
    });
  }

  if (!changed) {
    return { projects, changed: false };
  }

  const favOrder = new Map<string, number>();
  if (needsFavOrders) {
    favorites.forEach((p, i) => favOrder.set(p.id, i));
  }

  const normalized = projects.map((p) => ({
    ...p,
    order: orderMap.has(p.id) ? orderMap.get(p.id)! : p.order,
    favoriteOrder: favOrder.has(p.id) ? favOrder.get(p.id)! : p.favoriteOrder,
  }));

  return { projects: normalized, changed: true };
}

// Sort projects by order (or favoriteOrder for favorites context)
function sortProjects(
  projects: Project[],
  orderKey: "order" | "favoriteOrder" = "order",
): Project[] {
  return [...projects].sort(
    (a, b) => (a[orderKey] ?? 0) - (b[orderKey] ?? 0),
  );
}

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

  async savePreview(projectId: string, blob: Blob, variant?: "dark" | "light"): Promise<string | null> {
    try {
      const url = variant
        ? `/api/projects/${projectId}/preview?variant=${variant}`
        : `/api/projects/${projectId}/preview`;
      const res = await fetch(url, {
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
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
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

  async renameProject(
    projectId: string,
    newTitle: string,
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/projects/${projectId}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newTitle }),
      });
      if (!res.ok) {
        console.error(
          "[ProjectManager] Failed to rename project:",
          res.status,
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error("[ProjectManager] Network error renaming project:", err);
      return false;
    }
  },
};

// Generate a random project/group name
const generateRandomName = (prefix: string): string => {
  const adjectives = [
    "Swift",
    "Bright",
    "Cool",
    "Fresh",
    "Bold",
    "Calm",
    "Wild",
    "Neat",
    "Soft",
    "Sharp",
  ];
  const nouns = [
    "Canvas",
    "Sketch",
    "Draft",
    "Design",
    "Board",
    "Space",
    "Flow",
    "Wave",
    "Spark",
    "Frame",
  ];
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
type ModalType =
  | "project"
  | "save"
  | "group"
  | "confirm-save"
  | "rename-project"
  | "import"
  | "reset"
  | null;

// ─── Drag-and-drop wrapper for card reordering in tab views ─────

const SortableCardWrapper: React.FC<{
  id: string;
  children: React.ReactNode;
}> = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 1 : ("auto" as any),
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
};

// ─── Sortable grid for tab views (favorites / uncategorized / category) ──

const TabSortableGrid: React.FC<{
  projects: Project[];
  orderKey: "order" | "favoriteOrder";
  currentProjectId: string | null;
  justSavedId: string | null;
  cardSize: number;
  groups: ProjectGroupType[];
  availableGroups: Array<{ id: string; name: string }>;
  getPreviewUrl: (projectId: string) => string | null;
  onSelectProject: (projectId: string) => void;
  onOpenInNewTab: (projectId: string) => void;
  onOpenFileLocation: (projectId: string) => void;
  onRenameProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onMoveToGroup: (projectId: string, groupId: string | null) => void;
  onSetCustomPreview: (projectId: string, file: File) => void;
  onRemoveCustomPreview: (projectId: string) => void;
  onToggleFavorite: (projectId: string) => void;
  onCreateCategory: (name: string) => void;
  onReorderProjects: (
    orderedIds: string[],
    orderKey: "order" | "favoriteOrder",
  ) => void;
  emptyMessage: string;
}> = ({
  projects,
  orderKey,
  currentProjectId,
  justSavedId,
  cardSize,
  groups,
  availableGroups,
  getPreviewUrl,
  onSelectProject,
  onOpenInNewTab,
  onOpenFileLocation,
  onRenameProject,
  onDeleteProject,
  onMoveToGroup,
  onSetCustomPreview,
  onRemoveCustomPreview,
  onToggleFavorite,
  onCreateCategory,
  onReorderProjects,
  emptyMessage,
}) => {
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const projectIds = projects.map((p) => p.id);

  const handleDragStart = React.useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
      if (!over || active.id === over.id) {
        return;
      }
      const oldIdx = projects.findIndex((p) => p.id === active.id);
      const newIdx = projects.findIndex((p) => p.id === over.id);
      if (oldIdx === -1 || newIdx === -1) {
        return;
      }
      const reordered = arrayMove(projects, oldIdx, newIdx);
      onReorderProjects(
        reordered.map((p) => p.id),
        orderKey,
      );
    },
    [projects, onReorderProjects, orderKey],
  );

  const handleDragCancel = React.useCallback(() => {
    setActiveDragId(null);
  }, []);

  const dragProject = activeDragId
    ? projects.find((p) => p.id === activeDragId)
    : null;

  if (projects.length === 0) {
    return (
      <div className="ProjectManager__empty">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={projectIds} strategy={rectSortingStrategy}>
        <div className="ProjectGroup__grid">
          {projects.map((project) => (
            <SortableCardWrapper key={project.id} id={project.id}>
              <ProjectCard
                project={project}
                isActive={project.id === currentProjectId}
                justSaved={project.id === justSavedId}
                previewUrl={getPreviewUrl(project.id)}
                size={cardSize}
                groups={groups}
                onSelect={onSelectProject}
                onOpenInNewTab={onOpenInNewTab}
                onOpenFileLocation={onOpenFileLocation}
                onRename={onRenameProject}
                onDelete={onDeleteProject}
                onMoveToGroup={onMoveToGroup}
                onSetCustomPreview={onSetCustomPreview}
                onRemoveCustomPreview={onRemoveCustomPreview}
                onToggleFavorite={onToggleFavorite}
                onCreateCategory={onCreateCategory}
                availableGroups={availableGroups}
              />
            </SortableCardWrapper>
          ))}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {dragProject ? (
          <div
            className="ProjectCard ProjectCard--drag-overlay"
            style={{ width: cardSize, height: cardSize + 30 }}
          >
            <div
              className="ProjectCard__preview"
              style={{ width: cardSize, height: cardSize }}
            >
              {(() => {
                const url = getPreviewUrl(dragProject.id);
                return url ? (
                  <img
                    src={url}
                    alt={dragProject.title}
                    draggable={false}
                  />
                ) : (
                  <div className="ProjectCard__placeholder">
                    <span>(EMPTY)</span>
                  </div>
                );
              })()}
            </div>
            <div className="ProjectCard__info">
              <div className="ProjectCard__title">
                <span>{dragProject.title}</span>
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

// ─── Drag-and-drop helpers for group reordering ─────────────────

const SortableGroupItem: React.FC<{
  group: ProjectGroupType;
  groupProjects: Project[];
  isBeingDragged: boolean;
  groupSharedProps: any;
  externalDrag?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
}> = ({ group, groupProjects, isBeingDragged, groupSharedProps, externalDrag, dimmed, highlighted }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `group:${group.id}` });

  // Droppable target for cross-section card drops (named group headers)
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `header:${group.id}`,
    disabled: !externalDrag || !!dimmed,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
    >
      <ProjectGroup
        group={group}
        projects={groupProjects}
        dragHandleProps={listeners}
        forceCollapsed={isBeingDragged}
        externalDrag={externalDrag}
        sortableIdPrefix="card:"
        dropRef={externalDrag ? setDropRef : undefined}
        isDropTarget={isOver && !!externalDrag}
        dimmed={dimmed}
        highlighted={highlighted}
        {...groupSharedProps}
      />
    </div>
  );
};

const DragOverlayGroupHeader: React.FC<{
  group: ProjectGroupType;
  projectCount: number;
}> = ({ group, projectCount }) => (
  <div className="ProjectGroup ProjectGroup--drag-overlay">
    <div className="ProjectGroup__header">
      <div className="ProjectGroup__header__left">
        <span className="ProjectGroup__chevron">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
        <span className="ProjectGroup__name">{group.name}</span>
        <span className="ProjectGroup__count">{projectCount}</span>
      </div>
    </div>
  </div>
);

// ─── Main Component ─────────────────────────────────────────────

export const ProjectManager: React.FC = () => {
  const app = useApp();
  const [index, setIndex] = useState<ProjectsIndex>(DEFAULT_PROJECTS_INDEX);
  const [cardSize, setCardSize] = useState(DEFAULT_CARD_SIZE);
  const [isLoading, setIsLoading] = useState(true);
  const [previewCache, setPreviewCache] = useAtom(previewCacheAtom);
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

  // Import/Export state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Reset state
  const [projectsPath, setProjectsPath] = useState<string>("");
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // ─── "All" view unified drag-and-drop ───────────────────────
  // Single DndContext handles both group header reordering AND cross-section
  // card moves (category changes, adding to favorites, reordering).
  const [allViewDragId, setAllViewDragId] = useState<string | null>(null);
  const [allViewOverId, setAllViewOverId] = useState<string | null>(null);
  const allViewSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleAllDragStart = useCallback((event: DragStartEvent) => {
    setAllViewDragId(event.active.id as string);
  }, []);

  const handleAllDragOver = useCallback((event: DragOverEvent) => {
    setAllViewOverId((event.over?.id as string) ?? null);
  }, []);

  const handleAllDragCancel = useCallback(() => {
    setAllViewDragId(null);
    setAllViewOverId(null);
  }, []);

  const handleAllDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setAllViewDragId(null);
      setAllViewOverId(null);

      if (!over || active.id === over.id) {
        return;
      }

      const activeId = active.id as string;
      const overId = over.id as string;

      // Helper to save index updates
      const saveIndex = async (newIdx: ProjectsIndex) => {
        setIndex(newIdx);
        indexRef.current = newIdx;
        await api.saveIndex(newIdx);
      };

      // ── Group header reordering ──
      if (activeId.startsWith("group:")) {
        let targetGroupId: string | null = null;
        if (overId.startsWith("group:")) {
          targetGroupId = overId.replace("group:", "");
        } else if (overId.startsWith("header:")) {
          const headerId = overId.replace("header:", "");
          // Only reorder between named groups, not special sections
          if (headerId !== "favorites" && headerId !== "uncategorized") {
            targetGroupId = headerId;
          }
        }
        if (!targetGroupId) {
          return;
        }

        const activeGroupId = activeId.replace("group:", "");
        const sortedGroups = [...index.groups].sort(
          (a, b) => a.order - b.order,
        );
        const oldIdx = sortedGroups.findIndex((g) => g.id === activeGroupId);
        const newIdx = sortedGroups.findIndex((g) => g.id === targetGroupId);

        if (oldIdx === -1 || newIdx === -1) {
          return;
        }

        const reordered = arrayMove(sortedGroups, oldIdx, newIdx);
        const updatedGroups = reordered.map((g, i) => ({ ...g, order: i }));
        const newIndex: ProjectsIndex = { ...index, groups: updatedGroups };
        setIndex(newIndex);
        indexRef.current = newIndex;
        await api.saveIndex(newIndex);
        return;
      }

      // ── Card operations ──
      const isFavDrag = activeId.startsWith("fav:");
      const projectId = activeId.replace(/^(fav:|card:)/, "");
      const project = index.projects.find((p) => p.id === projectId);
      if (!project) {
        return;
      }

      // ── Favorites drag — can only reorder within favorites ──
      if (isFavDrag) {
        if (!overId.startsWith("fav:")) {
          return; // Can't leave favorites
        }
        const targetProjectId = overId.replace("fav:", "");
        const favProjects = sortProjects(
          index.projects.filter((p) => p.isFavorite),
          "favoriteOrder",
        );
        const oldIdx = favProjects.findIndex((p) => p.id === projectId);
        const newIdx = favProjects.findIndex((p) => p.id === targetProjectId);
        if (oldIdx === -1 || newIdx === -1) {
          return;
        }
        const reordered = arrayMove(favProjects, oldIdx, newIdx);
        const orderMap = new Map(
          reordered.map((p, i) => [p.id, i]),
        );
        const newProjects = index.projects.map((p) =>
          orderMap.has(p.id)
            ? { ...p, favoriteOrder: orderMap.get(p.id)! }
            : p,
        );
        await saveIndex({ ...index, projects: newProjects });
        return;
      }

      // ── Regular card drag ──

      // Dropped on a card
      if (overId.startsWith("card:") || overId.startsWith("fav:")) {
        const targetProjectId = overId.replace(/^(fav:|card:)/, "");
        const targetProject = index.projects.find(
          (p) => p.id === targetProjectId,
        );
        if (!targetProject) {
          return;
        }

        // Dropped on a fav: card → add to favorites
        if (overId.startsWith("fav:")) {
          if (project.isFavorite) {
            return; // Already favorited
          }
          const favProjects = index.projects.filter((p) => p.isFavorite);
          const maxFavOrder = Math.max(
            0,
            ...favProjects.map((p) => p.favoriteOrder ?? 0),
          );
          const newProjects = index.projects.map((p) =>
            p.id === projectId
              ? { ...p, isFavorite: true, favoriteOrder: maxFavOrder + 1 }
              : p,
          );
          await saveIndex({ ...index, projects: newProjects });
          return;
        }

        // Same section → reorder
        const sourceSection = project.groupId;
        const targetSection = targetProject.groupId;

        if (sourceSection === targetSection) {
          const sectionProjects = sortProjects(
            index.projects.filter((p) => p.groupId === sourceSection),
          );
          const oldIdx = sectionProjects.findIndex(
            (p) => p.id === projectId,
          );
          const newIdx = sectionProjects.findIndex(
            (p) => p.id === targetProjectId,
          );
          if (oldIdx === -1 || newIdx === -1) {
            return;
          }
          const reordered = arrayMove(sectionProjects, oldIdx, newIdx);
          const orderMap = new Map(
            reordered.map((p, i) => [p.id, i]),
          );
          const newProjects = index.projects.map((p) =>
            orderMap.has(p.id) ? { ...p, order: orderMap.get(p.id)! } : p,
          );
          await saveIndex({ ...index, projects: newProjects });
        } else {
          // Different section → move to target section
          const targetSectionProjects = index.projects.filter(
            (p) => p.groupId === targetSection,
          );
          const maxOrder = Math.max(
            0,
            ...targetSectionProjects.map((p) => p.order ?? 0),
          );
          const newProjects = index.projects.map((p) =>
            p.id === projectId
              ? { ...p, groupId: targetSection, order: maxOrder + 1 }
              : p,
          );
          await saveIndex({ ...index, projects: newProjects });
        }
        return;
      }

      // Dropped on a header or group wrapper
      if (overId.startsWith("header:") || overId.startsWith("group:")) {
        const targetId = overId.replace(/^(header:|group:)/, "");

        if (targetId === "favorites") {
          // Add to favorites (don't change groupId)
          if (project.isFavorite) {
            return; // Already favorited
          }
          const favProjects = index.projects.filter((p) => p.isFavorite);
          const maxFavOrder = Math.max(
            0,
            ...favProjects.map((p) => p.favoriteOrder ?? 0),
          );
          const newProjects = index.projects.map((p) =>
            p.id === projectId
              ? { ...p, isFavorite: true, favoriteOrder: maxFavOrder + 1 }
              : p,
          );
          await saveIndex({ ...index, projects: newProjects });
          return;
        }

        if (targetId === "uncategorized") {
          // Move to uncategorized
          if (project.groupId === null) {
            return; // Already uncategorized
          }
          const uncatProjects = index.projects.filter(
            (p) => p.groupId === null,
          );
          const maxOrder = Math.max(
            0,
            ...uncatProjects.map((p) => p.order ?? 0),
          );
          const newProjects = index.projects.map((p) =>
            p.id === projectId
              ? { ...p, groupId: null, order: maxOrder + 1 }
              : p,
          );
          await saveIndex({ ...index, projects: newProjects });
          return;
        }

        // Move to named group
        if (project.groupId === targetId) {
          return; // Already in this group
        }
        const groupProjects = index.projects.filter(
          (p) => p.groupId === targetId,
        );
        const maxOrder = Math.max(
          0,
          ...groupProjects.map((p) => p.order ?? 0),
        );
        const newProjects = index.projects.map((p) =>
          p.id === projectId
            ? { ...p, groupId: targetId, order: maxOrder + 1 }
            : p,
        );
        await saveIndex({ ...index, projects: newProjects });
      }
    },
    [index],
  );

  // ─── Project card reordering (for tab views) ──────────────────

  const handleReorderProjects = useCallback(
    async (
      orderedIds: string[],
      orderKey: "order" | "favoriteOrder",
    ) => {
      const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
      const newProjects = index.projects.map((p) =>
        orderMap.has(p.id) ? { ...p, [orderKey]: orderMap.get(p.id)! } : p,
      );
      const newIndex: ProjectsIndex = { ...index, projects: newProjects };
      setIndex(newIndex);
      indexRef.current = newIndex;
      await api.saveIndex(newIndex);
    },
    [index],
  );

  // Listen for external save trigger (from main menu)
  // useAtom so we can reset to 0 after processing (prevents stale re-fires on remount)
  const [saveTrigger, setSaveTrigger] = useAtom(triggerSaveProjectAtom);

  // Listen for external "new project" trigger (from main menu)
  const [newProjectTrigger, setNewProjectTrigger] = useAtom(triggerNewProjectAtom);

  // Listen for external refresh trigger (from VideoEmbedDialog after creating project)
  const refreshTrigger = useAtomValue(triggerRefreshProjectsAtom);

  // Check if current canvas has unsaved content (not in project manager)
  const hasUnsavedCanvas =
    index.currentProjectId === null &&
    app.scene.getNonDeletedElements().length > 0;

  // Load projects on mount
  useEffect(() => {
    api.getIndex().then((data) => {
      // Normalize order fields on first load if any are missing
      const { projects: normalized, changed } = normalizeProjectOrders(
        data.projects,
      );
      const loadedIndex = changed
        ? { ...data, projects: normalized }
        : data;
      setIndex(loadedIndex);
      setIsLoading(false);
      if (changed) {
        api.saveIndex(loadedIndex);
      }
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
  // This prevents divergence between auto-save and manual operations.
  // IMPORTANT: Skip while loading — the initial DEFAULT_PROJECTS_INDEX has
  // currentProjectId=null, which would clobber cachedIndex before
  // initializeScene has a chance to call loadCurrentProject().  That causes
  // loadCurrentProject() to see currentProjectId=null, return null, and the
  // app falls back to stale localStorage data.
  useEffect(() => {
    if (!isLoading) {
      ProjectManagerData.updateCachedIndex(index);
    }
  }, [index, isLoading]);

  // Track pending save trigger (if triggered before loading completes)
  const pendingSaveTriggerRef = useRef(0);
  // Track the last saveTrigger value we actually processed, so dependency
  // changes (like saveCurrentProject getting a new ref) don't re-fire the badge.
  const lastProcessedSaveTriggerRef = useRef(0);
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

  // Get preview URL for a project — uses stable ID-based path
  // Returns the dark or light variant based on current theme
  // Custom previews always use preview.png (no variant suffix)
  const getPreviewUrl = useCallback(
    (projectId: string): string | null => {
      const project = index.projects.find((p) => p.id === projectId);
      if (!project) {
        return null;
      }

      // Custom previews are theme-independent — use original preview.png
      if (project.hasCustomPreview) {
        return `/projects/${projectId}/preview.png?t=${project.updatedAt}`;
      }

      // Check cache for the right theme variant
      const variant = app.state.theme === "dark" ? "dark" : "light";
      const cached = previewCache[projectId];
      if (cached?.[variant]) {
        return cached[variant];
      }

      // Fallback to variant file on disk; ProjectCard's onError handler
      // will try legacy preview.png if this 404s (pre-migration projects)
      return `/projects/${projectId}/preview_${variant}.png?t=${project.updatedAt}`;
    },
    [previewCache, index.projects, app.state.theme],
  );

  // Generate preview using the same export function as "Export Image"
  // This ensures previews look identical to exports (including video thumbnails)
  // Generates BOTH dark and light variants for instant theme switching
  const generatePreview = useCallback(async (): Promise<{
    dark: { blob: Blob; dataUrl: string };
    light: { blob: Blob; dataUrl: string };
  } | null> => {
    try {
      const elements = app.scene.getNonDeletedElements();
      if (elements.length === 0) {
        return null;
      }

      // Proportional padding: 10% of the larger content dimension, min 30px
      const [minX, minY, maxX, maxY] = getCommonBounds(elements);
      const contentW = maxX - minX;
      const contentH = maxY - minY;
      const padding = Math.max(30, Math.round(Math.max(contentW, contentH) * 0.5));

      // Helper to render one variant
      const renderVariant = async (isDark: boolean) => {
        const canvas = await exportToCanvas(
          elements,
          {
            ...app.state,
            exportWithDarkMode: isDark,
            exportScale: 1,
          },
          app.files,
          {
            exportBackground: true,
            exportPadding: padding,
            viewBackgroundColor: app.state.viewBackgroundColor,
          },
          (width, height) => {
            const maxSize = 600;
            const scale = Math.min(maxSize / width, maxSize / height, 1);
            const c = document.createElement("canvas");
            c.width = Math.round(width * scale);
            c.height = Math.round(height * scale);
            return { canvas: c, scale };
          },
        );

        const dataUrl = canvas.toDataURL("image/png");
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), "image/png", 0.85);
        });

        return blob ? { blob, dataUrl } : null;
      };

      // Generate variants sequentially — exportToCanvas uses shared
      // rendering state and isn't safe to call concurrently
      const darkResult = await renderVariant(true);
      const lightResult = await renderVariant(false);

      if (!darkResult || !lightResult) {
        return null;
      }

      return { dark: darkResult, light: lightResult };
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
          gridStep: appState.gridStep,
          gridModeEnabled: appState.gridModeEnabled,
          gridType: appState.gridType,
          gridOpacity: appState.gridOpacity,
          gridMinorOpacity: appState.gridMinorOpacity,
          majorGridEnabled: appState.majorGridEnabled,
          minorGridEnabled: appState.minorGridEnabled,
          objectsSnapModeEnabled: appState.objectsSnapModeEnabled,
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

        const previewResult = await generatePreview();
        if (previewResult) {
          // Optimistic: show both data URLs immediately
          setPreviewCache((prev) => ({
            ...prev,
            [projectId]: { dark: previewResult.dark.dataUrl, light: previewResult.light.dataUrl },
          }));
          // Background: save both to disk in parallel
          Promise.all([
            api.savePreview(projectId, previewResult.dark.blob, "dark"),
            api.savePreview(projectId, previewResult.light.blob, "light"),
          ]).then(([darkUrl, lightUrl]) => {
            const t = Date.now();
            setPreviewCache((prev) => ({
              ...prev,
              [projectId]: {
                dark: darkUrl ? `${darkUrl}?t=${t}` : prev[projectId]?.dark ?? "",
                light: lightUrl ? `${lightUrl}?t=${t}` : prev[projectId]?.light ?? "",
              },
            }));
          });
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

      const previewResult = await generatePreview();
      if (previewResult) {
        // Optimistic: show both data URLs immediately
        setPreviewCache((prev) => ({
          ...prev,
          [projectId]: { dark: previewResult.dark.dataUrl, light: previewResult.light.dataUrl },
        }));
        // Background: save both to disk in parallel
        Promise.all([
          api.savePreview(projectId, previewResult.dark.blob, "dark"),
          api.savePreview(projectId, previewResult.light.blob, "light"),
        ]).then(([darkUrl, lightUrl]) => {
          const t = Date.now();
          setPreviewCache((prev) => ({
            ...prev,
            [projectId]: {
              dark: darkUrl ? `${darkUrl}?t=${t}` : prev[projectId]?.dark ?? "",
              light: lightUrl ? `${lightUrl}?t=${t}` : prev[projectId]?.light ?? "",
            },
          }));
        });
      }
    };

    ProjectManagerData.setPreviewGenerator(generator);

    return () => {
      ProjectManagerData.setPreviewGenerator(null);
    };
  }, [generatePreview]);

  // Eagerly generate preview for the current project on mount/load
  // This ensures the preview is always fresh and visible immediately
  useEffect(() => {
    if (isLoading || !index.currentProjectId) {
      return;
    }
    const currentProject = index.projects.find(
      (p) => p.id === index.currentProjectId,
    );
    if (currentProject?.hasCustomPreview) {
      return;
    }
    // Small delay to let the canvas finish rendering after project load
    const timer = window.setTimeout(async () => {
      const previewResult = await generatePreview();
      if (previewResult && index.currentProjectId) {
        const pid = index.currentProjectId!;
        // Optimistic: show both data URLs immediately
        setPreviewCache((prev) => ({
          ...prev,
          [pid]: { dark: previewResult.dark.dataUrl, light: previewResult.light.dataUrl },
        }));
        // Background: save both to disk in parallel
        Promise.all([
          api.savePreview(pid, previewResult.dark.blob, "dark"),
          api.savePreview(pid, previewResult.light.blob, "light"),
        ]).then(([darkUrl, lightUrl]) => {
          const t = Date.now();
          setPreviewCache((prev) => ({
            ...prev,
            [pid]: {
              dark: darkUrl ? `${darkUrl}?t=${t}` : prev[pid]?.dark ?? "",
              light: lightUrl ? `${lightUrl}?t=${t}` : prev[pid]?.light ?? "",
            },
          }));
        });
      }
    }, 500);
    return () => clearTimeout(timer);
    // Only run on initial load, not on every index change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

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
      const project = index.projects.find((p) => p.id === projectId);
      if (!project) {
        return;
      }

      if (project.title === newTitle) {
        return;
      }

      // Rename the child folder on disk (URL stays stable — only ID matters)
      const renamed = await api.renameProject(projectId, newTitle);
      if (!renamed) {
        return;
      }

      // Update index
      const newIndex: ProjectsIndex = {
        ...index,
        projects: index.projects.map((p) =>
          p.id === projectId
            ? { ...p, title: newTitle, updatedAt: Date.now() }
            : p,
        ),
      };
      ProjectManagerData.updateCachedIndex(newIndex);
      setIndex(newIndex);
      await api.saveIndex(newIndex);
    },
    [index],
  );

  // Confirm create from modal
  const handleModalConfirm = useCallback(async () => {
    const name =
      modalName.trim() ||
      (modalType === "save"
        ? "Untitled Project"
        : modalType === "project"
        ? "Untitled Project"
        : "Untitled Group");

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
        // Spread all defaults so new projects start clean regardless of
        // what the previous project had in appState.
        const defaults = getDefaultAppState();
        app.syncActionResult({
          elements: [],
          appState: {
            ...defaults,
            name,
            viewBackgroundColor: app.state.viewBackgroundColor,
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
  }, [
    app,
    index,
    modalName,
    modalType,
    saveCurrentProject,
    handleModalClose,
    renameProjectId,
    doRenameProject,
  ]);

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

      console.log(
        "[ProjectManager] Selecting project:",
        projectId,
        "current:",
        currentIndex.currentProjectId,
      );

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
          console.log(
            "[ProjectManager] Saving current project:",
            currentIndex.currentProjectId,
          );
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
        // Spread defaults first so any per-project state missing from saved
        // data (older projects, new features) resets instead of bleeding
        // from the previous project.
        const switchDefaults = getDefaultAppState();
        const projectTitle = freshIndex.projects.find((p) => p.id === projectId)?.title;

        if (sceneData) {
          console.log(
            "[ProjectManager] Updating scene with elements:",
            sceneData.elements?.length || 0,
          );
          app.syncActionResult({
            elements: sceneData.elements || [],
            appState: {
              ...switchDefaults,
              ...sceneData.appState,
              name: projectTitle,
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
          console.log(
            "[ProjectManager] No scene data found, creating empty scene",
          );
          app.syncActionResult({
            elements: [],
            appState: {
              ...switchDefaults,
              name: projectTitle,
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

  // Listen for external import events (from drag-and-drop or Open dialog)
  useEffect(() => {
    const handler = async (e: Event) => {
      const projectId = (e as CustomEvent).detail?.projectId;
      if (projectId) {
        // Refresh index from server to include the newly imported project
        const newIndex = await api.getIndex();
        indexRef.current = newIndex;
        setIndex(newIndex);
        // Switch to the imported project
        handleSelectProject(projectId);
      }
    };
    window.addEventListener("excalidraw-import-project", handler);
    return () => {
      window.removeEventListener("excalidraw-import-project", handler);
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
    if (saveTrigger === 0) {
      return;
    } // Skip initial render
    if (saveTrigger === lastProcessedSaveTriggerRef.current) {
      return;
    } // Already handled

    if (isLoading) {
      // Store for later when loading completes
      pendingSaveTriggerRef.current = saveTrigger;
      return;
    }

    lastProcessedSaveTriggerRef.current = saveTrigger;
    // Reset atom so remounts don't re-fire this stale trigger
    setSaveTrigger(0);

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
          const activeCard = contentRef.current?.querySelector(
            ".ProjectCard--active",
          );
          if (activeCard) {
            activeCard.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 100);
      });
    }
  }, [
    saveTrigger,
    index.currentProjectId,
    app.state.name,
    isLoading,
    saveCurrentProject,
  ]);

  // Handle pending save trigger after loading completes
  useEffect(() => {
    if (!isLoading && pendingSaveTriggerRef.current > 0) {
      lastProcessedSaveTriggerRef.current = pendingSaveTriggerRef.current;
      pendingSaveTriggerRef.current = 0;
      setSaveTrigger(0);

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
            const activeCard = contentRef.current?.querySelector(
              ".ProjectCard--active",
            );
            if (activeCard) {
              activeCard.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }
          }, 100);
        });
      }
    }
  }, [isLoading, index.currentProjectId, app.state.name, saveCurrentProject]);

  // Handle external "new project" trigger (from main menu → same flow as sidebar button)
  useEffect(() => {
    if (newProjectTrigger === 0) {
      return;
    }
    if (isLoading) {
      return;
    }
    // Reset atom so remounts don't re-fire this stale trigger
    setNewProjectTrigger(0);
    handleNewProjectClick();
  }, [newProjectTrigger, isLoading, handleNewProjectClick, setNewProjectTrigger]);

  // Delete project
  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      const isCurrentProject = index.currentProjectId === projectId;

      // Cancel any pending auto-save BEFORE deleting to prevent folder resurrection
      if (isCurrentProject) {
        ProjectManagerData.beginProjectSwitch();
      }

      try {
        await api.deleteProject(projectId);

        const newIndex: ProjectsIndex = {
          ...index,
          projects: index.projects.filter((p) => p.id !== projectId),
          currentProjectId: isCurrentProject ? null : index.currentProjectId,
        };

        // Sync cachedIndex BEFORE canvas clear to prevent stale saves
        ProjectManagerData.updateCachedIndex(newIndex);
        setIndex(newIndex);
        await api.saveIndex(newIndex);

        // If we deleted the current project, reset to a blank unsaved canvas
        // and clear localStorage so stale data doesn't resurface on reload
        if (isCurrentProject) {
          try {
            localStorage.removeItem("excalidraw");
            localStorage.removeItem("excalidraw-state");
          } catch {
            // noop
          }
          app.imageCache.clear();
          const defaults = getDefaultAppState();
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
              majorGridEnabled: app.state.majorGridEnabled,
              minorGridEnabled: app.state.minorGridEnabled,
              viewBackgroundColor: app.state.viewBackgroundColor,
              name: "",
            },
            replaceFiles: true,
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          });
        }
      } finally {
        if (isCurrentProject) {
          ProjectManagerData.endProjectSwitch();
        }
      }
    },
    [app, index],
  );

  // Move project to group (metadata-only — no filesystem changes)
  const handleMoveToGroup = useCallback(
    async (projectId: string, newGroupId: string | null) => {
      const project = index.projects.find((p) => p.id === projectId);
      if (!project) {
        return;
      }

      const newIndex: ProjectsIndex = {
        ...index,
        projects: index.projects.map((p) =>
          p.id === projectId
            ? { ...p, groupId: newGroupId, updatedAt: Date.now() }
            : p,
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

  // Rename group (metadata-only — no filesystem changes)
  const handleRenameGroup = useCallback(
    async (groupId: string, newName: string) => {
      const group = index.groups.find((g) => g.id === groupId);
      if (!group) {
        return;
      }

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

  // Delete group (metadata-only — projects stay on disk, just ungrouped)
  const handleDeleteGroup = useCallback(
    async (groupId: string) => {
      const group = index.groups.find((g) => g.id === groupId);
      if (!group) {
        return;
      }

      // Move projects to uncategorized and assign proper order values
      const currentUncategorized = index.projects.filter(
        (p) => p.groupId === null,
      );
      const maxUncatOrder = Math.max(
        0,
        ...currentUncategorized.map((p) => p.order ?? 0),
      );
      let nextOrder = maxUncatOrder + 1;

      const newProjects = index.projects.map((p) => {
        if (p.groupId === groupId) {
          return { ...p, groupId: null, order: nextOrder++ };
        }
        return p;
      });

      const newIndex: ProjectsIndex = {
        ...index,
        groups: index.groups.filter((g) => g.id !== groupId),
        projects: newProjects,
      };

      // If viewing the deleted category, reset to "all"
      if (activeFilter === groupId) {
        setActiveFilter("all");
      }

      setIndex(newIndex);
      indexRef.current = newIndex;
      await api.saveIndex(newIndex);
    },
    [index, activeFilter],
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
            p.id === projectId
              ? { ...p, hasCustomPreview: true, updatedAt: Date.now() }
              : p,
          ),
        };
        // Sync all caches synchronously so the auto-save preview generator
        // sees hasCustomPreview immediately (before React re-renders)
        indexRef.current = newIndex;
        ProjectManagerData.updateCachedIndex(newIndex);
        setIndex(newIndex);
        await api.saveIndex(newIndex);

        // Clear variant cache — custom previews use preview.png directly via getPreviewUrl
        setPreviewCache((prev) => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
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
          p.id === projectId
            ? { ...p, hasCustomPreview: false, updatedAt: Date.now() }
            : p,
        ),
      };
      // Sync all caches synchronously so the auto-save preview generator
      // sees hasCustomPreview: false immediately
      indexRef.current = newIndex;
      ProjectManagerData.updateCachedIndex(newIndex);
      setIndex(newIndex);
      await api.saveIndex(newIndex);

      // Regenerate preview from canvas (both variants)
      const previewResult = await generatePreview();
      if (previewResult) {
        // Optimistic: show both data URLs immediately
        setPreviewCache((prev) => ({
          ...prev,
          [projectId]: { dark: previewResult.dark.dataUrl, light: previewResult.light.dataUrl },
        }));
        // Background: save both to disk in parallel
        Promise.all([
          api.savePreview(projectId, previewResult.dark.blob, "dark"),
          api.savePreview(projectId, previewResult.light.blob, "light"),
        ]).then(([darkUrl, lightUrl]) => {
          const t = Date.now();
          setPreviewCache((prev) => ({
            ...prev,
            [projectId]: {
              dark: darkUrl ? `${darkUrl}?t=${t}` : prev[projectId]?.dark ?? "",
              light: lightUrl ? `${lightUrl}?t=${t}` : prev[projectId]?.light ?? "",
            },
          }));
        });
      }
    },
    [index, generatePreview],
  );

  // Toggle favorite status
  const handleToggleFavorite = useCallback(
    async (projectId: string) => {
      const project = index.projects.find((p) => p.id === projectId);
      if (!project) {
        return;
      }

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

  // (click-outside for settings dropdown handled by DropdownMenu component)

  // Export current project as zip
  const handleExportProject = useCallback(async () => {
    if (!index.currentProjectId) {
      return;
    }

    setSettingsOpen(false);
    setIsExporting(true);

    try {
      const response = await fetch(
        `/api/projects/${index.currentProjectId}/export`,
        {
          method: "POST",
        },
      );

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
  const handleImportFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }

      // Reset input for re-selection
      e.target.value = "";

      const isImage =
        file.type === MIME_TYPES.png ||
        file.type === MIME_TYPES.svg ||
        file.name.endsWith(".png") ||
        file.name.endsWith(".svg");

      if (
        !file.name.endsWith(".zip") &&
        !file.name.endsWith(".excalidraw") &&
        !file.name.endsWith(".json") &&
        !isImage
      ) {
        setImportError(
          "Please select a .zip, .excalidraw, .json, .png, or .svg file",
        );
        return;
      }

      setIsImporting(true);
      setImportError(null);

      try {
        // For PNG/SVG files, extract embedded scene data client-side first
        let fileToSend: File | Blob = file;
        let filenameToSend = file.name;

        if (isImage) {
          const ret = await loadSceneOrLibraryFromBlob(file, null, null);
          if (ret.type !== MIME_TYPES.excalidraw) {
            throw new Error("Image doesn't contain Excalidraw scene data");
          }
          // Re-serialize as JSON for the server
          const jsonData = JSON.stringify({
            type: "excalidraw",
            version: 2,
            elements: ret.data.elements,
            appState: ret.data.appState,
            files: ret.data.files,
          });
          filenameToSend = file.name.replace(/\.(png|svg)$/i, ".excalidraw");
          fileToSend = new File([jsonData], filenameToSend, {
            type: "application/json",
          });
        }

        const response = await fetch(
          `/api/projects/import?filename=${encodeURIComponent(filenameToSend)}`,
          {
            method: "POST",
            body: fileToSend,
          },
        );

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
    },
    [],
  );

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

      // Nuke all client-side caches: pending saves, cachedIndex, localStorage
      ProjectManagerData.resetAll();

      // Clear the canvas
      const resetDefaults = getDefaultAppState();
      app.syncActionResult({
        elements: [],
        appState: {
          ...resetDefaults,
          name: "",
          viewBackgroundColor: app.state.viewBackgroundColor,
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      // Refresh the project list (should be empty now) and sync cache
      const newIndex = await api.getIndex();
      ProjectManagerData.updateCachedIndex(newIndex);
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
  const favoriteProjects = sortProjects(
    index.projects.filter((p) => p.isFavorite),
    "favoriteOrder",
  );
  const ungroupedProjects = sortProjects(
    index.projects.filter((p) => p.groupId === null),
  );
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
          <div className="ProjectManager__settings">
            <DropdownMenu open={settingsOpen}>
              <DropdownMenu.Trigger
                onToggle={() => setSettingsOpen(!settingsOpen)}
              >
                {DotsIcon}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content
                onClickOutside={() => setSettingsOpen(false)}
                onSelect={() => setSettingsOpen(false)}
                style={{ right: 0, left: "auto" }}
              >
                <DropdownMenu.Item
                  onSelect={handleExportProject}
                  icon={ExportIcon}
                  disabled={!index.currentProjectId || isExporting}
                >
                  {isExporting ? "Exporting..." : "Export Project"}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={handleImportClick}
                  icon={LoadIcon}
                  title="Import a project .zip or .excalidraw json file"
                >
                  Import Project
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  onSelect={handleResetClick}
                  icon={TrashIcon}
                >
                  Reset Project Manager
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {hasUnsavedCanvas && (
        <div className="ProjectManager__unsavedBanner">
          <span>Unsaved canvas</span>
          <button onClick={handleSaveCurrentClick}>Save</button>
        </div>
      )}

      <div className="ProjectManager__actions">
        <button
          className="ProjectManager__actionBtn"
          onClick={handleNewProjectClick}
        >
          <span style={{ fontSize: "1.2rem", lineHeight: 1, position: "relative", top: "1px" }}>+</span>
          {t("projectManager.newProject")}
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
            <p
              style={{ marginBottom: "1rem", color: "var(--color-on-surface)" }}
            >
              You have unsaved changes. Would you like to save them before
              creating a new project?
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
      {(modalType === "project" ||
        modalType === "save" ||
        modalType === "group" ||
        modalType === "rename-project") && (
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
              <label
                htmlFor="project-name-input"
                className="ProjectManager__dialog__label"
              >
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
                  modalType === "group"
                    ? "Enter category name"
                    : "Enter project name"
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
                label={
                  modalType === "save"
                    ? "Save"
                    : modalType === "rename-project"
                    ? "Rename"
                    : "Create"
                }
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
            <p
              style={{ marginBottom: "1rem", color: "var(--color-on-surface)" }}
            >
              Select a project .zip, .excalidraw, .json, or image file (.png,
              .svg with embedded data) to import. The project will be added to
              your Uncategorized folder.
            </p>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip,.excalidraw,.json,.png,.svg"
              onChange={handleImportFileSelect}
              style={{ display: "none" }}
            />
            {importError && (
              <div className="ProjectManager__dialog__error">{importError}</div>
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
                onClick={
                  isImporting
                    ? undefined
                    : () => importInputRef.current?.click()
                }
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
            <p
              style={{
                color: "var(--color-on-surface)",
                marginBottom: "0.5rem",
              }}
            >
              This will permanently delete <strong>all projects</strong> and
              their assets (including videos).
            </p>
            {projectsPath && (
              <div className="ProjectManager__dialog__path">
                <span>Projects location:</span>
                <code>{projectsPath}</code>
              </div>
            )}
            <div className="ProjectManager__dialog__inputGroup">
              <label
                htmlFor="reset-confirm-input"
                className="ProjectManager__dialog__label"
              >
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
                onClick={
                  isResetting || resetConfirmText !== "CONFIRM"
                    ? undefined
                    : handleResetConfirm
                }
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
            onNavigateToCategory: (categoryId: string) =>
              setActiveFilter(categoryId),
            availableGroups,
            getPreviewUrl,
            onReorderProjects: handleReorderProjects,
          };

          if (activeFilter === "favorites") {
            // Show only favorites in a flat grid with drag-to-reorder
            return (
              <TabSortableGrid
                projects={favoriteProjects}
                orderKey="favoriteOrder"
                currentProjectId={index.currentProjectId}
                justSavedId={justSavedId}
                cardSize={cardSize}
                groups={index.groups}
                availableGroups={availableGroups}
                getPreviewUrl={getPreviewUrl}
                onSelectProject={handleSelectProject}
                onOpenInNewTab={handleOpenInNewTab}
                onOpenFileLocation={handleOpenFileLocation}
                onRenameProject={handleRenameProject}
                onDeleteProject={handleDeleteProject}
                onMoveToGroup={handleMoveToGroup}
                onSetCustomPreview={handleSetCustomPreview}
                onRemoveCustomPreview={handleRemoveCustomPreview}
                onToggleFavorite={handleToggleFavorite}
                onCreateCategory={handleCreateCategory}
                onReorderProjects={handleReorderProjects}
                emptyMessage="No favorite projects yet"
              />
            );
          }

          if (activeFilter === "uncategorized") {
            // Show only uncategorized projects in a flat grid with drag-to-reorder
            return (
              <TabSortableGrid
                projects={ungroupedProjects}
                orderKey="order"
                currentProjectId={index.currentProjectId}
                justSavedId={justSavedId}
                cardSize={cardSize}
                groups={index.groups}
                availableGroups={availableGroups}
                getPreviewUrl={getPreviewUrl}
                onSelectProject={handleSelectProject}
                onOpenInNewTab={handleOpenInNewTab}
                onOpenFileLocation={handleOpenFileLocation}
                onRenameProject={handleRenameProject}
                onDeleteProject={handleDeleteProject}
                onMoveToGroup={handleMoveToGroup}
                onSetCustomPreview={handleSetCustomPreview}
                onRemoveCustomPreview={handleRemoveCustomPreview}
                onToggleFavorite={handleToggleFavorite}
                onCreateCategory={handleCreateCategory}
                onReorderProjects={handleReorderProjects}
                emptyMessage="No uncategorized projects"
              />
            );
          }

          if (activeFilter !== "all") {
            // Filter by specific category with drag-to-reorder
            const filtered = sortProjects(
              index.projects.filter((p) => p.groupId === activeFilter),
            );
            return (
              <TabSortableGrid
                projects={filtered}
                orderKey="order"
                currentProjectId={index.currentProjectId}
                justSavedId={justSavedId}
                cardSize={cardSize}
                groups={index.groups}
                availableGroups={availableGroups}
                getPreviewUrl={getPreviewUrl}
                onSelectProject={handleSelectProject}
                onOpenInNewTab={handleOpenInNewTab}
                onOpenFileLocation={handleOpenFileLocation}
                onRenameProject={handleRenameProject}
                onDeleteProject={handleDeleteProject}
                onMoveToGroup={handleMoveToGroup}
                onSetCustomPreview={handleSetCustomPreview}
                onRemoveCustomPreview={handleRemoveCustomPreview}
                onToggleFavorite={handleToggleFavorite}
                onCreateCategory={handleCreateCategory}
                onReorderProjects={handleReorderProjects}
                emptyMessage="No projects in this category"
              />
            );
          }

          // "All" view — single DndContext for cross-section card
          // moves + group header reordering
          const sortedGroups = [...index.groups].sort(
            (a, b) => a.order - b.order,
          );
          const sortedGroupIds = sortedGroups.map(
            (g) => `group:${g.id}`,
          );

          // Is a favorites card being dragged? (can't leave favorites)
          const isFavDrag = allViewDragId?.startsWith("fav:") ?? false;

          // Compute which section should show the drop target highlight.
          // We track the `over` target and resolve its section, then
          // highlight that section during cross-section card drags.
          let highlightSection: string | null | undefined; // undefined = none
          if (allViewDragId && allViewOverId && !isFavDrag) {
            const dragProjectId = allViewDragId.replace(/^(fav:|card:)/, "");
            const dragProject = index.projects.find((p) => p.id === dragProjectId);
            // Resolve the section the over target belongs to
            let overSection: string | null | undefined;
            if (allViewOverId.startsWith("card:")) {
              const oPid = allViewOverId.replace("card:", "");
              const oP = index.projects.find((p) => p.id === oPid);
              if (oP) overSection = oP.groupId; // null = uncategorized
            } else if (allViewOverId.startsWith("fav:")) {
              overSection = "favorites";
            } else if (allViewOverId.startsWith("header:")) {
              const hId = allViewOverId.replace("header:", "");
              overSection = hId === "uncategorized" ? null : hId;
            } else if (allViewOverId.startsWith("group:")) {
              overSection = allViewOverId.replace("group:", "");
            }
            // Only highlight on cross-section drags
            if (
              overSection !== undefined &&
              dragProject &&
              overSection !== dragProject.groupId
            ) {
              highlightSection = overSection;
            }
          }

          // Determine what's being dragged for the DragOverlay
          const draggedGroupId = allViewDragId?.startsWith("group:")
            ? allViewDragId.replace("group:", "")
            : null;
          const draggedCardId = allViewDragId?.startsWith("card:") || allViewDragId?.startsWith("fav:")
            ? allViewDragId.replace(/^(fav:|card:)/, "")
            : null;
          const draggedProject = draggedCardId
            ? index.projects.find((p) => p.id === draggedCardId)
            : null;
          const draggedGroup = draggedGroupId
            ? index.groups.find((g) => g.id === draggedGroupId)
            : null;

          return (
            <DndContext
              sensors={allViewSensors}
              collisionDetection={closestCenter}
              onDragStart={handleAllDragStart}
              onDragOver={handleAllDragOver}
              onDragEnd={handleAllDragEnd}
              onDragCancel={handleAllDragCancel}
              autoScroll={{
                enabled: true,
                threshold: { x: 0, y: 0.15 },
                acceleration: 10,
              }}
            >
              {/* Favorites section */}
              {favoriteProjects.length > 0 && (
                <ProjectGroup
                  group={null}
                  sectionId="favorites"
                  label="Favorites"
                  icon="star"
                  projects={favoriteProjects}
                  externalDrag
                  sortableIdPrefix="fav:"
                  disableDropTarget={isFavDrag}
                  highlighted={highlightSection === "favorites"}
                  {...groupSharedProps}
                />
              )}

              {/* Uncategorized — pinned after favorites */}
              <ProjectGroup
                group={null}
                sectionId="uncategorized"
                projects={ungroupedProjects}
                externalDrag
                sortableIdPrefix="card:"
                dimmed={isFavDrag}
                highlighted={highlightSection === null}
                {...groupSharedProps}
              />

              {/* Named groups — sortable headers + sortable cards */}
              <SortableContext
                items={sortedGroupIds}
                strategy={verticalListSortingStrategy}
              >
                {sortedGroups.map((group) => {
                  const gProjects = sortProjects(
                    index.projects.filter(
                      (p) => p.groupId === group.id,
                    ),
                  );
                  return (
                    <SortableGroupItem
                      key={group.id}
                      group={group}
                      groupProjects={gProjects}
                      isBeingDragged={draggedGroupId === group.id}
                      groupSharedProps={groupSharedProps}
                      externalDrag
                      dimmed={isFavDrag}
                      highlighted={highlightSection === group.id}
                    />
                  );
                })}
              </SortableContext>

              {/* Unified DragOverlay — shows card or group ghost */}
              <DragOverlay dropAnimation={null}>
                {draggedProject ? (
                  <DragOverlayCard
                    project={draggedProject}
                    previewUrl={getPreviewUrl(draggedProject.id)}
                    size={cardSize}
                  />
                ) : draggedGroup ? (
                  <DragOverlayGroupHeader
                    group={draggedGroup}
                    projectCount={
                      index.projects.filter(
                        (p) => p.groupId === draggedGroup.id,
                      ).length
                    }
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
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

      {index.projects.length > 0 && (
        <div className="ProjectManager__zoomControls">
          <button
            className="ProjectManager__zoomBtn"
            onClick={handleZoomOut}
            disabled={cardSize <= MIN_CARD_SIZE}
            title="Zoom out"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            className="ProjectManager__zoomBtn"
            onClick={handleZoomIn}
            disabled={cardSize >= MAX_CARD_SIZE}
            title="Zoom in"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};
