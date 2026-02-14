import path from "path";
import fs from "fs";
import { exec } from "child_process";
import archiver from "archiver";
import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import svgrPlugin from "vite-plugin-svgr";
import { ViteEjsPlugin } from "vite-plugin-ejs";
import { VitePWA } from "vite-plugin-pwa";
import checker from "vite-plugin-checker";
import { createHtmlPlugin } from "vite-plugin-html";
import Sitemap from "vite-plugin-sitemap";
import { woff2BrowserPlugin } from "../scripts/woff2/woff2-vite-plugins";

// Sanitize a name for use as a folder name
function sanitizeFolderName(name: string): string {
  // Replace invalid characters with underscore
  // Invalid on Windows: \ / : * ? " < > |
  // Also replace leading/trailing spaces and dots
  // Prevent path traversal attacks by replacing ..
  let safe = name
    .replace(/\.\./g, "_") // Prevent path traversal
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .substring(0, 100); // Limit length

  // Double-check no path traversal remains
  while (safe.includes("..")) {
    safe = safe.replace(/\.\./g, "_");
  }

  return safe || "Untitled";
}

// Plugin to handle local project file management
// Folder structure: projects/{CategoryName}/{ProjectTitle}/scene.excalidraw
function projectFilePlugin(): Plugin {
  const publicDir = path.resolve(__dirname, "../public");
  const projectsDir = path.join(publicDir, "projects");
  const indexPath = path.join(projectsDir, "projects.json");

  // Ensure projects directory and index file exist
  const ensureProjectsDir = () => {
    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir, { recursive: true });
    }
    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(
        indexPath,
        JSON.stringify({ projects: [], groups: [], currentProjectId: null }, null, 2),
      );
    }
  };

  // Get index data
  const getIndex = () => {
    ensureProjectsDir();
    try {
      const data = fs.readFileSync(indexPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return { projects: [], groups: [], currentProjectId: null };
    }
  };

  // Get the folder path for a project based on its category and title
  const getProjectPath = (projectId: string): string | null => {
    const index = getIndex();
    const project = index.projects.find((p: any) => p.id === projectId);
    if (!project) return null;

    const categoryName = project.groupId
      ? index.groups.find((g: any) => g.id === project.groupId)?.name || "Uncategorized"
      : "Uncategorized";

    const safeCategoryName = sanitizeFolderName(categoryName);
    const safeProjectTitle = sanitizeFolderName(project.title);

    // Include project ID in folder name to prevent collisions when
    // different titles sanitize to the same string
    const newPath = path.join(projectsDir, safeCategoryName, `${safeProjectTitle}_${projectId}`);

    // Auto-migrate old folders (without ID suffix) to new format
    if (!fs.existsSync(newPath)) {
      const legacyPath = path.join(projectsDir, safeCategoryName, safeProjectTitle);
      if (fs.existsSync(legacyPath)) {
        try {
          fs.renameSync(legacyPath, newPath);
        } catch {
          // If rename fails, fall back to legacy path
          return legacyPath;
        }
      }
    }

    return newPath;
  };

  // Get the URL path for a project (for serving static files)
  const getProjectUrlPath = (projectId: string): string | null => {
    const index = getIndex();
    const project = index.projects.find((p: any) => p.id === projectId);
    if (!project) return null;

    const categoryName = project.groupId
      ? index.groups.find((g: any) => g.id === project.groupId)?.name || "Uncategorized"
      : "Uncategorized";

    const safeCategoryName = sanitizeFolderName(categoryName);
    const safeProjectTitle = sanitizeFolderName(project.title);

    return `/projects/${safeCategoryName}/${safeProjectTitle}`;
  };

  return {
    name: "project-file-plugin",
    configureServer(server) {
      ensureProjectsDir();

      server.middlewares.use(async (req, res, next) => {
        // Strip query string for matching
        const urlPath = req.url?.split("?")[0] || "";

        // Debug: log API requests
        if (urlPath.startsWith("/api/projects")) {
          console.log(`[project-api] ${req.method} ${urlPath}`);
        }

        // Get projects index
        if (req.method === "GET" && urlPath === "/api/projects/list") {
          ensureProjectsDir();
          try {
            const data = fs.readFileSync(indexPath, "utf-8");
            // Validate JSON and ensure it has required structure
            const parsed = JSON.parse(data);
            if (!parsed || !Array.isArray(parsed.projects) || !Array.isArray(parsed.groups)) {
              throw new Error("Invalid projects index structure");
            }
            // Validate individual project objects have required fields
            const isValidProject = (p: any) =>
              p && typeof p.id === "string" && typeof p.title === "string";
            const isValidGroup = (g: any) =>
              g && typeof g.id === "string" && typeof g.name === "string";

            if (!parsed.projects.every(isValidProject) || !parsed.groups.every(isValidGroup)) {
              throw new Error("Invalid project or group object structure");
            }
            res.setHeader("Content-Type", "application/json");
            res.end(data);
          } catch (err) {
            // File is empty, corrupted, or invalid - return default and fix the file
            console.error("[project-api] Invalid index file, resetting:", err);
            const defaultIndex = { projects: [], groups: [], currentProjectId: null };
            fs.writeFileSync(indexPath, JSON.stringify(defaultIndex, null, 2));
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(defaultIndex));
          }
          return;
        }

        // Save projects index
        if (req.method === "POST" && urlPath === "/api/projects/save") {
          const chunks: Buffer[] = [];
          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", () => {
            const data = Buffer.concat(chunks).toString();
            // Validate JSON structure before writing to prevent index corruption
            try {
              const parsed = JSON.parse(data);
              if (!parsed || !Array.isArray(parsed.projects) || !Array.isArray(parsed.groups)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "Invalid index structure" }));
                return;
              }
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid JSON" }));
              return;
            }
            fs.writeFileSync(indexPath, data);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true }));
          });
          return;
        }

        // Get project scene data
        const sceneGetMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/scene$/);
        if (req.method === "GET" && sceneGetMatch) {
          const projectId = sceneGetMatch[1];
          const projectDir = getProjectPath(projectId);

          if (projectDir && fs.existsSync(path.join(projectDir, "scene.excalidraw"))) {
            const data = fs.readFileSync(path.join(projectDir, "scene.excalidraw"), "utf-8");
            res.setHeader("Content-Type", "application/json");
            res.end(data);
          } else {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Project not found" }));
          }
          return;
        }

        // Save project scene data
        const scenePostMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/scene$/);
        if (req.method === "POST" && scenePostMatch) {
          const projectId = scenePostMatch[1];
          const projectDir = getProjectPath(projectId);

          if (!projectDir) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Project not found in index" }));
            return;
          }

          if (!fs.existsSync(projectDir)) {
            // Don't auto-create — the folder should have been created when
            // the project was first saved. Recreating it here would resurrect
            // deleted projects when a stale auto-save fires.
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Project folder missing" }));
            return;
          }

          const scenePath = path.join(projectDir, "scene.excalidraw");
          const chunks: Buffer[] = [];

          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", () => {
            const data = Buffer.concat(chunks).toString();
            fs.writeFileSync(scenePath, data);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true }));
          });
          return;
        }

        // Save project preview image
        const previewMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/preview$/);
        if (req.method === "POST" && previewMatch) {
          const projectId = previewMatch[1];
          const projectDir = getProjectPath(projectId);
          const projectUrlPath = getProjectUrlPath(projectId);

          if (!projectDir || !projectUrlPath) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Project not found in index" }));
            return;
          }

          if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
          }

          const previewPath = path.join(projectDir, "preview.png");
          const chunks: Buffer[] = [];

          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", () => {
            const buffer = Buffer.concat(chunks);
            fs.writeFileSync(previewPath, buffer);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ url: `${projectUrlPath}/preview.png` }));
          });
          return;
        }

        // Delete project
        const deleteMatch = urlPath.match(/^\/api\/projects\/([^/]+)$/);
        if (req.method === "DELETE" && deleteMatch) {
          const projectId = deleteMatch[1];
          const projectDir = getProjectPath(projectId);

          if (projectDir && fs.existsSync(projectDir)) {
            fs.rmSync(projectDir, { recursive: true, force: true });
            // Clean up empty category folder
            const categoryDir = path.dirname(projectDir);
            if (fs.existsSync(categoryDir) && fs.readdirSync(categoryDir).length === 0) {
              fs.rmdirSync(categoryDir);
            }
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ deleted: true }));
          return;
        }

        // Open project folder in file explorer
        const openFolderMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/open-folder$/);
        if (req.method === "POST" && openFolderMatch) {
          const projectId = openFolderMatch[1];
          const projectDir = getProjectPath(projectId);

          if (!projectDir) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Project not found" }));
            return;
          }

          // Create folder if it doesn't exist
          if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
          }

          // Open folder based on platform
          const platform = process.platform;

          let command: string;
          if (platform === "win32") {
            // Use path.resolve to get proper Windows path with backslashes
            const winPath = path.resolve(projectDir);
            command = `explorer "${winPath}"`;
          } else if (platform === "darwin") {
            command = `open "${projectDir}"`;
          } else {
            command = `xdg-open "${projectDir}"`;
          }

          exec(command, (err: Error | null) => {
            if (err) {
              console.error("Failed to open folder:", err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Failed to open folder" }));
            } else {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ opened: true }));
            }
          });
          return;
        }

        // Open any local file or folder with the OS default handler
        if (req.method === "POST" && urlPath === "/api/open-local") {
          const chunks: Buffer[] = [];
          req.on("data", (chunk: Buffer) => chunks.push(chunk));
          req.on("end", () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString());
              const localPath = body.path;
              if (!localPath || typeof localPath !== "string") {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "path required" }));
                return;
              }

              const resolved = path.resolve(localPath);
              const platform = process.platform;
              let command: string;
              if (platform === "win32") {
                command = `start "" "${resolved}"`;
              } else if (platform === "darwin") {
                command = `open "${resolved}"`;
              } else {
                command = `xdg-open "${resolved}"`;
              }

              exec(command, (err: Error | null) => {
                if (err) {
                  console.error("Failed to open local path:", err);
                  res.statusCode = 500;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ error: "Failed to open path" }));
                } else {
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ opened: true }));
                }
              });
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
          });
          return;
        }

        // Pick a file using native OS dialog and return path + content
        if (req.method === "POST" && urlPath === "/api/files/pick") {
          const platform = process.platform;
          let command: string;
          if (platform === "win32") {
            command = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = 'All files (*.*)|*.*'; if ($f.ShowDialog() -eq 'OK') { $f.FileName } else { '' }"`;
          } else if (platform === "darwin") {
            command = `osascript -e 'POSIX path of (choose file)'`;
          } else {
            command = `zenity --file-selection 2>/dev/null || kdialog --getopenfilename ~ 2>/dev/null`;
          }
          const BINARY_EXTENSIONS = new Set([
            // Images
            "png", "jpg", "jpeg", "gif", "bmp", "svg", "webp", "ico", "tiff", "tif", "avif", "heic",
            // Video
            "mp4", "webm", "avi", "mov", "mkv", "flv", "wmv", "m4v", "ogv",
            // Audio
            "mp3", "wav", "flac", "aac", "ogg", "wma", "m4a",
            // Archives & binary
            "zip", "rar", "7z", "tar", "gz", "exe", "dll", "so", "bin", "dat",
            "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "db", "sqlite",
          ]);
          const MAX_CODEBLOCK_SIZE = 512 * 1024; // 512KB

          exec(command, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
            const filePath = (stdout || "").trim();
            if (err || !filePath) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ cancelled: true }));
              return;
            }
            try {
              const fileName = path.basename(filePath);
              const ext = fileName.split(".").pop()?.toLowerCase() || "";
              const stats = fs.statSync(filePath);
              const fileSize = stats.size;
              const isBinary = BINARY_EXTENSIONS.has(ext);

              let fileContent: string | null = null;
              if (!isBinary && fileSize <= MAX_CODEBLOCK_SIZE) {
                fileContent = fs.readFileSync(filePath, "utf-8");
              }

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ filePath, fileName, fileContent, fileSize }));
            } catch (readErr) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "Failed to read file" }));
            }
          });
          return;
        }

        // Open file location in file explorer (for document elements)
        if (req.method === "POST" && urlPath === "/api/files/open-folder") {
          const chunks: Buffer[] = [];
          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", () => {
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString());
              const filePath = body.filePath;
              if (!filePath) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "filePath required" }));
                return;
              }
              const folderPath = path.dirname(filePath);
              const platform = process.platform;
              let command: string;
              if (platform === "win32") {
                const winPath = path.resolve(folderPath);
                command = `explorer "${winPath}"`;
              } else if (platform === "darwin") {
                command = `open "${folderPath}"`;
              } else {
                command = `xdg-open "${folderPath}"`;
              }
              exec(command, (err: Error | null) => {
                if (err) {
                  res.statusCode = 500;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ error: "Failed to open folder" }));
                } else {
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ opened: true }));
                }
              });
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "Invalid JSON" }));
            }
          });
          return;
        }

        // Move project folder (when renamed or category changed)
        const moveMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/move$/);
        if (req.method === "POST" && moveMatch) {
          const projectId = moveMatch[1];
          const chunks: Buffer[] = [];

          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", () => {
            try {
              const { oldCategoryName, oldTitle, newCategoryName, newTitle } = JSON.parse(Buffer.concat(chunks).toString());

              const safeOldCategory = sanitizeFolderName(oldCategoryName || "Uncategorized");
              const safeOldTitle = sanitizeFolderName(oldTitle);
              const safeNewCategory = sanitizeFolderName(newCategoryName || "Uncategorized");
              const safeNewTitle = sanitizeFolderName(newTitle);

              const oldPath = path.join(projectsDir, safeOldCategory, `${safeOldTitle}_${projectId}`);
              const newPath = path.join(projectsDir, safeNewCategory, `${safeNewTitle}_${projectId}`);

              // Also check legacy path (without ID suffix) for migration
              const legacyOldPath = path.join(projectsDir, safeOldCategory, safeOldTitle);

              // Use ID-suffixed path, fall back to legacy path for migration
              const actualOldPath = fs.existsSync(oldPath) ? oldPath : (fs.existsSync(legacyOldPath) ? legacyOldPath : null);

              if (actualOldPath && actualOldPath !== newPath) {
                // Ensure new category folder exists
                const newCategoryDir = path.join(projectsDir, safeNewCategory);
                if (!fs.existsSync(newCategoryDir)) {
                  fs.mkdirSync(newCategoryDir, { recursive: true });
                }

                // Move the folder
                fs.renameSync(actualOldPath, newPath);

                // Clean up empty old category folder
                const oldCategoryDir = path.dirname(actualOldPath);
                if (fs.existsSync(oldCategoryDir) && fs.readdirSync(oldCategoryDir).length === 0) {
                  fs.rmdirSync(oldCategoryDir);
                }
              }

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              console.error("Failed to move project:", err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: "Failed to move project" }));
            }
          });
          return;
        }

        // Rename category folder
        if (req.method === "POST" && urlPath === "/api/projects/rename-category") {
          const chunks: Buffer[] = [];

          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", () => {
            try {
              const { oldName, newName } = JSON.parse(Buffer.concat(chunks).toString());

              const safeOldName = sanitizeFolderName(oldName);
              const safeNewName = sanitizeFolderName(newName);

              const oldPath = path.join(projectsDir, safeOldName);
              const newPath = path.join(projectsDir, safeNewName);

              if (oldPath !== newPath && fs.existsSync(oldPath)) {
                // Check if new category name already exists
                if (fs.existsSync(newPath)) {
                  res.statusCode = 409;
                  res.end(JSON.stringify({ error: "Category name already exists" }));
                  return;
                }
                fs.renameSync(oldPath, newPath);
              }

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              console.error("Failed to rename category:", err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: "Failed to rename category" }));
            }
          });
          return;
        }

        // Export project as zip - creates zip and opens save dialog
        const exportMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/export$/);
        if (req.method === "POST" && exportMatch) {
          const projectId = exportMatch[1];
          const projectDir = getProjectPath(projectId);

          if (!projectDir || !fs.existsSync(projectDir)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Project not found" }));
            return;
          }

          // Get project name for zip filename
          const index = getIndex();
          const project = index.projects.find((p: any) => p.id === projectId);
          const projectName = project?.title || "project";
          const safeZipName = sanitizeFolderName(projectName);

          try {
            // Create zip in memory and stream to response
            res.setHeader("Content-Type", "application/zip");
            res.setHeader("Content-Disposition", `attachment; filename="${safeZipName}.zip"`);

            const archive = archiver("zip", { zlib: { level: 5 } });

            archive.on("error", (err: Error) => {
              console.error("Archive error:", err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: "Failed to create zip" }));
            });

            archive.pipe(res);

            // Add the entire project folder to the zip
            archive.directory(projectDir, safeZipName);

            archive.finalize();
          } catch (err) {
            console.error("Failed to export project:", err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Failed to export project" }));
          }
          return;
        }

        // Import project from zip
        if (req.method === "POST" && urlPath === "/api/projects/import") {
          const chunks: Buffer[] = [];

          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", async () => {
            try {
              const buffer = Buffer.concat(chunks);

              // Use dynamic import for extract-zip (ESM module)
              const { default: extract } = await import("extract-zip");

              // Create temp file for the zip
              const tempDir = path.join(projectsDir, ".temp");
              if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
              }

              const tempZipPath = path.join(tempDir, `import-${Date.now()}.zip`);
              fs.writeFileSync(tempZipPath, buffer);

              // Extract to temp extraction folder
              const extractDir = path.join(tempDir, `extract-${Date.now()}`);
              fs.mkdirSync(extractDir, { recursive: true });

              await extract(tempZipPath, { dir: extractDir });

              // Find the project folder (should be the only folder in extractDir)
              const extractedItems = fs.readdirSync(extractDir);
              let projectFolder = extractDir;

              // If there's a single folder, use that as the project folder
              if (extractedItems.length === 1) {
                const singleItem = path.join(extractDir, extractedItems[0]);
                if (fs.statSync(singleItem).isDirectory()) {
                  projectFolder = singleItem;
                }
              }

              // Verify it has a scene.excalidraw file
              const scenePath = path.join(projectFolder, "scene.excalidraw");
              if (!fs.existsSync(scenePath)) {
                // Clean up
                fs.rmSync(tempDir, { recursive: true, force: true });
                res.statusCode = 400;
                res.end(JSON.stringify({ error: "Invalid project: missing scene.excalidraw" }));
                return;
              }

              // Generate new project ID and determine name
              const { nanoid } = await import("nanoid");
              const newProjectId = nanoid(10);
              const folderName = path.basename(projectFolder);
              let projectTitle = folderName;

              // Check if project with same name exists, append number if so
              const index = getIndex();
              let counter = 1;
              let finalTitle = projectTitle;
              while (index.projects.some((p: any) => p.title === finalTitle)) {
                finalTitle = `${projectTitle} (${counter})`;
                counter++;
              }
              projectTitle = finalTitle;

              // Move to Uncategorized folder
              const targetDir = path.join(projectsDir, "Uncategorized", sanitizeFolderName(projectTitle));
              if (!fs.existsSync(path.join(projectsDir, "Uncategorized"))) {
                fs.mkdirSync(path.join(projectsDir, "Uncategorized"), { recursive: true });
              }

              // Copy files to target (use copy instead of rename for cross-device compatibility)
              fs.cpSync(projectFolder, targetDir, { recursive: true });

              // Add to index
              const newProject = {
                id: newProjectId,
                title: projectTitle,
                groupId: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };

              index.projects.push(newProject);
              fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

              // Clean up temp files
              fs.rmSync(tempDir, { recursive: true, force: true });

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ success: true, projectId: newProjectId, title: projectTitle }));
            } catch (err) {
              console.error("Failed to import project:", err);
              // Clean up temp on error
              const tempDir = path.join(projectsDir, ".temp");
              if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
              }
              res.statusCode = 500;
              res.end(JSON.stringify({ error: "Failed to import project" }));
            }
          });
          return;
        }

        // Get projects directory path (for displaying to user before reset)
        if (req.method === "GET" && urlPath === "/api/projects/path") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ path: projectsDir }));
          return;
        }

        // Reset project manager - delete all projects and reset index
        if (req.method === "POST" && urlPath === "/api/projects/reset") {
          try {
            // Get all items in projects directory
            const items = fs.readdirSync(projectsDir);

            // Delete everything except projects.json
            for (const item of items) {
              if (item === "projects.json") continue;
              const itemPath = path.join(projectsDir, item);
              fs.rmSync(itemPath, { recursive: true, force: true });
            }

            // Reset the index file
            const emptyIndex = { projects: [], groups: [], currentProjectId: null };
            fs.writeFileSync(indexPath, JSON.stringify(emptyIndex, null, 2));

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true }));
          } catch (err) {
            console.error("Failed to reset project manager:", err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Failed to reset project manager" }));
          }
          return;
        }

        next();
      });
    },
  };
}

// Plugin to handle local video file management
// Videos are stored in public/projects/{CategoryName}/{ProjectTitle}/videos/
function videoFilePlugin(): Plugin {
  const publicDir = path.resolve(__dirname, "../public");
  const projectsDir = path.join(publicDir, "projects");
  const indexPath = path.join(projectsDir, "projects.json");

  // Get index data
  const getIndex = () => {
    try {
      const data = fs.readFileSync(indexPath, "utf-8");
      return JSON.parse(data);
    } catch {
      return { projects: [], groups: [], currentProjectId: null };
    }
  };

  // Get the folder path for a project based on its category and title
  const getProjectPath = (projectId: string): string | null => {
    const index = getIndex();
    const project = index.projects.find((p: any) => p.id === projectId);
    if (!project) return null;

    const categoryName = project.groupId
      ? index.groups.find((g: any) => g.id === project.groupId)?.name || "Uncategorized"
      : "Uncategorized";

    const safeCategoryName = sanitizeFolderName(categoryName);
    const safeProjectTitle = sanitizeFolderName(project.title);

    return path.join(projectsDir, safeCategoryName, `${safeProjectTitle}_${projectId}`);
  };

  // Get the URL path for a project
  const getProjectUrlPath = (projectId: string): string | null => {
    const index = getIndex();
    const project = index.projects.find((p: any) => p.id === projectId);
    if (!project) return null;

    const categoryName = project.groupId
      ? index.groups.find((g: any) => g.id === project.groupId)?.name || "Uncategorized"
      : "Uncategorized";

    const safeCategoryName = sanitizeFolderName(categoryName);
    const safeProjectTitle = sanitizeFolderName(project.title);

    return `/projects/${safeCategoryName}/${safeProjectTitle}_${projectId}`;
  };

  return {
    name: "video-file-plugin",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Handle video upload - stores in project folder
        if (req.method === "POST" && req.url?.startsWith("/api/videos/upload")) {
          const urlParams = new URL(req.url, `http://${req.headers.host}`);
          const projectId = urlParams.searchParams.get("projectId");
          const filename = urlParams.searchParams.get("filename");

          if (!projectId) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "projectId required" }));
            return;
          }

          if (!filename) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "filename required" }));
            return;
          }

          const projectDir = getProjectPath(projectId);
          const projectUrlPath = getProjectUrlPath(projectId);

          if (!projectDir || !projectUrlPath) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "Project not found" }));
            return;
          }

          // Store videos in project's videos subfolder
          const videosDir = path.join(projectDir, "videos");
          if (!fs.existsSync(videosDir)) {
            fs.mkdirSync(videosDir, { recursive: true });
          }

          // Sanitize filename to prevent path traversal (e.g. "../scene.excalidraw")
          const safeFilename = path.basename(filename);
          const filePath = path.join(videosDir, safeFilename);
          const chunks: Buffer[] = [];

          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", () => {
            const buffer = Buffer.concat(chunks);
            fs.writeFileSync(filePath, buffer);
            // URL path reflects new storage location
            const videoUrl = `${projectUrlPath}/videos/${safeFilename}`;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ url: videoUrl }));
          });
          return;
        }

        // Handle video deletion
        if (req.method === "DELETE" && req.url?.startsWith("/api/videos/")) {
          const urlPath = decodeURIComponent(req.url.replace("/api/videos/", ""));
          // Support both old format (videos/projectId/file) and new format (projects/category/project/videos/file)
          let filePath: string;
          if (urlPath.startsWith("projects/")) {
            filePath = path.join(publicDir, urlPath);
          } else {
            // Legacy: old videos folder
            filePath = path.join(publicDir, "videos", urlPath);
          }

          // Prevent path traversal — ensure resolved path stays within publicDir
          const resolved = path.resolve(filePath);
          if (!resolved.startsWith(path.resolve(publicDir))) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: "Invalid path" }));
            return;
          }
          filePath = resolved;

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            // Clean up empty directories
            const dir = path.dirname(filePath);
            if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
              fs.rmdirSync(dir);
            }
          }
          res.statusCode = 200;
          res.end(JSON.stringify({ deleted: true }));
          return;
        }

        // List videos for a project
        if (req.method === "GET" && req.url?.startsWith("/api/videos/list")) {
          const urlParams = new URL(req.url, `http://${req.headers.host}`);
          const projectId = urlParams.searchParams.get("projectId");

          if (!projectId) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ files: [] }));
            return;
          }

          const projectDir = getProjectPath(projectId);

          if (!projectDir) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ files: [] }));
            return;
          }

          const videosDir = path.join(projectDir, "videos");

          let files: string[] = [];
          if (fs.existsSync(videosDir)) {
            files = fs.readdirSync(videosDir);
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ files }));
          return;
        }

        next();
      });
    },
  };
}
export default defineConfig(({ mode }) => {
  // To load .env variables
  const envVars = loadEnv(mode, `../`);
  // https://vitejs.dev/config/
  return {
    server: {
      port: Number(envVars.VITE_APP_PORT || 3000),
      // open the browser
      open: true,
    },
    // We need to specify the envDir since now there are no
    //more located in parallel with the vite.config.ts file but in parent dir
    envDir: "../",
    resolve: {
      alias: [
        {
          find: /^@excalidraw\/common$/,
          replacement: path.resolve(
            __dirname,
            "../packages/common/src/index.ts",
          ),
        },
        {
          find: /^@excalidraw\/common\/(.*?)/,
          replacement: path.resolve(__dirname, "../packages/common/src/$1"),
        },
        {
          find: /^@excalidraw\/element$/,
          replacement: path.resolve(
            __dirname,
            "../packages/element/src/index.ts",
          ),
        },
        {
          find: /^@excalidraw\/element\/(.*?)/,
          replacement: path.resolve(__dirname, "../packages/element/src/$1"),
        },
        {
          find: /^@excalidraw\/excalidraw$/,
          replacement: path.resolve(
            __dirname,
            "../packages/excalidraw/index.tsx",
          ),
        },
        {
          find: /^@excalidraw\/excalidraw\/(.*?)/,
          replacement: path.resolve(__dirname, "../packages/excalidraw/$1"),
        },
        {
          find: /^@excalidraw\/math$/,
          replacement: path.resolve(__dirname, "../packages/math/src/index.ts"),
        },
        {
          find: /^@excalidraw\/math\/(.*?)/,
          replacement: path.resolve(__dirname, "../packages/math/src/$1"),
        },
        {
          find: /^@excalidraw\/utils$/,
          replacement: path.resolve(
            __dirname,
            "../packages/utils/src/index.ts",
          ),
        },
        {
          find: /^@excalidraw\/utils\/(.*?)/,
          replacement: path.resolve(__dirname, "../packages/utils/src/$1"),
        },
      ],
    },
    build: {
      outDir: "build",
      rollupOptions: {
        output: {
          assetFileNames(chunkInfo) {
            if (chunkInfo?.name?.endsWith(".woff2")) {
              const family = chunkInfo.name.split("-")[0];
              return `fonts/${family}/[name][extname]`;
            }

            return "assets/[name]-[hash][extname]";
          },
          // Creating separate chunk for locales except for en and percentages.json so they
          // can be cached at runtime and not merged with
          // app precache. en.json and percentages.json are needed for first load
          // or fallback hence not clubbing with locales so first load followed by offline mode works fine. This is how CRA used to work too.
          manualChunks(id) {
            if (
              id.includes("packages/excalidraw/locales") &&
              id.match(/en.json|percentages.json/) === null
            ) {
              const index = id.indexOf("locales/");
              // Taking the substring after "locales/"
              return `locales/${id.substring(index + 8)}`;
            }
          },
        },
      },
      sourcemap: true,
      // don't auto-inline small assets (i.e. fonts hosted on CDN)
      assetsInlineLimit: 0,
    },
    plugins: [
      projectFilePlugin(),
      videoFilePlugin(),
      Sitemap({
        hostname: "https://excalidraw.com",
        outDir: "build",
        changefreq: "monthly",
        // its static in public folder
        generateRobotsTxt: false,
      }),
      woff2BrowserPlugin(),
      react(),
      checker({
        typescript: true,
        eslint:
          envVars.VITE_APP_ENABLE_ESLINT === "false"
            ? undefined
            : { lintCommand: 'eslint "./**/*.{js,ts,tsx}"' },
        overlay: {
          initialIsOpen: envVars.VITE_APP_COLLAPSE_OVERLAY === "false",
          badgeStyle: "margin-bottom: 4rem; margin-left: 1rem",
        },
      }),
      svgrPlugin(),
      ViteEjsPlugin(),
      VitePWA({
        registerType: "autoUpdate",
        devOptions: {
          /* set this flag to true to enable in Development mode */
          enabled: envVars.VITE_APP_ENABLE_PWA === "true",
        },

        workbox: {
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB
          // don't precache fonts, locales and separate chunks
          globIgnores: [
            "fonts.css",
            "**/locales/**",
            "service-worker.js",
            "**/*.chunk-*.js",
          ],
          runtimeCaching: [
            {
              urlPattern: new RegExp(".+.woff2"),
              handler: "CacheFirst",
              options: {
                cacheName: "fonts",
                expiration: {
                  maxEntries: 1000,
                  maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days
                },
                cacheableResponse: {
                  // 0 to cache "opaque" responses from cross-origin requests (i.e. CDN)
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: new RegExp("fonts.css"),
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "fonts",
                expiration: {
                  maxEntries: 50,
                },
              },
            },
            {
              urlPattern: new RegExp("locales/[^/]+.js"),
              handler: "CacheFirst",
              options: {
                cacheName: "locales",
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // <== 30 days
                },
              },
            },
            {
              urlPattern: new RegExp(".chunk-.+.js"),
              handler: "CacheFirst",
              options: {
                cacheName: "chunk",
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 90, // <== 90 days
                },
              },
            },
          ],
        },
        manifest: {
          short_name: "Excalidraw",
          name: "Excalidraw",
          description:
            "Excalidraw is a whiteboard tool that lets you easily sketch diagrams that have a hand-drawn feel to them.",
          icons: [
            {
              src: "android-chrome-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "apple-touch-icon.png",
              type: "image/png",
              sizes: "180x180",
            },
            {
              src: "favicon-32x32.png",
              sizes: "32x32",
              type: "image/png",
            },
            {
              src: "favicon-16x16.png",
              sizes: "16x16",
              type: "image/png",
            },
          ],
          start_url: "/",
          id: "excalidraw",
          display: "standalone",
          theme_color: "#121212",
          background_color: "#ffffff",
          file_handlers: [
            {
              action: "/",
              accept: {
                "application/vnd.excalidraw+json": [".excalidraw"],
              },
            },
          ],
          share_target: {
            action: "/web-share-target",
            method: "POST",
            enctype: "multipart/form-data",
            params: {
              files: [
                {
                  name: "file",
                  accept: [
                    "application/vnd.excalidraw+json",
                    "application/json",
                    ".excalidraw",
                  ],
                },
              ],
            },
          },
          screenshots: [
            {
              src: "/screenshots/virtual-whiteboard.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/wireframe.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/illustration.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/shapes.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/collaboration.png",
              type: "image/png",
              sizes: "462x945",
            },
            {
              src: "/screenshots/export.png",
              type: "image/png",
              sizes: "462x945",
            },
          ],
        },
      }),
      createHtmlPlugin({
        minify: true,
      }),
    ],
    publicDir: "../public",
  };
});
