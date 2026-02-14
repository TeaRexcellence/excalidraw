import React, { useCallback, useRef, useState, useEffect } from "react";
import type { Project, ProjectGroup } from "./types";
import { CategoryPicker } from "./CategoryPicker";

interface ProjectCardProps {
  project: Project;
  isActive: boolean;
  justSaved: boolean;
  previewUrl: string | null;
  size: number;
  groups: ProjectGroup[];
  onSelect: (projectId: string) => void;
  onOpenInNewTab: (projectId: string) => void;
  onOpenFileLocation: (projectId: string) => void;
  onRename: (projectId: string) => void;
  onDelete: (projectId: string) => void;
  onMoveToGroup: (projectId: string, groupId: string | null) => void;
  onSetCustomPreview: (projectId: string, file: File) => void;
  onRemoveCustomPreview: (projectId: string) => void;
  onToggleFavorite: (projectId: string) => void;
  onCreateCategory: (name: string) => void;
  availableGroups: Array<{ id: string; name: string }>;
  showCategoryBadge?: boolean;
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
  onToggleFavorite,
  onCreateCategory,
  availableGroups,
  groups,
  showCategoryBadge,
}) => {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const tooltipTimeoutRef = useRef<number | null>(null);

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

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Hide tooltip and reset timer on any mouse movement
    setShowTooltip(false);
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }

    setTooltipPos({
      x: e.clientX,
      y: e.clientY - 10,
    });

    // Show tooltip after mouse stops moving
    tooltipTimeoutRef.current = window.setTimeout(() => {
      setShowTooltip(true);
    }, 500);
  }, []);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    setTooltipPos({
      x: e.clientX,
      y: e.clientY - 10,
    });
    // Delay showing tooltip
    tooltipTimeoutRef.current = window.setTimeout(() => {
      setShowTooltip(true);
    }, 500);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    setShowTooltip(false);
  }, []);

  const handleFavoriteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleFavorite(project.id);
    },
    [onToggleFavorite, project.id],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  // Close context menu when clicking outside or pressing Escape
  React.useEffect(() => {
    if (showContextMenu) {
      const handleClickOutside = () => setShowContextMenu(false);
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setShowContextMenu(false);
        }
      };
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("click", handleClickOutside);
        document.removeEventListener("keydown", handleEscape);
      };
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
        ref={cardRef}
        className={`ProjectCard ${isActive ? "ProjectCard--active" : ""} ${justSaved ? "ProjectCard--just-saved" : ""}`}
        style={{ width: size, height: size + 30 }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {justSaved && <div className="ProjectCard__savedBadge">Saved!</div>}
        <button
          className={`ProjectCard__favoriteBtn ${project.isFavorite ? "ProjectCard__favoriteBtn--active" : ""}`}
          onClick={handleFavoriteClick}
          title={project.isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={project.isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        </button>
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
          <div className="ProjectCard__gradient" />
        </div>
        <div className="ProjectCard__info">
          <div className="ProjectCard__title">
            <span title={project.title}>{project.title}</span>
          </div>
          {showCategoryBadge && project.groupId && (
            <div className="ProjectCard__badges">
              <span className="ProjectCard__badge">
                {groups.find((g) => g.id === project.groupId)?.name}
              </span>
            </div>
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
          <button
            onClick={() => {
              closeContextMenu();
              setShowCategoryPicker(true);
            }}
          >
            Manage categories
          </button>
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

      {showCategoryPicker && (
        <CategoryPicker
          projectId={project.id}
          currentGroupId={project.groupId}
          groups={groups}
          onMoveToGroup={onMoveToGroup}
          onCreateCategory={onCreateCategory}
          onClose={() => setShowCategoryPicker(false)}
        />
      )}

      {showTooltip && (
        <div
          className="ProjectCard__tooltip"
          style={{
            position: "fixed",
            left: tooltipPos.x + 12,
            top: tooltipPos.y,
            transform: "translateY(-100%)",
            zIndex: 10000,
          }}
        >
          {project.title}
        </div>
      )}
    </>
  );
};
