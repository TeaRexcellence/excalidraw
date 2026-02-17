import { useCallback, useEffect, useRef, useState } from "react";

import { getDefaultAppState } from "../appState";
import { t } from "../i18n";

import { useApp, useExcalidrawSetAppState } from "./App";

import "./QuickLinks.scss";

import type { QuickLink } from "../types";

/** Sentinel value used as sourceElementId to signal "quick link" mode */
export const QUICK_LINK_SENTINEL = "__quickLink__";

// ── Floating buttons rendered BELOW the search card ────────────

export const QuickLinksSection = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  const app = useApp();
  const setAppState = useExcalidrawSetAppState();
  const quickLinks: QuickLink[] = app.state.quickLinks ?? [];

  // ── Context menu state ───────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    linkId: string;
    x: number;
    y: number;
  } | null>(null);

  const [renaming, setRenaming] = useState<{
    linkId: string;
    value: string;
  } | null>(null);

  const renameInputRef = useRef<HTMLInputElement>(null);

  // Close context menu on outside click / escape
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => setContextMenu(null);
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setContextMenu(null);
        }
      };
      document.addEventListener("click", handleClick);
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("click", handleClick);
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [contextMenu]);

  // Auto-focus rename input
  useEffect(() => {
    if (renaming) {
      requestAnimationFrame(() => renameInputRef.current?.focus());
    }
  }, [renaming]);

  const handleClick = (link: QuickLink) => {
    if (renaming) {
      return;
    }
    const element = app.scene
      .getNonDeletedElements()
      .find((el) => el.id === link.elementId);

    if (element) {
      onClose();
      app.scrollToContent(element, {
        animate: true,
        fitToContent: true,
        minZoom: getDefaultAppState().zoom.value,
      });
    } else {
      setAppState({
        quickLinks: quickLinks.filter((l) => l.id !== link.id),
        toast: { message: t("quickLinks.notFound") },
      });
    }
  };

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, linkId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ linkId, x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleRenameSubmit = () => {
    if (!renaming) {
      return;
    }
    const trimmed = renaming.value.trim();
    if (trimmed) {
      setAppState({
        quickLinks: quickLinks.map((l) =>
          l.id === renaming.linkId ? { ...l, label: trimmed } : l,
        ),
      });
    }
    setRenaming(null);
  };

  const handleDelete = (linkId: string) => {
    setAppState({
      quickLinks: quickLinks.filter((l) => l.id !== linkId),
    });
    setContextMenu(null);
  };

  const handleAdd = () => {
    const elements = app.scene.getNonDeletedElements();
    if (elements.length === 0) {
      setAppState({
        toast: { message: t("quickLinks.noElements") },
      });
      return;
    }
    // Open the existing element link selector dialog in "quick link" mode
    setAppState({
      openDialog: {
        name: "elementLinkSelector",
        sourceElementId: QUICK_LINK_SENTINEL,
      },
    });
  };

  return (
    <>
      <div className="quick-links">
        {/* "+" add button — always first */}
        <button
          className="quick-links__add"
          onClick={handleAdd}
          title={t("quickLinks.addLink")}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 2v12M2 8h12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Quick link buttons */}
        {quickLinks.map((link) => (
          <button
            key={link.id}
            className="quick-links__btn"
            onClick={() => handleClick(link)}
            onContextMenu={(e) => handleContextMenu(e, link.id)}
            title={link.label}
          >
            {renaming?.linkId === link.id ? (
              <input
                ref={renameInputRef}
                className="quick-links__rename-input"
                value={renaming.value}
                onChange={(e) =>
                  setRenaming({ ...renaming, value: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleRenameSubmit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setRenaming(null);
                  }
                }}
                onBlur={handleRenameSubmit}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="quick-links__btn-label">{link.label}</span>
            )}
          </button>
        ))}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="quick-links__contextMenu"
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
              const link = quickLinks.find(
                (l) => l.id === contextMenu.linkId,
              );
              if (link) {
                setRenaming({ linkId: link.id, value: link.label });
              }
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          <div className="quick-links__contextMenu__divider" />
          <button
            className="quick-links__contextMenu__danger"
            onClick={() => handleDelete(contextMenu.linkId)}
          >
            Delete
          </button>
        </div>
      )}
    </>
  );
};

