import clsx from "clsx";

import { t } from "../../i18n";
import { actionShortcuts } from "../../actions";
import { useTunnels } from "../../context/tunnels";
import { ExitZenModeButton, UndoRedoActions, ZoomActions } from "../Actions";
import { HelpButton } from "../HelpButton";
import { Section } from "../Section";
import Stack from "../Stack";
import { Tooltip } from "../Tooltip";

import type { ActionManager } from "../../actions/manager";
import type { UIAppState } from "../../types";

const ScrollBackToObjectsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="6" height="6" rx="0.5" transform="rotate(44 7 7)"/>
    <path d="M20 20L12.75 12.75"/>
    <path d="M12.75 12.75l4 0"/>
    <path d="M12.75 12.75l0 4"/>
  </svg>
);

const ScrollBackToCenterIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="0.75" fill="currentColor"/>
    <g opacity="0.6" strokeWidth="1" strokeDasharray="2 2">
      <path d="M12 3v5.5"/>
      <path d="M12 15.5v5.5"/>
      <path d="M3 12h5.5"/>
      <path d="M15.5 12h5.5"/>
    </g>
    <path d="M4 4L9 9"/>
    <path d="M9 9l-4 0"/>
    <path d="M9 9l0 -4"/>
  </svg>
);

const Footer = ({
  appState,
  actionManager,
  showExitZenModeBtn,
  renderWelcomeScreen,
  showBackToContent,
  showBackToCenter,
  onScrollBackToContent,
  onScrollBackToCenter,
}: {
  appState: UIAppState;
  actionManager: ActionManager;
  showExitZenModeBtn: boolean;
  renderWelcomeScreen: boolean;
  showBackToContent?: boolean;
  showBackToCenter?: boolean;
  onScrollBackToContent?: () => void;
  onScrollBackToCenter?: () => void;
}) => {
  const { FooterCenterTunnel, WelcomeScreenHelpHintTunnel } = useTunnels();

  return (
    <footer
      role="contentinfo"
      className="layer-ui__wrapper__footer App-menu App-menu_bottom"
    >
      <div
        className={clsx("layer-ui__wrapper__footer-left zen-mode-transition", {
          "layer-ui__wrapper__footer-left--transition-left":
            appState.zenModeEnabled,
        })}
      >
        <Stack.Col gap={2}>
          <Section heading="canvasActions">
            <ZoomActions
              renderAction={actionManager.renderAction}
              zoom={appState.zoom}
            />
            {(showBackToContent || showBackToCenter) && (
              <div className="scroll-back-buttons">
                {showBackToContent && (
                  <Tooltip label={t("buttons.scrollBackToContent")}>
                    <button
                      type="button"
                      className="scroll-back-button"
                      onClick={onScrollBackToContent}
                    >
                      {ScrollBackToObjectsIcon}
                    </button>
                  </Tooltip>
                )}
                {showBackToCenter && (
                  <Tooltip label="Scroll back to center">
                    <button
                      type="button"
                      className="scroll-back-button"
                      onClick={onScrollBackToCenter}
                    >
                      {ScrollBackToCenterIcon}
                    </button>
                  </Tooltip>
                )}
              </div>
            )}
          </Section>
        </Stack.Col>
      </div>
      <FooterCenterTunnel.Out />
      <div
        className={clsx("layer-ui__wrapper__footer-right zen-mode-transition", {
          "transition-right": appState.zenModeEnabled,
        })}
      >
        {!appState.viewModeEnabled && (
          <UndoRedoActions
            renderAction={actionManager.renderAction}
            className={clsx("zen-mode-transition", {
              "layer-ui__wrapper__footer-left--transition-bottom":
                appState.zenModeEnabled,
            })}
          />
        )}
        <div style={{ position: "relative" }}>
          {renderWelcomeScreen && <WelcomeScreenHelpHintTunnel.Out />}
          <HelpButton
            onClick={() => actionManager.executeAction(actionShortcuts)}
          />
        </div>
      </div>
      <ExitZenModeButton
        actionManager={actionManager}
        showExitZenModeBtn={showExitZenModeBtn}
      />
    </footer>
  );
};

export default Footer;
Footer.displayName = "Footer";
