import React, { useCallback, useState } from "react";
import type { Project, ProjectGroup as ProjectGroupType } from "./types";
import { ProjectCard } from "./ProjectCard";

interface ProjectGroupProps {
  group: ProjectGroupType | null; // null for "Ungrouped"
  projects: Project[];
  currentProjectId: string | null;
  justSavedId: string | null;
  cardSize: number;
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
  availableGroups: Array<{ id: string; name: string }>;
  getPreviewUrl: (projectId: string) => string | null;
}

export const ProjectGroup: React.FC<ProjectGroupProps> = ({
  group,
  projects,
  currentProjectId,
  justSavedId,
  cardSize,
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
  availableGroups,
  getPreviewUrl,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(group?.name || "");

  const isExpanded = group?.expanded ?? true;
  const isUngrouped = group === null;

  const handleToggle = useCallback(() => {
    if (group) {
      onToggleExpand(group.id);
    }
  }, [group, onToggleExpand]);

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

  if (projects.length === 0 && isUngrouped) {
    return null;
  }

  return (
    <div className="ProjectGroup">
      <div
        className={`ProjectGroup__header ${isUngrouped ? "ProjectGroup__header--ungrouped" : ""}`}
        onClick={handleToggle}
      >
        <div className="ProjectGroup__header__left">
          {!isUngrouped && (
            <span className={`ProjectGroup__chevron ${isExpanded ? "expanded" : ""}`}>
              ▶
            </span>
          )}
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
              {isUngrouped ? "Uncategorized" : group?.name}
            </span>
          )}
          <span className="ProjectGroup__count">({projects.length})</span>
        </div>
        {!isUngrouped && group && (
          <div className="ProjectGroup__header__actions">
            <button
              className="ProjectGroup__action"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              title="Rename category"
            >
              ✏️
            </button>
            <button
              className="ProjectGroup__action ProjectGroup__action--danger"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete category "${group.name}"? Projects will be moved to Uncategorized.`)) {
                  onDeleteGroup(group.id);
                }
              }}
              title="Delete category"
            >
              🗑️
            </button>
          </div>
        )}
      </div>

      {(isExpanded || isUngrouped) && (
        <div className="ProjectGroup__grid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isActive={project.id === currentProjectId}
              justSaved={project.id === justSavedId}
              previewUrl={getPreviewUrl(project.id)}
              size={cardSize}
              onSelect={onSelectProject}
              onOpenInNewTab={onOpenInNewTab}
              onOpenFileLocation={onOpenFileLocation}
              onRename={onRenameProject}
              onDelete={onDeleteProject}
              onMoveToGroup={onMoveToGroup}
              onSetCustomPreview={onSetCustomPreview}
              onRemoveCustomPreview={onRemoveCustomPreview}
              onToggleFavorite={onToggleFavorite}
              availableGroups={availableGroups}
            />
          ))}
        </div>
      )}
    </div>
  );
};
