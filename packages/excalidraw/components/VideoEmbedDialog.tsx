import React, { useState, useCallback, useRef } from "react";

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

    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(blobUrl);
    };

    video.onerror = () => {
      resolve({ width: 560, height: 315 });
      URL.revokeObjectURL(blobUrl);
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

    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
    };

    video.onerror = () => {
      resolve({ width: 560, height: 315 });
    };

    video.src = src;
  });
};

interface VideoEmbedDialogProps {
  onClose: () => void;
}

export const VideoEmbedDialog: React.FC<VideoEmbedDialogProps> = ({
  onClose,
}) => {
  const app = useApp();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        await insertVideoWithDimensions(videoUrl, width, height);
        onClose();
      } catch (err) {
        // Fallback to blob URL if upload fails (works for current session)
        console.warn("Upload failed, falling back to blob URL:", err);
        const blobUrl = URL.createObjectURL(file);
        const dimensions = await getVideoDimensions(file);
        await insertVideoWithDimensions(blobUrl, dimensions.width, dimensions.height);
        onClose();
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
