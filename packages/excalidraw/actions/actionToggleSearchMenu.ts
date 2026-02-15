import { KEYS, CLASSES } from "@excalidraw/common";

import { CaptureUpdateAction } from "@excalidraw/element";

import { searchIcon } from "../components/icons";

import { register } from "./register";

import type { AppState } from "../types";

export const actionToggleSearchMenu = register({
  name: "searchMenu",
  icon: searchIcon,
  keywords: ["search", "find"],
  label: "search.title",
  viewMode: true,
  trackEvent: {
    category: "search_menu",
    action: "toggle",
    predicate: (appState) => appState.gridModeEnabled,
  },
  perform(elements, appState, _, app) {
    if (appState.openDialog?.name === "searchMenu") {
      const searchInput = document.querySelector<HTMLInputElement>(
        `.${CLASSES.SEARCH_MENU_INPUT_WRAPPER} input`,
      );

      searchInput?.focus();
      searchInput?.select();
      return false;
    }

    if (appState.openDialog) {
      return false;
    }

    return {
      appState: {
        ...appState,
        openDialog: { name: "searchMenu" },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  checked: (appState: AppState) => appState.gridModeEnabled,
  predicate: (element, appState, props) => {
    return props.gridModeEnabled === undefined;
  },
  keyTest: (event) => event[KEYS.CTRL_OR_CMD] && event.key === KEYS.F,
});
