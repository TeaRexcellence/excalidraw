import path from "path";
import fs from "fs";
import { exec } from "child_process";
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
  return name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .substring(0, 100) // Limit length
    || "Untitled";
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

    return path.join(projectsDir, safeCategoryName, safeProjectTitle);
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
            res.setHeader("Content-Type", "application/json");
            res.end(data);
          } catch {
            // File is empty, corrupted, or invalid - return default and fix the file
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
            fs.mkdirSync(projectDir, { recursive: true });
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

              const oldPath = path.join(projectsDir, safeOldCategory, safeOldTitle);
              const newPath = path.join(projectsDir, safeNewCategory, safeNewTitle);

              if (oldPath !== newPath && fs.existsSync(oldPath)) {
                // Ensure new category folder exists
                const newCategoryDir = path.join(projectsDir, safeNewCategory);
                if (!fs.existsSync(newCategoryDir)) {
                  fs.mkdirSync(newCategoryDir, { recursive: true });
                }

                // Move the folder
                fs.renameSync(oldPath, newPath);

                // Clean up empty old category folder
                const oldCategoryDir = path.join(projectsDir, safeOldCategory);
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

    return path.join(projectsDir, safeCategoryName, safeProjectTitle);
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

    return `/projects/${safeCategoryName}/${safeProjectTitle}`;
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

          const filePath = path.join(videosDir, filename);
          const chunks: Buffer[] = [];

          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", () => {
            const buffer = Buffer.concat(chunks);
            fs.writeFileSync(filePath, buffer);
            // URL path reflects new storage location
            const videoUrl = `${projectUrlPath}/videos/${filename}`;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ url: videoUrl }));
          });
          return;
        }

        // Handle video deletion
        if (req.method === "DELETE" && req.url?.startsWith("/api/videos/")) {
          const urlPath = req.url.replace("/api/videos/", "");
          // Support both old format (videos/projectId/file) and new format (projects/category/project/videos/file)
          let filePath: string;
          if (urlPath.startsWith("projects/")) {
            filePath = path.join(publicDir, urlPath);
          } else {
            // Legacy: old videos folder
            filePath = path.join(publicDir, "videos", urlPath);
          }

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
