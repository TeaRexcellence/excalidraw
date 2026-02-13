import React, { useState, useCallback, useEffect } from "react";

import { isProjectLinkElement, CaptureUpdateAction } from "@excalidraw/element";

import type { ExcalidrawProjectLinkElement } from "@excalidraw/element/types";

import { t } from "../i18n";

import { ProjectManagerData } from "../../../excalidraw-app/data/ProjectManagerData";

import { Dialog } from "./Dialog";
import { FilledButton } from "./FilledButton";
import { useApp } from "./App";

interface ProjectOption {
  id: string;
  title: string;
}

interface ProjectLinkEditDialogProps {
  elementId: string;
  onClose: () => void;
}

export const ProjectLinkEditDialog: React.FC<ProjectLinkEditDialogProps> = ({
  elementId,
  onClose,
}) => {
  const app = useApp();

  const element = app.scene
    .getElementsIncludingDeleted()
    .find((el) => el.id === elementId && isProjectLinkElement(el)) as
    | ExcalidrawProjectLinkElement
    | undefined;

  const [title, setTitle] = useState(element?.title ?? "");
  const [description, setDescription] = useState(element?.description ?? "");
  const [imageBase64, setImageBase64] = useState(element?.imageBase64 ?? "");
  const [selectedProjectId, setSelectedProjectId] = useState(
    element?.projectId ?? "",
  );
  const [projects, setProjects] = useState<ProjectOption[]>([]);
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

  const handleSave = useCallback(() => {
    if (!element) {
      return;
    }

    app.scene.mutateElement(element, {
      title,
      description,
      projectId: selectedProjectId,
      projectName: selectedProject?.title || element.projectName,
      imageBase64,
    });

    app.syncActionResult({
      appState: {
        ...app.state,
        openDialog: null,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    onClose();
  }, [app, element, title, description, selectedProjectId, selectedProject, imageBase64, onClose]);

  if (!element) {
    onClose();
    return null;
  }

  return (
    <Dialog
      onCloseRequest={onClose}
      title={t("projectLinkDialog.editTitle")}
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
                  onClick={() => setSelectedProjectId(project.id)}
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
            label={t("projectLinkDialog.save")}
            onClick={handleSave}
          />
        </div>
      </div>
    </Dialog>
  );
};
