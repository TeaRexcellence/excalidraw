import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ProjectGroup } from "./types";

interface CategoryPickerProps {
  projectId: string;
  currentGroupId: string | null;
  groups: ProjectGroup[];
  onMoveToGroup: (projectId: string, groupId: string | null) => void;
  onCreateCategory: (name: string) => void;
  onClose: () => void;
}

export const CategoryPicker: React.FC<CategoryPickerProps> = ({
  projectId,
  currentGroupId,
  groups,
  onMoveToGroup,
  onCreateCategory,
  onClose,
}) => {
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const newNameRef = useRef<HTMLInputElement>(null);

  // Focus search on mount
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Focus new name input when creating
  useEffect(() => {
    if (isCreating && newNameRef.current) {
      newNameRef.current.focus();
    }
  }, [isCreating]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const filteredGroups = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) {
      return groups;
    }
    return groups.filter((g) => g.name.toLowerCase().includes(term));
  }, [groups, search]);

  const handleSelect = useCallback(
    (groupId: string | null) => {
      if (groupId !== currentGroupId) {
        onMoveToGroup(projectId, groupId);
      }
      onClose();
    },
    [currentGroupId, projectId, onMoveToGroup, onClose],
  );

  const handleCreateSubmit = useCallback(() => {
    const name = newName.trim();
    if (name) {
      onCreateCategory(name);
    }
    setNewName("");
    setIsCreating(false);
  }, [newName, onCreateCategory]);

  const handleCreateKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleCreateSubmit();
      } else if (e.key === "Escape") {
        setNewName("");
        setIsCreating(false);
      }
    },
    [handleCreateSubmit],
  );

  return (
    <div className="CategoryPicker__overlay" onMouseDown={onClose}>
      <div className="CategoryPicker" onMouseDown={(e) => e.stopPropagation()}>
        <div className="CategoryPicker__header">
          <span className="CategoryPicker__title">Move to category</span>
          <button
            className="CategoryPicker__closeBtn"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="CategoryPicker__search">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories..."
            className="CategoryPicker__searchInput"
          />
        </div>

        <div className="CategoryPicker__list">
          {/* Uncategorized option */}
          <label className="CategoryPicker__item">
            <input
              type="radio"
              name="category"
              checked={currentGroupId === null}
              onChange={() => handleSelect(null)}
              className="CategoryPicker__radio"
            />
            <span className="CategoryPicker__itemName">Uncategorized</span>
          </label>

          {filteredGroups.length === 0 && search && (
            <div className="CategoryPicker__empty">No matching categories</div>
          )}
          {filteredGroups
            .sort((a, b) => a.order - b.order)
            .map((group) => (
              <label key={group.id} className="CategoryPicker__item">
                <input
                  type="radio"
                  name="category"
                  checked={currentGroupId === group.id}
                  onChange={() => handleSelect(group.id)}
                  className="CategoryPicker__radio"
                />
                <span className="CategoryPicker__itemName">{group.name}</span>
              </label>
            ))}
        </div>

        <div className="CategoryPicker__footer">
          {isCreating ? (
            <div className="CategoryPicker__createRow">
              <input
                ref={newNameRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleCreateKeyDown}
                placeholder="Category name..."
                className="CategoryPicker__createInput"
              />
              <button
                className="CategoryPicker__createSubmitBtn"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleCreateSubmit();
                }}
              >
                Add
              </button>
            </div>
          ) : (
            <button
              className="CategoryPicker__createBtn"
              onClick={() => setIsCreating(true)}
            >
              + Create new category
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
