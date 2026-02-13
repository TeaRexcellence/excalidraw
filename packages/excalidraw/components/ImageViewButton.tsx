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

  const [x1, y1] = getElementAbsoluteCoords(element, elementsMap);

  const topLeft = sceneCoordsToViewportCoords(
    { sceneX: x1, sceneY: y1 },
    appState,
  );

  const width = element.width * appState.zoom.value;
  const height = element.height * appState.zoom.value;

  return (
    <div
      className="image-view-button-hitarea"
      style={{
        left: topLeft.x - appState.offsetLeft,
        top: topLeft.y - appState.offsetTop,
        width,
        height,
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
