import { isProjectLinkElement, CaptureUpdateAction } from "@excalidraw/element";

import { getSelectedElements } from "../scene";

import { register } from "./register";

export const actionEditProjectLink = register({
  name: "editProjectLink",
  label: "projectLinkActions.edit",
  trackEvent: false,
  predicate: (_elements, appState, _appProps, app) => {
    const selectedElements = getSelectedElements(
      app.scene.getNonDeletedElements(),
      appState,
    );
    return (
      selectedElements.length === 1 && isProjectLinkElement(selectedElements[0])
    );
  },
  perform: (_elements, appState, _data, app) => {
    const selectedElements = getSelectedElements(
      app.scene.getNonDeletedElements(),
      appState,
    );
    if (
      selectedElements.length !== 1 ||
      !isProjectLinkElement(selectedElements[0])
    ) {
      return { appState, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }
    return {
      appState: {
        ...appState,
        openDialog: {
          name: "projectLinkEdit" as const,
          elementId: selectedElements[0].id,
        },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
});

export const actionNavigateToProject = register({
  name: "navigateToProject",
  label: "projectLinkActions.navigate",
  trackEvent: false,
  predicate: (_elements, appState, _appProps, app) => {
    const selectedElements = getSelectedElements(
      app.scene.getNonDeletedElements(),
      appState,
    );
    return (
      selectedElements.length === 1 &&
      isProjectLinkElement(selectedElements[0]) &&
      !!(selectedElements[0] as any).projectId
    );
  },
  perform: (_elements, appState, _data, app) => {
    const selectedElements = getSelectedElements(
      app.scene.getNonDeletedElements(),
      appState,
    );
    if (
      selectedElements.length !== 1 ||
      !isProjectLinkElement(selectedElements[0])
    ) {
      return { appState, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }
    const projectId = (selectedElements[0] as any).projectId;
    if (projectId) {
      window.dispatchEvent(
        new CustomEvent("excalidraw-navigate-project", {
          detail: { projectId },
        }),
      );
    }
    return { appState, captureUpdate: CaptureUpdateAction.EVENTUALLY };
  },
});
