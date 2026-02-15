import React, { useCallback, useEffect, useState } from "react";

import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";

import { ProjectCard } from "./ProjectCard";

import type {
  Project,
  ProjectGroup as ProjectGroupType,
} from "./types";

type SectionId = "favorites" | "uncategorized" | string;

const COLLAPSE_STORAGE_KEY = "excalidraw-projectgroup-collapsed";

const getCollapsedSections = (): Set<string> => {
  try {
    const stored = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const setCollapsedSection = (id: string, collapsed: boolean) => {
  try {
    const sections = getCollapsedSections();
    if (collapsed) {
      sections.add(id);
    } else {
      sections.delete(id);
    }
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...sections]));
  } catch {
    // ignore storage errors
  }
};

// ─── Sortable card wrapper ──────────────────────────────────────

export const SortableProjectCard: React.FC<{
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
    zIndex: isDragging ? 1 : "auto" as any,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
};

// ─── Drag overlay card ──────────────────────────────────────────

export const DragOverlayCard: React.FC<{
  project: Project;
  previewUrl: string | null;
  size: number;
}> = ({ project, previewUrl, size }) => (
  <div
    className="ProjectCard ProjectCard--drag-overlay"
    style={{ width: size, height: size + 30 }}
  >
    <div
      className="ProjectCard__preview"
      style={{ width: size, height: size }}
    >
      {previewUrl ? (
        <img src={previewUrl} alt={project.title} draggable={false} />
      ) : (
        <div className="ProjectCard__placeholder">
          <span>(EMPTY)</span>
        </div>
      )}
    </div>
    <div className="ProjectCard__info">
      <div className="ProjectCard__title">
        <span>{project.title}</span>
      </div>
    </div>
  </div>
);

// ─── Props ──────────────────────────────────────────────────────

interface ProjectGroupProps {
  group: ProjectGroupType | null; // null for "Ungrouped"
  sectionId?: SectionId; // "favorites", "uncategorized", or group id
  projects: Project[];
  currentProjectId: string | null;
  justSavedId: string | null;
  cardSize: number;
  allGroups: ProjectGroupType[]; // all groups for CategoryPicker
  onToggleExpand: (groupId: string) => void;
  onRenameGroup: (groupId: string, newName: string) => void;
  onDeleteGroup: (groupId: string) => void;
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
  onNavigateToCategory: (categoryId: string) => void;
  availableGroups: Array<{ id: string; name: string }>;
  getPreviewUrl: (projectId: string) => string | null;
  label?: string; // custom label override (e.g. "★ Favorites")
  icon?: string; // optional icon before label
  dragHandleProps?: Record<string, any>;
  forceCollapsed?: boolean;
  onReorderProjects?: (
    orderedIds: string[],
    orderKey: "order" | "favoriteOrder",
  ) => void;
  // ── External drag mode (for "All" page single DndContext) ──
  externalDrag?: boolean; // if true, skip internal DndContext; parent provides it
  sortableIdPrefix?: string; // prefix for sortable IDs (e.g. "fav:" or "card:")
  // ── Drop target ref from parent (for named groups) ──
  dropRef?: (node: HTMLElement | null) => void;
  isDropTarget?: boolean;
  // ── Visual dimming (e.g. during favorites drag) ──
  dimmed?: boolean;
  disableDropTarget?: boolean;
}

export const ProjectGroup: React.FC<ProjectGroupProps> = ({
  group,
  sectionId,
  projects,
  currentProjectId,
  justSavedId,
  cardSize,
  allGroups,
  onToggleExpand,
  onRenameGroup,
  onDeleteGroup,
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
  onNavigateToCategory,
  availableGroups,
  getPreviewUrl,
  label,
  icon,
  dragHandleProps,
  forceCollapsed,
  onReorderProjects,
  externalDrag,
  sortableIdPrefix = "",
  dropRef: externalDropRef,
  isDropTarget: externalIsDropTarget,
  dimmed,
  disableDropTarget,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group?.name || "");

  const isUngrouped = group === null && sectionId === "uncategorized";
  const isFavorites = sectionId === "favorites";
  const isSpecialSection = isUngrouped || isFavorites;

  const effectiveId = sectionId || group?.id || "uncategorized";
  const orderKey = isFavorites ? "favoriteOrder" : "order";

  const [localExpanded, setLocalExpanded] = useState(() => {
    if (isSpecialSection) {
      return !getCollapsedSections().has(effectiveId);
    }
    return true;
  });

  const isExpanded = forceCollapsed
    ? false
    : isSpecialSection
      ? localExpanded
      : group?.expanded ?? true;

  const handleToggle = useCallback(() => {
    if (isSpecialSection) {
      setLocalExpanded((prev) => {
        const next = !prev;
        setCollapsedSection(effectiveId, !next);
        return next;
      });
    } else if (group) {
      onToggleExpand(group.id);
    }
  }, [isSpecialSection, effectiveId, group, onToggleExpand]);

  const handleRenameSubmit = useCallback(() => {
    if (group && editName.trim() && editName !== group.name) {
      onRenameGroup(group.id, editName.trim());
    }
    setIsEditing(false);
  }, [editName, group, onRenameGroup]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleRenameSubmit();
      } else if (e.key === "Escape") {
        setEditName(group?.name || "");
        setIsEditing(false);
      }
    },
    [group?.name, handleRenameSubmit],
  );

  // ─── Droppable header (for external drag mode) ────────────

  // Always call the hook (React rules), but disable when not in external mode
  // For special sections (favorites, uncategorized), the header is a drop target
  // For named groups, the SortableGroupItem wrapper provides droppability
  const needsDroppable = !!externalDrag && isSpecialSection && !dimmed && !disableDropTarget;
  const { setNodeRef: setDroppableRef, isOver: isHeaderOver } = useDroppable({
    id: `header:${effectiveId}`,
    disabled: !needsDroppable,
  });

  // ─── Card drag-and-drop (internal mode only) ──────────────

  const [activeDragProjectId, setActiveDragProjectId] = useState<
    string | null
  >(null);

  const cardSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleCardDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragProjectId(event.active.id as string);
  }, []);

  const handleCardDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragProjectId(null);

      if (!over || active.id === over.id || !onReorderProjects) {
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

  const handleCardDragCancel = useCallback(() => {
    setActiveDragProjectId(null);
  }, []);

  // Only hide special sections when empty; named groups always show so they can be reordered
  if (projects.length === 0 && isSpecialSection) {
    return null;
  }

  const displayLabel =
    label || (isUngrouped ? "Uncategorized" : group?.name || "");

  // Use prefixed IDs for sortable items when in external drag mode
  const sortableIds = projects.map((p) => `${sortableIdPrefix}${p.id}`);
  // Internal mode uses plain project IDs
  const internalIds = projects.map((p) => p.id);

  const dragProject = activeDragProjectId
    ? projects.find((p) => p.id === activeDragProjectId)
    : null;

  // ── Shared grid content ──────────────────────────────────

  const renderGrid = (ids: string[], idPrefix: string) => (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      <div className="ProjectGroup__grid">
        {projects.map((project) => (
          <SortableProjectCard
            key={project.id}
            id={`${idPrefix}${project.id}`}
          >
            <ProjectCard
              project={project}
              isActive={project.id === currentProjectId}
              justSaved={project.id === justSavedId}
              previewUrl={getPreviewUrl(project.id)}
              size={cardSize}
              groups={allGroups}
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
          </SortableProjectCard>
        ))}
      </div>
    </SortableContext>
  );

  const isDropTargetActive =
    (needsDroppable && isHeaderOver) || !!externalIsDropTarget;

  // Combine droppable refs on the wrapper so the entire section is a drop target
  const wrapperRef = (node: HTMLElement | null) => {
    if (needsDroppable) {
      setDroppableRef(node);
    }
    if (externalDropRef) {
      externalDropRef(node);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={`ProjectGroup${isDropTargetActive ? " ProjectGroup--drop-target" : ""}${dimmed ? " ProjectGroup--dimmed" : ""}`}
    >
      <div
        className={`ProjectGroup__header${dragHandleProps ? " ProjectGroup__header--draggable" : ""}`}
        onClick={handleToggle}
        {...(dragHandleProps || {})}
      >
        <div className="ProjectGroup__header__left">
          <span
            className={`ProjectGroup__chevron ${isExpanded ? "expanded" : ""}`}
          >
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
          {isEditing && group ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleKeyDown}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              className="ProjectGroup__nameInput"
            />
          ) : (
            <span className="ProjectGroup__name">
              {icon === "star" ? (
                <svg
                  className="ProjectGroup__icon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ) : icon ? (
                <span className="ProjectGroup__icon">{icon}</span>
              ) : null}
              {displayLabel}
            </span>
          )}
          <span className="ProjectGroup__count">{projects.length}</span>
        </div>
        {!isSpecialSection && group && (
          <div className="ProjectGroup__header__actions">
            <button
              className="ProjectGroup__action"
              onClick={(e) => {
                e.stopPropagation();
                setEditName(group.name);
                setIsEditing(true);
              }}
              title="Rename category"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </button>
            <button
              className="ProjectGroup__action ProjectGroup__action--danger"
              onClick={(e) => {
                e.stopPropagation();
                if (
                  confirm(
                    `Delete category "${group.name}"? Projects will be moved to Uncategorized.`,
                  )
                ) {
                  onDeleteGroup(group.id);
                }
              }}
              title="Delete category"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
            <button
              className="ProjectGroup__action ProjectGroup__action--navigate"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToCategory(group.id);
              }}
              title="Go to category"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {isExpanded && externalDrag && projects.length > 0 &&
        renderGrid(sortableIds, sortableIdPrefix)}

      {isExpanded && externalDrag && projects.length === 0 && (
        <div className="ProjectGroup__empty-drop-zone">
          Drop projects here
        </div>
      )}

      {isExpanded && !externalDrag && (
        <DndContext
          sensors={cardSensors}
          collisionDetection={closestCenter}
          onDragStart={handleCardDragStart}
          onDragEnd={handleCardDragEnd}
          onDragCancel={handleCardDragCancel}
        >
          {renderGrid(internalIds, "")}

          <DragOverlay dropAnimation={null}>
            {dragProject ? (
              <DragOverlayCard
                project={dragProject}
                previewUrl={getPreviewUrl(dragProject.id)}
                size={cardSize}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
};
