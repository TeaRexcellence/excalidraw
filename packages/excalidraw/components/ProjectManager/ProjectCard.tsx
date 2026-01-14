import React, { useCallback, useState } from "react";
import type { Project } from "./types";

interface ProjectCardProps {
  project: Project;
  isActive: boolean;
  previewUrl: string | null;
  size: number;
  onSelect: (projectId: string) => void;
  onOpenInNewTab: (projectId: string) => void;
  onOpenFileLocation: (projectId: string) => void;
  onRename: (projectId: string, newTitle: string) => void;
  onDelete: (projectId: string) => void;
  onMoveToGroup: (projectId: string, groupId: string | null) => void;
  availableGroups: Array<{ id: string; name: string }>;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isActive,
  previewUrl,
  size,
  onSelect,
  onOpenInNewTab,
  onOpenFileLocation,
  onRename,
  onDelete,
  onMoveToGroup,
  availableGroups,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(project.title);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

  const handleClick = useCallback(() => {
    if (!isEditing) {
      onSelect(project.id);
    }
  }, [isEditing, onSelect, project.id]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
      setShowContextMenu(true);
    },
    [],
  );

  const handleRenameSubmit = useCallback(() => {
    if (editTitle.trim() && editTitle !== project.title) {
      onRename(project.id, editTitle.trim());
    }
    setIsEditing(false);
  }, [editTitle, onRename, project.id, project.title]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleRenameSubmit();
      } else if (e.key === "Escape") {
        setEditTitle(project.title);
        setIsEditing(false);
      }
    },
    [handleRenameSubmit, project.title],
  );

  const closeContextMenu = useCallback(() => {
    setShowContextMenu(false);
  }, []);

  // Close context menu when clicking outside
  React.useEffect(() => {
    if (showContextMenu) {
      const handleClickOutside = () => setShowContextMenu(false);
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showContextMenu]);

  return (
    <>
      <div
        className={`ProjectCard ${isActive ? "ProjectCard--active" : ""}`}
        style={{ width: size, height: size + 30 }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <div
          className="ProjectCard__preview"
          style={{ width: size, height: size }}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={project.title}
              draggable={false}
              onError={(e) => {
                // Hide broken image, show placeholder instead
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove("ProjectCard__placeholder--hidden");
              }}
            />
          ) : null}
          <div className={`ProjectCard__placeholder ${previewUrl ? "ProjectCard__placeholder--hidden" : ""}`}>
            <span>No preview</span>
          </div>
        </div>
        <div className="ProjectCard__title">
          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleKeyDown}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span title={project.title}>{project.title}</span>
          )}
        </div>
      </div>

      {showContextMenu && (
        <div
          className="ProjectCard__contextMenu"
          style={{
            position: "fixed",
            left: contextMenuPos.x,
            top: contextMenuPos.y,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onOpenInNewTab(project.id);
              closeContextMenu();
            }}
          >
            Open in new tab
          </button>
          <button
            onClick={() => {
              setIsEditing(true);
              closeContextMenu();
            }}
          >
            Rename
          </button>
          <button
            onClick={() => {
              onOpenFileLocation(project.id);
              closeContextMenu();
            }}
          >
            Open file location
          </button>
          <div className="ProjectCard__contextMenu__divider" />
          <div className="ProjectCard__contextMenu__submenu">
            <span>Move to group</span>
            <div className="ProjectCard__contextMenu__submenu__items">
              <button
                onClick={() => {
                  onMoveToGroup(project.id, null);
                  closeContextMenu();
                }}
                className={project.groupId === null ? "active" : ""}
              >
                Ungrouped
              </button>
              {availableGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => {
                    onMoveToGroup(project.id, group.id);
                    closeContextMenu();
                  }}
                  className={project.groupId === group.id ? "active" : ""}
                >
                  {group.name}
                </button>
              ))}
            </div>
          </div>
          <div className="ProjectCard__contextMenu__divider" />
          <button
            className="ProjectCard__contextMenu__danger"
            onClick={() => {
              if (confirm(`Delete "${project.title}"?`)) {
                onDelete(project.id);
              }
              closeContextMenu();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
};
