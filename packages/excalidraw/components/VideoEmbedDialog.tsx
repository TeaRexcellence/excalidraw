import React, { useState, useCallback, useRef, useEffect } from "react";

import { CaptureUpdateAction } from "@excalidraw/element";

import { t } from "../i18n";
import { isDirectVideoUrl } from "@excalidraw/element/embeddable";

import { Dialog } from "./Dialog";
import { FilledButton } from "./FilledButton";
import { useApp } from "./App";

import "./VideoEmbedDialog.scss";

// Get current project ID from Project Manager API
const getCurrentProjectId = async (): Promise<string | null> => {
  try {
    const res = await fetch("/api/projects/list");
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return data.currentProjectId || null;
  } catch {
    return null;
  }
};

// Dialog state type
type DialogState = "checking" | "save-prompt" | "save-project" | "video-dialog";

// Upload a video file to the server
const uploadVideoFile = async (
  file: File,
): Promise<{ url: string; width: number; height: number }> => {
  const projectId = await getCurrentProjectId();

  if (!projectId) {
    throw new Error("No project selected. Please save your canvas as a project first.");
  }
  // Sanitize filename
  const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Get video dimensions before upload
  const dimensions = await getVideoDimensions(file);

  // Upload file
  const response = await fetch(
    `/api/videos/upload?projectId=${encodeURIComponent(projectId)}&filename=${encodeURIComponent(filename)}`,
    {
      method: "POST",
      body: file,
    },
  );

  if (!response.ok) {
    throw new Error("Failed to upload video");
  }

  const data = await response.json();
  return {
    url: data.url,
    width: dimensions.width,
    height: dimensions.height,
  };
};

// Helper to get video dimensions from a File
const getVideoDimensions = (
  file: File,
): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    const blobUrl = URL.createObjectURL(file);

    const cleanup = () => {
      URL.revokeObjectURL(blobUrl);
      video.src = "";
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    // Timeout to prevent hanging if video never loads
    const timeout = setTimeout(() => {
      cleanup();
      resolve({ width: 560, height: 315 });
    }, 10000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const result = { width: video.videoWidth, height: video.videoHeight };
      cleanup();
      resolve(result);
    };

    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      resolve({ width: 560, height: 315 });
    };

    video.src = blobUrl;
  });
};

// Helper to get video dimensions from a URL
const getVideoDimensionsFromUrl = (
  src: string,
): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    const cleanup = () => {
      video.src = "";
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    // Timeout to prevent hanging if video never loads
    const timeout = setTimeout(() => {
      cleanup();
      resolve({ width: 560, height: 315 });
    }, 10000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const result = { width: video.videoWidth, height: video.videoHeight };
      cleanup();
      resolve(result);
    };

    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      resolve({ width: 560, height: 315 });
    };

    video.src = src;
  });
};

// Generate a random project name
const generateRandomName = (): string => {
  const adjectives = ["Swift", "Bright", "Cool", "Fresh", "Bold", "Calm", "Wild", "Neat", "Soft", "Sharp"];
  const nouns = ["Canvas", "Sketch", "Draft", "Design", "Board", "Space", "Flow", "Wave", "Spark", "Frame"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj} ${noun}`;
};

// Save current canvas as a new project
const saveAsNewProject = async (
  projectName: string,
  elements: readonly any[],
  appState: any,
  files: any,
): Promise<string> => {
  const { nanoid } = await import("nanoid");
  const projectId = nanoid(10);

  // Get current index
  const res = await fetch("/api/projects/list");
  const index = await res.json();

  // Add new project to index
  const newProject = {
    id: projectId,
    title: projectName,
    groupId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const newIndex = {
    ...index,
    projects: [...index.projects, newProject],
    currentProjectId: projectId,
  };

  // Save index first
  await fetch("/api/projects/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newIndex),
  });

  // Save scene
  await fetch(`/api/projects/${projectId}/scene`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "excalidraw",
      version: 2,
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        name: projectName,
      },
      files,
    }),
  });

  return projectId;
};

interface VideoEmbedDialogProps {
  onClose: () => void;
}

export const VideoEmbedDialog: React.FC<VideoEmbedDialogProps> = ({
  onClose,
}) => {
  const app = useApp();
  const [dialogState, setDialogState] = useState<DialogState>("checking");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [projectName, setProjectName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if project is saved on mount
  useEffect(() => {
    let aborted = false;

    getCurrentProjectId().then((projectId) => {
      if (aborted) {
        return;
      }
      if (projectId) {
        setDialogState("video-dialog");
      } else {
        setDialogState("save-prompt");
      }
    }).catch(() => {
      if (!aborted) {
        setDialogState("save-prompt");
      }
    });

    return () => {
      aborted = true;
    };
  }, []);

  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setUrl(e.target.value);
      setError(null);
    },
    [],
  );

  const insertVideoWithDimensions = useCallback(
    async (videoUrl: string, width?: number, height?: number) => {
      let finalUrl = videoUrl;

      // If dimensions provided, add to URL hash
      if (width && height) {
        finalUrl = `${videoUrl}#excalidraw-video-dimensions=${width}x${height}`;
      } else if (isDirectVideoUrl(videoUrl)) {
        // Try to get dimensions for direct video URLs
        const dimensions = await getVideoDimensionsFromUrl(videoUrl);
        finalUrl = `${videoUrl}#excalidraw-video-dimensions=${dimensions.width}x${dimensions.height}`;
      }

      app.insertEmbeddableElement({
        sceneX: app.state.width / 2,
        sceneY: app.state.height / 2,
        link: finalUrl,
      });
    },
    [app],
  );

  const handleSubmit = useCallback(async () => {
    if (!url.trim()) {
      setError(t("videoDialog.errorEmptyUrl"));
      return;
    }

    setIsLoading(true);
    try {
      await insertVideoWithDimensions(url.trim());
      onClose();
    } finally {
      setIsLoading(false);
    }
  }, [url, insertVideoWithDimensions, onClose]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }

      // Reset the input so the same file can be selected again
      e.target.value = "";

      setIsLoading(true);
      setError(null);

      try {
        // Try to upload to server for persistence
        const { url: videoUrl, width, height } = await uploadVideoFile(file);
        console.log("[Video] Uploaded successfully:", videoUrl);
        await insertVideoWithDimensions(videoUrl, width, height);
        onClose();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("[Video] Upload failed:", errorMessage);
        setError(`Upload failed: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    },
    [insertVideoWithDimensions, onClose],
  );

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !isLoading) {
        handleSubmit();
      }
    },
    [handleSubmit, isLoading],
  );

  // Save prompt handlers
  const handleSavePromptYes = useCallback(() => {
    setProjectName(app.state.name || generateRandomName());
    setDialogState("save-project");
  }, [app.state.name]);

  const handleSavePromptNo = useCallback(() => {
    onClose();
  }, [onClose]);

  // Save project handlers
  const handleSaveProject = useCallback(async () => {
    const name = projectName.trim() || "Untitled Project";
    setIsLoading(true);

    try {
      await saveAsNewProject(
        name,
        app.scene.getElementsIncludingDeleted(),
        app.state,
        app.files,
      );

      // Update app state with new name
      app.syncActionResult({
        appState: { name },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      setDialogState("video-dialog");
    } catch (err) {
      console.error("[Video] Failed to save project:", err);
      setError("Failed to save project. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [app, projectName]);

  const handleProjectNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !isLoading) {
        handleSaveProject();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [handleSaveProject, isLoading, onClose],
  );

  // Loading state
  if (dialogState === "checking") {
    return (
      <Dialog onCloseRequest={onClose} title={t("videoDialog.title")} size="small">
        <div className="VideoEmbedDialog">
          <p style={{ textAlign: "center", padding: "2rem" }}>Loading...</p>
        </div>
      </Dialog>
    );
  }

  // Save prompt dialog
  if (dialogState === "save-prompt") {
    return (
      <Dialog onCloseRequest={onClose} title="Save Project First" size="small">
        <div className="VideoEmbedDialog">
          <p style={{ marginBottom: "1.5rem", color: "var(--color-on-surface)" }}>
            <span style={{ color: "#f0c000", fontWeight: "bold" }}>OOPS!</span> You need to save your project first before we can attach videos to it.
          </p>
          <div className="VideoEmbedDialog__actions">
            <FilledButton
              variant="outlined"
              color="primary"
              label="Cancel"
              onClick={handleSavePromptNo}
            />
            <FilledButton
              variant="filled"
              color="primary"
              label="Save Project"
              onClick={handleSavePromptYes}
            />
          </div>
        </div>
      </Dialog>
    );
  }

  // Save project dialog
  if (dialogState === "save-project") {
    return (
      <Dialog onCloseRequest={onClose} title="Save Project" size="small">
        <div className="VideoEmbedDialog">
          <div className="VideoEmbedDialog__inputGroup">
            <label htmlFor="project-name-input" className="VideoEmbedDialog__label">
              Project Name
            </label>
            <input
              id="project-name-input"
              type="text"
              className="VideoEmbedDialog__input"
              placeholder="Enter project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={handleProjectNameKeyDown}
              autoFocus
              disabled={isLoading}
            />
            {error && <div className="VideoEmbedDialog__error">{error}</div>}
          </div>
          <div className="VideoEmbedDialog__actions">
            <FilledButton
              variant="outlined"
              color="primary"
              label="Cancel"
              onClick={onClose}
            />
            <FilledButton
              variant="filled"
              color="primary"
              label={isLoading ? "Saving..." : "Save & Continue"}
              onClick={isLoading ? undefined : handleSaveProject}
            />
          </div>
        </div>
      </Dialog>
    );
  }

  // Main video dialog
  return (
    <Dialog
      onCloseRequest={onClose}
      title={t("videoDialog.title")}
      size="small"
    >
      <div className="VideoEmbedDialog">
        <div className="VideoEmbedDialog__inputGroup">
          <label htmlFor="video-url-input" className="VideoEmbedDialog__label">
            {t("videoDialog.urlLabel")}
          </label>
          <input
            id="video-url-input"
            type="text"
            className="VideoEmbedDialog__input"
            placeholder={t("videoDialog.urlPlaceholder")}
            value={url}
            onChange={handleUrlChange}
            onKeyDown={handleKeyDown}
            autoFocus
            disabled={isLoading}
          />
          {error && <div className="VideoEmbedDialog__error">{error}</div>}
          <div className="VideoEmbedDialog__hint">{t("videoDialog.hint")}</div>
        </div>

        <div className="VideoEmbedDialog__divider">
          <span>{t("videoDialog.or")}</span>
        </div>

        <div className="VideoEmbedDialog__fileSection">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
          <FilledButton
            variant="outlined"
            color="primary"
            label={isLoading ? "Uploading..." : t("videoDialog.browseFiles")}
            onClick={isLoading ? undefined : handleBrowseClick}
          />
        </div>

        <div className="VideoEmbedDialog__actions">
          <FilledButton
            variant="outlined"
            color="primary"
            label={t("buttons.cancel")}
            onClick={onClose}
          />
          <FilledButton
            variant="filled"
            color="primary"
            label={isLoading ? "Loading..." : t("videoDialog.insert")}
            onClick={isLoading ? undefined : handleSubmit}
          />
        </div>
      </div>
    </Dialog>
  );
};

// Export helper to delete a video file (for cleanup when element is deleted)
export const deleteVideoFile = async (videoUrl: string): Promise<void> => {
  // Handle new format: /projects/{projectId}/videos/{filename}
  if (videoUrl.startsWith("/projects/")) {
    const path = videoUrl.replace(/^\//, "").split("#")[0];
    await fetch(`/api/videos/${path}`, { method: "DELETE" });
  }
  // Handle legacy format: /videos/{projectId}/{filename}
  else if (videoUrl.startsWith("/videos/")) {
    const path = videoUrl.replace(/^\/videos\//, "").split("#")[0];
    await fetch(`/api/videos/${path}`, { method: "DELETE" });
  }
};
