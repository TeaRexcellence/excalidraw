import { isDocumentElement, CaptureUpdateAction } from "@excalidraw/element";

import { register } from "./register";

export const actionOpenDocumentLocation = register({
  name: "openDocumentLocation",
  label: "documentActions.openFileLocation",
  trackEvent: false,
  predicate: (_elements, appState, _appProps, app) => {
    const selectedIds = Object.keys(appState.selectedElementIds);
    if (selectedIds.length !== 1) {
      return false;
    }
    const el = app.scene.getElementsMapIncludingDeleted().get(selectedIds[0]);
    return !!el && isDocumentElement(el);
  },
  perform: (_elements, appState, _value, app) => {
    const selectedIds = Object.keys(appState.selectedElementIds);
    if (selectedIds.length !== 1) {
      return false;
    }
    const el = app.scene.getElementsMapIncludingDeleted().get(selectedIds[0]);

    if (el && isDocumentElement(el) && el.filePath) {
      fetch("/api/files/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: el.filePath }),
      }).catch(() => {
        // silently fail if server not available
      });
    }

    return false;
  },
});

export const actionViewDocumentContents = register({
  name: "viewDocumentContents",
  label: "documentActions.viewContents",
  trackEvent: false,
  predicate: (_elements, appState, _appProps, app) => {
    const selectedIds = Object.keys(appState.selectedElementIds);
    if (selectedIds.length !== 1) {
      return false;
    }
    const el = app.scene.getElementsMapIncludingDeleted().get(selectedIds[0]);
    return !!el && isDocumentElement(el);
  },
  perform: (_elements, appState, _value, _app) => {
    const selectedIds = Object.keys(appState.selectedElementIds);
    if (selectedIds.length !== 1) {
      return false;
    }
    return {
      appState: {
        ...appState,
        openDialog: {
          name: "documentViewer" as const,
          documentId: selectedIds[0],
        },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
});
