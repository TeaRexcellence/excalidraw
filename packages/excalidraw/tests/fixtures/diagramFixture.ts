import { VERSIONS } from "@excalidraw/common";

import {
  ellipseFixture,
  rectangleFixture,
} from "./elementFixture";

export const diagramFixture = {
  type: "excalidraw",
  version: VERSIONS.excalidraw,
  source: "https://excalidraw.com",
  elements: [rectangleFixture, ellipseFixture, rectangleFixture],
  appState: {
    viewBackgroundColor: "#ffffff",
    gridModeEnabled: false,
  },
  files: {},
};

export const diagramFactory = ({
  overrides = {},
  elementOverrides = {},
} = {}) => ({
  ...diagramFixture,
  elements: [
    { ...rectangleFixture, ...elementOverrides },
    { ...ellipseFixture, ...elementOverrides },
    { ...rectangleFixture, ...elementOverrides },
  ],
  ...overrides,
});

export default diagramFixture;
