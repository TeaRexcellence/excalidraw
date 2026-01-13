import React, { useEffect, useRef } from "react";

import { t } from "../i18n";

import { useExcalidrawSetAppState } from "./App";

import "./Range.scss";

import type { AppState } from "../types";

export const GridOpacitySlider: React.FC<{
  appState: AppState;
}> = ({ appState }) => {
  const setAppState = useExcalidrawSetAppState();
  const rangeRef = useRef<HTMLInputElement>(null);
  const value = appState.gridOpacity;

  useEffect(() => {
    if (rangeRef.current) {
      const rangeElement = rangeRef.current;
      rangeElement.style.background = `linear-gradient(to right, var(--color-slider-track) 0%, var(--color-slider-track) ${value}%, var(--color-gray-40) ${value}%, var(--color-gray-40) 100%)`;
    }
  }, [value]);

  return (
    <label
      className="control-label"
      style={{ padding: "0.5rem 0.75rem", display: "block" }}
      onClick={(e) => e.stopPropagation()}
    >
      {t("labels.gridOpacity")}
      <div style={{ marginTop: "0.25rem" }}>
        <input
          ref={rangeRef}
          type="range"
          min="10"
          max="100"
          step="10"
          onChange={(event) => {
            setAppState({
              gridOpacity: +event.target.value,
            });
          }}
          value={value}
          className="range-input"
          data-testid="grid-opacity"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </label>
  );
};
