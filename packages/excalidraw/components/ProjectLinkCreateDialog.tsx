import React, { useState, useCallback, useEffect } from "react";

import { newProjectLinkElement } from "@excalidraw/element";
import { CaptureUpdateAction } from "@excalidraw/element";

import { t } from "../i18n";

import { ProjectManagerData } from "../../../excalidraw-app/data/ProjectManagerData";

import { Dialog } from "./Dialog";
import { FilledButton } from "./FilledButton";
import { useApp } from "./App";

import "./ProjectLinkCreateDialog.scss";

interface ProjectOption {
  id: string;
  title: string;
}

interface ProjectLinkCreateDialogProps {
  onClose: () => void;
}

export const ProjectLinkCreateDialog: React.FC<
  ProjectLinkCreateDialogProps
> = ({ onClose }) => {
  const app = useApp();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageBase64, setImageBase64] = useState("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const [res, currentId] = await Promise.all([
          fetch("/api/projects/list"),
          ProjectManagerData.getCurrentProjectId(),
        ]);
        if (res.ok) {
          const data = await res.json();
          const projectList: ProjectOption[] = (data.projects || [])
            .filter((p: any) => p.id !== currentId)
            .map((p: any) => ({
              id: p.id,
              title: p.title,
            }));
          setProjects(projectList);
        }
      } catch {
        // ignore fetch errors
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  const filteredProjects = projects.filter((p) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setImageBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    },
    [],
  );

  const handleCreate = useCallback(() => {
    if (!selectedProjectId) {
      return;
    }

    const viewportCenterX =
      -app.state.scrollX + app.state.width / 2 / app.state.zoom.value;
    const viewportCenterY =
      -app.state.scrollY + app.state.height / 2 / app.state.zoom.value;

    const element = newProjectLinkElement({
      x: viewportCenterX - 120,
      y: viewportCenterY - 28,
      title: title || selectedProject?.title || "Untitled",
      description,
      projectId: selectedProjectId,
      projectName: selectedProject?.title || "",
      imageBase64,
      strokeColor: app.state.currentItemStrokeColor,
      backgroundColor: "transparent",
      fillStyle: app.state.currentItemFillStyle,
      strokeWidth: app.state.currentItemStrokeWidth,
      strokeStyle: app.state.currentItemStrokeStyle,
      roughness: 0,
      opacity: app.state.currentItemOpacity,
      locked: false,
    });

    app.scene.insertElement(element);

    app.syncActionResult({
      appState: {
        ...app.state,
        selectedElementIds: { [element.id]: true },
        openDialog: null,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    onClose();
  }, [
    app,
    title,
    description,
    selectedProjectId,
    selectedProject,
    imageBase64,
    onClose,
  ]);

  return (
    <Dialog
      onCloseRequest={onClose}
      title={t("projectLinkDialog.createTitle")}
      className="ProjectLinkCreateDialog"
      size="small"
    >
      <div className="ProjectLinkCreateDialog__content">
        <div className="ProjectLinkCreateDialog__field">
          <label>{t("projectLinkDialog.title")}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("projectLinkDialog.titlePlaceholder")}
          />
        </div>

        <div className="ProjectLinkCreateDialog__field">
          <label>{t("projectLinkDialog.description")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("projectLinkDialog.descriptionPlaceholder")}
            rows={3}
          />
        </div>

        <div className="ProjectLinkCreateDialog__field">
          <label>{t("projectLinkDialog.image")}</label>
          <input type="file" accept="image/*" onChange={handleImageUpload} />
          {imageBase64 && (
            <div className="ProjectLinkCreateDialog__imagePreview">
              <img src={imageBase64} alt="Preview" />
              <button type="button" onClick={() => setImageBase64("")}>
                {t("projectLinkDialog.removeImage")}
              </button>
            </div>
          )}
        </div>

        <div className="ProjectLinkCreateDialog__field">
          <label>{t("projectLinkDialog.selectProject")}</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("projectLinkDialog.searchPlaceholder")}
          />
          <div className="ProjectLinkCreateDialog__projectList">
            {loading ? (
              <div className="ProjectLinkCreateDialog__loading">
                {t("projectLinkDialog.loading")}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="ProjectLinkCreateDialog__empty">
                {t("projectLinkDialog.noProjects")}
              </div>
            ) : (
              filteredProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={`ProjectLinkCreateDialog__projectItem ${
                    selectedProjectId === project.id
                      ? "ProjectLinkCreateDialog__projectItem--selected"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedProjectId(project.id);
                    if (!title) {
                      setTitle(project.title);
                    }
                  }}
                >
                  {project.title}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="ProjectLinkCreateDialog__actions">
          <FilledButton
            variant="outlined"
            color="muted"
            label={t("projectLinkDialog.cancel")}
            onClick={onClose}
          />
          <FilledButton
            label={t("projectLinkDialog.create")}
            onClick={selectedProjectId ? handleCreate : undefined}
          />
        </div>
      </div>
    </Dialog>
  );
};
