import React, { useCallback, useRef, useState } from "react";
import type { Project } from "./types";

interface ProjectCardProps {
  project: Project;
  isActive: boolean;
  justSaved: boolean;
  previewUrl: string | null;
  size: number;
  onSelect: (projectId: string) => void;
  onOpenInNewTab: (projectId: string) => void;
  onOpenFileLocation: (projectId: string) => void;
  onRename: (projectId: string) => void;
  onDelete: (projectId: string) => void;
  onMoveToGroup: (projectId: string, groupId: string | null) => void;
  onSetCustomPreview: (projectId: string, file: File) => void;
  onRemoveCustomPreview: (projectId: string) => void;
  availableGroups: Array<{ id: string; name: string }>;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isActive,
  justSaved,
  previewUrl,
  size,
  onSelect,
  onOpenInNewTab,
  onOpenFileLocation,
  onRename,
  onDelete,
  onMoveToGroup,
  onSetCustomPreview,
  onRemoveCustomPreview,
  availableGroups,
}) => {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    onSelect(project.id);
  }, [onSelect, project.id]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
      setShowContextMenu(true);
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setShowContextMenu(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onSetCustomPreview(project.id, file);
      }
      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [onSetCustomPreview, project.id],
  );

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
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />
      <div
        className={`ProjectCard ${isActive ? "ProjectCard--active" : ""} ${justSaved ? "ProjectCard--just-saved" : ""}`}
        style={{ width: size, height: size + 30 }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {justSaved && <div className="ProjectCard__savedBadge">Saved!</div>}
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
          <span title={project.title}>{project.title}</span>
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
              onRename(project.id);
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
            Open project folder
          </button>
          <div className="ProjectCard__contextMenu__divider" />
          <button
            onClick={() => {
              fileInputRef.current?.click();
              closeContextMenu();
            }}
          >
            Set custom preview
          </button>
          {project.hasCustomPreview && (
            <button
              onClick={() => {
                onRemoveCustomPreview(project.id);
                closeContextMenu();
              }}
            >
              Remove custom preview
            </button>
          )}
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
