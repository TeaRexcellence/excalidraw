import React, { useCallback, useEffect, useRef, useState } from "react";

import { isImageElement } from "@excalidraw/element";

import { useApp } from "./App";

import "./ImageViewerDialog.scss";

interface ImageViewerDialogProps {
  imageElementId: string;
  onClose: () => void;
}

export const ImageViewerDialog = ({
  imageElementId,
  onClose,
}: ImageViewerDialogProps) => {
  const app = useApp();

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const mouseDownTarget = useRef<EventTarget | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const element = app.scene
    .getElementsIncludingDeleted()
    .find((el) => el.id === imageElementId && isImageElement(el));

  const fileId =
    element && isImageElement(element) ? element.fileId : null;
  const file = fileId ? app.files[fileId] : null;
  const dataURL = file?.dataURL ?? null;

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left - rect.width / 2;
      const cursorY = e.clientY - rect.top - rect.height / 2;

      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.min(10, Math.max(0.1, zoom + delta * zoom));
      const scale = newZoom / zoom;

      setOffset({
        x: cursorX - scale * (cursorX - offset.x),
        y: cursorY - scale * (cursorY - offset.y),
      });
      setZoom(newZoom);
    },
    [zoom, offset],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) {
        return;
      }
      setIsDragging(true);
      didDrag.current = false;
      mouseDownTarget.current = e.target;
      dragStart.current = { x: e.clientX, y: e.clientY };
      offsetStart.current = { ...offset };
    },
    [offset],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) {
        return;
      }
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        didDrag.current = true;
      }
      setOffset({
        x: offsetStart.current.x + dx,
        y: offsetStart.current.y + dy,
      });
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    if (!didDrag.current && mouseDownTarget.current !== imgRef.current) {
      onClose();
    }
    setIsDragging(false);
  }, [onClose]);

  const handleReset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!dataURL) {
    return null;
  }

  return (
    <div
      className={`image-viewer-overlay${isDragging ? " is-dragging" : ""}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        ref={containerRef}
        className="image-viewer-container"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
      >
        <img
          ref={imgRef}
          className="image-viewer-img"
          src={dataURL}
          alt=""
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          }}
          draggable={false}
        />
      </div>

      <button className="image-viewer-close" onClick={onClose} title="Close">
        ✕
      </button>

      <div className="image-viewer-controls">
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button onClick={handleReset}>Reset</button>
      </div>
    </div>
  );
};
