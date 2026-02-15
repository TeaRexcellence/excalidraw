import {
  actionLoadScene,
  actionSaveToActiveFile,
} from "@excalidraw/excalidraw/actions/actionExport";
import { getShortcutFromShortcutName } from "@excalidraw/excalidraw/actions/shortcuts";
import { useExcalidrawActionManager } from "@excalidraw/excalidraw/components/App";
import { LoadIcon, ProjectsIcon } from "@excalidraw/excalidraw/components/icons";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import { WelcomeScreen } from "@excalidraw/excalidraw/index";
import React from "react";

export const AppWelcomeScreen: React.FC<{}> = React.memo(() => {
  const { t } = useI18n();
  const actionManager = useExcalidrawActionManager();

  return (
    <WelcomeScreen>
      <WelcomeScreen.Hints.MenuHint>
        {t("welcomeScreen.app.menuHint")}
      </WelcomeScreen.Hints.MenuHint>
      <WelcomeScreen.Hints.ToolbarHint />
      <WelcomeScreen.Hints.HelpHint />
      <WelcomeScreen.Center>
        <WelcomeScreen.Center.Logo />
        <WelcomeScreen.Center.Heading>
          {t("welcomeScreen.app.center_heading")}
        </WelcomeScreen.Center.Heading>
        <div
          className="welcome-screen-decor excalifont"
          style={{
            fontSize: "0.875rem",
            textAlign: "center",
            opacity: 0.7,
            marginTop: "-0.5rem",
          }}
        >
          Images, video, tables, code blocks, local linking, and interlinked
          projects.
        </div>
        <WelcomeScreen.Center.Menu>
          <WelcomeScreen.Center.MenuItem
            onSelect={() => actionManager.executeAction(actionLoadScene)}
            shortcut={getShortcutFromShortcutName("loadScene")}
            icon={LoadIcon}
            title="Import a project .zip or .excalidraw json file"
          >
            {t("buttons.load")}
          </WelcomeScreen.Center.MenuItem>
          <WelcomeScreen.Center.MenuItem
            onSelect={() =>
              actionManager.executeAction(actionSaveToActiveFile)
            }
            shortcut={getShortcutFromShortcutName("saveToActiveFile")}
            icon={ProjectsIcon}
            title="Save the current canvas as a project"
          >
            Save Project
          </WelcomeScreen.Center.MenuItem>
          <WelcomeScreen.Center.MenuItemHelp />
        </WelcomeScreen.Center.Menu>
      </WelcomeScreen.Center>
    </WelcomeScreen>
  );
});
