export interface Project {
  id: string;
  title: string;
  groupId: string | null; // null = ungrouped
  createdAt: number;
  updatedAt: number;
}

export interface ProjectGroup {
  id: string;
  name: string;
  order: number;
  expanded: boolean;
}

export interface ProjectsIndex {
  projects: Project[];
  groups: ProjectGroup[];
  currentProjectId: string | null;
}

export const DEFAULT_PROJECTS_INDEX: ProjectsIndex = {
  projects: [],
  groups: [],
  currentProjectId: null,
};
