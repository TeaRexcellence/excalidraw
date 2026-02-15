import React, { useCallback, useEffect, useState } from "react";

import { ProjectCard } from "./ProjectCard";

import type { Project, ProjectGroup as ProjectGroupType } from "./types";

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
  showCategoryBadge?: boolean;
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
  showCategoryBadge,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group?.name || "");

  const isUngrouped = group === null && sectionId === "uncategorized";
  const isFavorites = sectionId === "favorites";
  const isSpecialSection = isUngrouped || isFavorites;

  const effectiveId = sectionId || group?.id || "uncategorized";

  const [localExpanded, setLocalExpanded] = useState(() => {
    if (isSpecialSection) {
      return !getCollapsedSections().has(effectiveId);
    }
    return true;
  });

  const isExpanded = isSpecialSection ? localExpanded : group?.expanded ?? true;

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

  if (projects.length === 0) {
    return null;
  }

  const displayLabel =
    label || (isUngrouped ? "Uncategorized" : group?.name || "");

  return (
    <div className="ProjectGroup">
      <div className="ProjectGroup__header" onClick={handleToggle}>
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

      {isExpanded && (
        <div className="ProjectGroup__grid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
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
              showCategoryBadge={showCategoryBadge}
            />
          ))}
        </div>
      )}
    </div>
  );
};
