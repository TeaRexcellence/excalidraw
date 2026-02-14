import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectGroup } from "./types";

export type FilterType = "all" | "favorites" | string;

interface CategoryBarProps {
  groups: ProjectGroup[];
  activeFilter: FilterType;
  favoriteCount: number;
  uncategorizedCount: number;
  groupCounts: Record<string, number>;
  onFilterChange: (filter: FilterType) => void;
  onCreateCategory: (name: string) => void;
  onRenameCategory: (groupId: string, newName: string) => void;
  onDeleteCategory: (groupId: string) => void;
}

export const CategoryBar: React.FC<CategoryBarProps> = ({
  groups,
  activeFilter,
  favoriteCount,
  uncategorizedCount,
  groupCounts,
  onFilterChange,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    groupId: string;
    x: number;
    y: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus input when creating
  useEffect(() => {
    if (isCreating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreating]);

  // Focus input when editing
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Close context menu on click outside
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => setContextMenu(null);
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") setContextMenu(null);
      };
      document.addEventListener("click", handleClick);
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("click", handleClick);
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [contextMenu]);

  const handleCreateSubmit = useCallback(() => {
    const name = newCategoryName.trim();
    if (name) {
      onCreateCategory(name);
    }
    setNewCategoryName("");
    setIsCreating(false);
  }, [newCategoryName, onCreateCategory]);

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleCreateSubmit();
      } else if (e.key === "Escape") {
        setNewCategoryName("");
        setIsCreating(false);
      }
    },
    [handleCreateSubmit],
  );

  const handlePillContextMenu = useCallback(
    (e: React.MouseEvent, groupId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ groupId, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleRenameSubmit = useCallback(() => {
    if (editingId && editName.trim()) {
      onRenameCategory(editingId, editName.trim());
    }
    setEditingId(null);
    setEditName("");
  }, [editingId, editName, onRenameCategory]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleRenameSubmit();
      } else if (e.key === "Escape") {
        setEditingId(null);
        setEditName("");
      }
    },
    [handleRenameSubmit],
  );

  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  return (
    <div className="CategoryBar">
      <div className="CategoryBar__scroll" ref={scrollRef}>
        {/* Create new category — first in row */}
        {isCreating ? (
          <input
            ref={inputRef}
            type="text"
            className="CategoryBar__editInput"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onBlur={handleCreateSubmit}
            onKeyDown={handleCreateKeyDown}
            placeholder="Category name..."
          />
        ) : (
          <button
            className="CategoryBar__pill CategoryBar__pill--add"
            onClick={() => setIsCreating(true)}
          >
            +
          </button>
        )}

        {/* All pill */}
        <button
          className={`CategoryBar__pill ${activeFilter === "all" ? "CategoryBar__pill--active" : ""}`}
          onClick={() => onFilterChange("all")}
        >
          All
        </button>

        {/* Favorites pill */}
        {favoriteCount > 0 && (
          <button
            className={`CategoryBar__pill ${activeFilter === "favorites" ? "CategoryBar__pill--active" : ""}`}
            onClick={() => onFilterChange("favorites")}
          >
            <svg className="CategoryBar__pill__star" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            Favorites
          </button>
        )}

        {/* Uncategorized pill */}
        {uncategorizedCount > 0 && (
          <button
            className={`CategoryBar__pill ${activeFilter === "uncategorized" ? "CategoryBar__pill--active" : ""}`}
            onClick={() => onFilterChange("uncategorized")}
          >
            Uncategorized
          </button>
        )}

        {/* Category pills */}
        {sortedGroups.map((group) => {
          const isEmpty = (groupCounts[group.id] || 0) === 0;
          return editingId === group.id ? (
            <input
              key={group.id}
              ref={editInputRef}
              type="text"
              className="CategoryBar__editInput"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleEditKeyDown}
            />
          ) : (
            <button
              key={group.id}
              className={`CategoryBar__pill ${activeFilter === group.id ? "CategoryBar__pill--active" : ""} ${isEmpty ? "CategoryBar__pill--empty" : ""}`}
              onClick={() => onFilterChange(group.id)}
              onContextMenu={(e) => handlePillContextMenu(e, group.id)}
              title={isEmpty ? "Empty" : undefined}
            >
              {group.name}
            </button>
          );
        })}
      </div>

      {/* Fade edges */}
      <div className="CategoryBar__fadeLeft" />
      <div className="CategoryBar__fadeRight" />

      {/* Context menu for category pills */}
      {contextMenu && (
        <div
          className="CategoryBar__contextMenu"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const group = groups.find((g) => g.id === contextMenu.groupId);
              if (group) {
                setEditingId(group.id);
                setEditName(group.name);
              }
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          <button
            className="CategoryBar__contextMenu__danger"
            onClick={() => {
              onDeleteCategory(contextMenu.groupId);
              setContextMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
};
