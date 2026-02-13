import {
  sceneCoordsToViewportCoords,
} from "@excalidraw/common";
import { getElementAbsoluteCoords } from "@excalidraw/element";

import type {
  ElementsMap,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import { useExcalidrawAppState } from "./App";
import { searchIcon } from "./icons";

import "./ImageViewButton.scss";

export const ImageViewButton = ({
  element,
  elementsMap,
  onClick,
}: {
  element: NonDeletedExcalidrawElement;
  elementsMap: ElementsMap;
  onClick: () => void;
}) => {
  const appState = useExcalidrawAppState();

  if (
    appState.contextMenu ||
    appState.newElement ||
    appState.resizingElement ||
    appState.isRotating ||
    appState.openMenu ||
    appState.viewModeEnabled
  ) {
    return null;
  }

  const [x1, y1, x2, y2, cx, cy] = getElementAbsoluteCoords(
    element,
    elementsMap,
  );

  const center = sceneCoordsToViewportCoords(
    { sceneX: cx, sceneY: cy },
    appState,
  );

  const width = element.width * appState.zoom.value;
  const height = element.height * appState.zoom.value;

  const angleDeg = (element.angle * 180) / Math.PI;

  return (
    <div
      className="image-view-button-hitarea"
      style={{
        left: center.x - appState.offsetLeft - width / 2,
        top: center.y - appState.offsetTop - height / 2,
        width,
        height,
        transform: `rotate(${angleDeg}deg)`,
      }}
    >
      <button
        className="image-view-button"
        title="View image"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        {searchIcon}
      </button>
    </div>
  );
};
