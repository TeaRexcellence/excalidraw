import clsx from "clsx";
import React from "react";

import { getShortcutFromShortcutName } from "../actions/shortcuts";
import { t } from "../i18n";

import { useExcalidrawAppState, useExcalidrawElements } from "./App";

import { Popover } from "./Popover";

import "./ContextMenu.scss";

import type { ActionManager } from "../actions/manager";
import type { ShortcutName } from "../actions/shortcuts";
import type { Action } from "../actions/types";
import type { AppState } from "../types";

import type { TranslationKeys } from "../i18n";

export type ContextMenuItemCustom = {
  name: string;
  contextItemType: "custom";
  Component: React.FC<{ appState: AppState }>;
  predicate?: (appState: AppState) => boolean;
};

export type ContextMenuItem =
  | typeof CONTEXT_MENU_SEPARATOR
  | Action
  | ContextMenuItemCustom;

export type ContextMenuItems = (ContextMenuItem | false | null | undefined)[];

type ContextMenuProps = {
  actionManager: ActionManager;
  items: ContextMenuItems;
  top: number;
  left: number;
  onClose: (callback?: () => void) => void;
};

export const CONTEXT_MENU_SEPARATOR = "separator";

export const ContextMenu = React.memo(
  ({ actionManager, items, top, left, onClose }: ContextMenuProps) => {
    const appState = useExcalidrawAppState();
    const elements = useExcalidrawElements();

    const filteredItems = items.reduce((acc: ContextMenuItem[], item) => {
      if (
        item &&
        item !== CONTEXT_MENU_SEPARATOR &&
        "contextItemType" in item &&
        item.contextItemType === "custom"
      ) {
        // Custom component item
        if (!item.predicate || item.predicate(appState)) {
          acc.push(item);
        }
      } else if (item && item !== CONTEXT_MENU_SEPARATOR) {
        // Action item
        const action = item as Action;
        if (
          !action.predicate ||
          action.predicate(
            elements,
            appState,
            actionManager.app.props,
            actionManager.app,
          )
        ) {
          acc.push(item);
        }
      } else if (item === CONTEXT_MENU_SEPARATOR) {
        acc.push(item);
      }
      return acc;
    }, []);

    return (
      <Popover
        onCloseRequest={() => {
          onClose();
        }}
        top={top}
        left={left}
        fitInViewport={true}
        offsetLeft={appState.offsetLeft}
        offsetTop={appState.offsetTop}
        viewportWidth={appState.width}
        viewportHeight={appState.height}
        className="context-menu-popover"
      >
        <ul
          className="context-menu"
          onContextMenu={(event) => event.preventDefault()}
        >
          {filteredItems.map((item, idx) => {
            if (item === CONTEXT_MENU_SEPARATOR) {
              if (
                !filteredItems[idx - 1] ||
                filteredItems[idx - 1] === CONTEXT_MENU_SEPARATOR
              ) {
                return null;
              }
              return <hr key={idx} className="context-menu-item-separator" />;
            }

            // Handle custom component items
            if (
              "contextItemType" in item &&
              item.contextItemType === "custom"
            ) {
              const CustomComponent = item.Component;
              return (
                <li
                  key={idx}
                  className="context-menu-item-custom"
                  data-testid={item.name}
                >
                  <CustomComponent appState={appState} />
                </li>
              );
            }

            // At this point, item is an Action (not custom, not separator)
            const action = item as Action;
            const actionName = action.name;
            let label = "";
            if (action.label) {
              if (typeof action.label === "function") {
                label = t(
                  action.label(
                    elements,
                    appState,
                    actionManager.app,
                  ) as unknown as TranslationKeys,
                );
              } else {
                label = t(action.label as unknown as TranslationKeys);
              }
            }

            return (
              <li
                key={idx}
                data-testid={actionName}
                onClick={() => {
                  // we need update state before executing the action in case
                  // the action uses the appState it's being passed (that still
                  // contains a defined contextMenu) to return the next state.
                  onClose(() => {
                    actionManager.executeAction(action, "contextMenu");
                  });
                }}
              >
                <button
                  type="button"
                  className={clsx("context-menu-item", {
                    dangerous: actionName === "deleteSelectedElements",
                    checkmark: action.checked?.(appState),
                  })}
                >
                  <div className="context-menu-item__label">{label}</div>
                  <kbd className="context-menu-item__shortcut">
                    {actionName
                      ? getShortcutFromShortcutName(actionName as ShortcutName)
                      : ""}
                  </kbd>
                </button>
              </li>
            );
          })}
        </ul>
      </Popover>
    );
  },
);
