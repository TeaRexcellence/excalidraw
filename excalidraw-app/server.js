/**
 * Production server for Excalidraw
 *
 * Serves the built static files from build/ and provides all the same
 * API routes that the Vite dev server plugins handle (project management,
 * video management, file picking, etc.).
 *
 * Usage: node server.js [port]
 * Default port: 6969
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const PORT = parseInt(process.argv[2] || "6969", 10);
const BUILD_DIR = path.resolve(__dirname, "build");
// Use public/projects as canonical data dir (shared with dev server, survives rebuilds)
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const PROJECTS_DIR = path.join(PUBLIC_DIR, "projects");
const INDEX_PATH = path.join(PROJECTS_DIR, "projects.json");

// ── MIME types ──────────────────────────────────────────────────────
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".excalidraw": "application/json; charset=utf-8",
};

// ── Helpers ─────────────────────────────────────────────────────────

function sanitizeFolderName(name) {
  let safe = name
    .replace(/\.\./g, "_")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .substring(0, 100);
  while (safe.includes("..")) {
    safe = safe.replace(/\.\./g, "_");
  }
  return safe || "Untitled";
}

function ensureProjectsDir() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(INDEX_PATH)) {
    fs.writeFileSync(
      INDEX_PATH,
      JSON.stringify(
        { projects: [], groups: [], currentProjectId: null },
        null,
        2,
      ),
    );
  }
}

function getIndex() {
  ensureProjectsDir();
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
  } catch {
    return { projects: [], groups: [], currentProjectId: null };
  }
}

function getProjectPath(projectId) {
  const index = getIndex();
  const project = index.projects.find((p) => p.id === projectId);
  if (!project) return null;

  const categoryName = project.groupId
    ? index.groups.find((g) => g.id === project.groupId)?.name ||
      "Uncategorized"
    : "Uncategorized";

  const safeCat = sanitizeFolderName(categoryName);
  const safeTitle = sanitizeFolderName(project.title);

  const newPath = path.join(PROJECTS_DIR, safeCat, `${safeTitle}_${projectId}`);
  if (fs.existsSync(newPath)) return newPath;

  const legacyPath = path.join(PROJECTS_DIR, safeCat, safeTitle);
  if (fs.existsSync(legacyPath)) return legacyPath;

  return newPath;
}

function getProjectUrlPath(projectId) {
  const projectDir = getProjectPath(projectId);
  if (!projectDir) return null;
  return `/projects/${path.relative(PROJECTS_DIR, projectDir).replace(/\\/g, "/")}`;
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
  return true;
}

function serveStaticFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";

  // No-cache for project data files so previews/scenes are always fresh
  const isProjectData =
    filePath.startsWith(PROJECTS_DIR) ||
    filePath.includes(path.sep + "projects" + path.sep);

  const headers = { "Content-Type": mime };
  if (isProjectData) {
    headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
  }

  const stream = fs.createReadStream(filePath);
  stream.on("open", () => {
    res.writeHead(200, headers);
    stream.pipe(res);
  });
  stream.on("error", () => {
    res.writeHead(404);
    res.end("Not found");
  });
}

// ── API Router ──────────────────────────────────────────────────────

async function handleAPI(req, res, urlPath) {
  // ── Projects: list ──
  if (req.method === "GET" && urlPath === "/api/projects/list") {
    ensureProjectsDir();
    try {
      const data = fs.readFileSync(INDEX_PATH, "utf-8");
      const parsed = JSON.parse(data);
      if (
        !parsed ||
        !Array.isArray(parsed.projects) ||
        !Array.isArray(parsed.groups)
      ) {
        throw new Error("Invalid structure");
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(data);
    } catch {
      const def = { projects: [], groups: [], currentProjectId: null };
      fs.writeFileSync(INDEX_PATH, JSON.stringify(def, null, 2));
      json(res, def);
    }
    return true;
  }

  // ── Projects: save index ──
  if (req.method === "POST" && urlPath === "/api/projects/save") {
    const body = (await readBody(req)).toString();
    try {
      const parsed = JSON.parse(body);
      if (
        !parsed ||
        !Array.isArray(parsed.projects) ||
        !Array.isArray(parsed.groups)
      ) {
        return json(res, { error: "Invalid index structure" }, 400);
      }
    } catch {
      return json(res, { error: "Invalid JSON" }, 400);
    }
    fs.writeFileSync(INDEX_PATH, body);
    return json(res, { success: true });
  }

  // ── Projects: get scene ──
  const sceneGetMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/scene$/);
  if (req.method === "GET" && sceneGetMatch) {
    const projectDir = getProjectPath(sceneGetMatch[1]);
    const scenePath = projectDir && path.join(projectDir, "scene.excalidraw");
    if (scenePath && fs.existsSync(scenePath)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(fs.readFileSync(scenePath, "utf-8"));
    } else {
      json(res, { error: "Project not found" }, 404);
    }
    return true;
  }

  // ── Projects: save scene ──
  const scenePostMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/scene$/);
  if (req.method === "POST" && scenePostMatch) {
    const projectDir = getProjectPath(scenePostMatch[1]);
    if (!projectDir) return json(res, { error: "Project not found" }, 404);
    if (!fs.existsSync(projectDir))
      fs.mkdirSync(projectDir, { recursive: true });
    const body = (await readBody(req)).toString();
    fs.writeFileSync(path.join(projectDir, "scene.excalidraw"), body);
    return json(res, { success: true });
  }

  // ── Projects: save preview ──
  const previewMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/preview$/);
  if (req.method === "POST" && previewMatch) {
    const projectId = previewMatch[1];
    const projectDir = getProjectPath(projectId);
    const projectUrlPath = getProjectUrlPath(projectId);
    if (!projectDir || !projectUrlPath)
      return json(res, { error: "Project not found" }, 404);
    if (!fs.existsSync(projectDir))
      fs.mkdirSync(projectDir, { recursive: true });
    const buffer = await readBody(req);
    fs.writeFileSync(path.join(projectDir, "preview.png"), buffer);
    return json(res, { url: `${projectUrlPath}/preview.png` });
  }

  // ── Projects: delete ──
  const deleteMatch = urlPath.match(/^\/api\/projects\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    const projectDir = getProjectPath(deleteMatch[1]);
    if (projectDir && fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
      const categoryDir = path.dirname(projectDir);
      if (
        fs.existsSync(categoryDir) &&
        fs.readdirSync(categoryDir).length === 0
      ) {
        fs.rmdirSync(categoryDir);
      }
    }
    return json(res, { deleted: true });
  }

  // ── Projects: open folder ──
  const openFolderMatch = urlPath.match(
    /^\/api\/projects\/([^/]+)\/open-folder$/,
  );
  if (req.method === "POST" && openFolderMatch) {
    const projectDir = getProjectPath(openFolderMatch[1]);
    if (!projectDir) return json(res, { error: "Project not found" }, 404);
    if (!fs.existsSync(projectDir))
      fs.mkdirSync(projectDir, { recursive: true });
    const winPath = path.resolve(projectDir);
    const cmd =
      process.platform === "win32"
        ? `explorer "${winPath}"`
        : process.platform === "darwin"
          ? `open "${projectDir}"`
          : `xdg-open "${projectDir}"`;
    exec(cmd, (err) => {
      if (err) return json(res, { error: "Failed to open folder" }, 500);
      json(res, { opened: true });
    });
    return true;
  }

  // ── Projects: move folder ──
  const moveMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/move$/);
  if (req.method === "POST" && moveMatch) {
    const projectId = moveMatch[1];
    const body = JSON.parse((await readBody(req)).toString());
    try {
      const { oldCategoryName, oldTitle, newCategoryName, newTitle } = body;
      const safeOldCat = sanitizeFolderName(oldCategoryName || "Uncategorized");
      const safeOldTitle = sanitizeFolderName(oldTitle);
      const safeNewCat = sanitizeFolderName(newCategoryName || "Uncategorized");
      const safeNewTitle = sanitizeFolderName(newTitle);

      const oldPath = path.join(
        PROJECTS_DIR,
        safeOldCat,
        `${safeOldTitle}_${projectId}`,
      );
      const newPath = path.join(
        PROJECTS_DIR,
        safeNewCat,
        `${safeNewTitle}_${projectId}`,
      );
      const legacyOldPath = path.join(PROJECTS_DIR, safeOldCat, safeOldTitle);
      const actualOldPath = fs.existsSync(oldPath)
        ? oldPath
        : fs.existsSync(legacyOldPath)
          ? legacyOldPath
          : null;

      if (actualOldPath && actualOldPath !== newPath) {
        const newCatDir = path.join(PROJECTS_DIR, safeNewCat);
        if (!fs.existsSync(newCatDir))
          fs.mkdirSync(newCatDir, { recursive: true });
        fs.renameSync(actualOldPath, newPath);
        const oldCatDir = path.dirname(actualOldPath);
        if (
          fs.existsSync(oldCatDir) &&
          fs.readdirSync(oldCatDir).length === 0
        ) {
          fs.rmdirSync(oldCatDir);
        }
      }
      return json(res, { success: true });
    } catch (err) {
      console.error("Failed to move project:", err);
      return json(res, { error: "Failed to move project" }, 500);
    }
  }

  // ── Projects: rename category ──
  if (req.method === "POST" && urlPath === "/api/projects/rename-category") {
    try {
      const { oldName, newName } = JSON.parse(
        (await readBody(req)).toString(),
      );
      const safeOld = sanitizeFolderName(oldName);
      const safeNew = sanitizeFolderName(newName);
      const oldP = path.join(PROJECTS_DIR, safeOld);
      const newP = path.join(PROJECTS_DIR, safeNew);
      if (oldP !== newP && fs.existsSync(oldP)) {
        if (fs.existsSync(newP))
          return json(res, { error: "Category name already exists" }, 409);
        fs.renameSync(oldP, newP);
      }
      return json(res, { success: true });
    } catch (err) {
      console.error("Failed to rename category:", err);
      return json(res, { error: "Failed to rename category" }, 500);
    }
  }

  // ── Projects: export as zip ──
  const exportMatch = urlPath.match(/^\/api\/projects\/([^/]+)\/export$/);
  if (req.method === "POST" && exportMatch) {
    const projectDir = getProjectPath(exportMatch[1]);
    if (!projectDir || !fs.existsSync(projectDir))
      return json(res, { error: "Project not found" }, 404);

    const index = getIndex();
    const project = index.projects.find((p) => p.id === exportMatch[1]);
    const safeName = sanitizeFolderName(project?.title || "project");

    try {
      const archiver = require("archiver");
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}.zip"`,
      });
      const archive = archiver("zip", { zlib: { level: 5 } });
      archive.on("error", (err) => {
        console.error("Archive error:", err);
      });
      archive.pipe(res);
      archive.directory(projectDir, safeName);
      archive.finalize();
    } catch (err) {
      console.error("Failed to export:", err);
      json(res, { error: "Failed to export project" }, 500);
    }
    return true;
  }

  // ── Projects: import from zip ──
  if (req.method === "POST" && urlPath === "/api/projects/import") {
    try {
      const buffer = await readBody(req);
      const { default: extract } = await import("extract-zip");
      const { nanoid } = await import("nanoid");

      const tempDir = path.join(PROJECTS_DIR, ".temp");
      if (!fs.existsSync(tempDir))
        fs.mkdirSync(tempDir, { recursive: true });

      const tempZipPath = path.join(tempDir, `import-${Date.now()}.zip`);
      fs.writeFileSync(tempZipPath, buffer);

      const extractDir = path.join(tempDir, `extract-${Date.now()}`);
      fs.mkdirSync(extractDir, { recursive: true });
      await extract(tempZipPath, { dir: extractDir });

      const items = fs.readdirSync(extractDir);
      let projectFolder = extractDir;
      if (items.length === 1) {
        const single = path.join(extractDir, items[0]);
        if (fs.statSync(single).isDirectory()) projectFolder = single;
      }

      if (!fs.existsSync(path.join(projectFolder, "scene.excalidraw"))) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        return json(
          res,
          { error: "Invalid project: missing scene.excalidraw" },
          400,
        );
      }

      const newProjectId = nanoid(10);
      const folderName = path.basename(projectFolder);
      let projectTitle = folderName;
      const index = getIndex();
      let counter = 1;
      let finalTitle = projectTitle;
      while (index.projects.some((p) => p.title === finalTitle)) {
        finalTitle = `${projectTitle} (${counter++})`;
      }
      projectTitle = finalTitle;

      const targetDir = path.join(
        PROJECTS_DIR,
        "Uncategorized",
        sanitizeFolderName(projectTitle),
      );
      if (!fs.existsSync(path.join(PROJECTS_DIR, "Uncategorized")))
        fs.mkdirSync(path.join(PROJECTS_DIR, "Uncategorized"), {
          recursive: true,
        });
      fs.cpSync(projectFolder, targetDir, { recursive: true });

      index.projects.push({
        id: newProjectId,
        title: projectTitle,
        groupId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
      fs.rmSync(tempDir, { recursive: true, force: true });

      return json(res, {
        success: true,
        projectId: newProjectId,
        title: projectTitle,
      });
    } catch (err) {
      console.error("Failed to import:", err);
      const tempDir = path.join(PROJECTS_DIR, ".temp");
      if (fs.existsSync(tempDir))
        fs.rmSync(tempDir, { recursive: true, force: true });
      return json(res, { error: "Failed to import project" }, 500);
    }
  }

  // ── Projects: get path ──
  if (req.method === "GET" && urlPath === "/api/projects/path") {
    return json(res, { path: PROJECTS_DIR });
  }

  // ── Projects: reset ──
  if (req.method === "POST" && urlPath === "/api/projects/reset") {
    try {
      const items = fs.readdirSync(PROJECTS_DIR);
      for (const item of items) {
        if (item === "projects.json") continue;
        fs.rmSync(path.join(PROJECTS_DIR, item), {
          recursive: true,
          force: true,
        });
      }
      const empty = { projects: [], groups: [], currentProjectId: null };
      fs.writeFileSync(INDEX_PATH, JSON.stringify(empty, null, 2));
      return json(res, { success: true });
    } catch (err) {
      console.error("Failed to reset:", err);
      return json(res, { error: "Failed to reset" }, 500);
    }
  }

  // ── Open local file/folder ──
  if (req.method === "POST" && urlPath === "/api/open-local") {
    try {
      const { path: localPath } = JSON.parse(
        (await readBody(req)).toString(),
      );
      if (!localPath) return json(res, { error: "path required" }, 400);
      const resolved = path.resolve(localPath);
      const cmd =
        process.platform === "win32"
          ? `start "" "${resolved}"`
          : process.platform === "darwin"
            ? `open "${resolved}"`
            : `xdg-open "${resolved}"`;
      exec(cmd, (err) => {
        if (err) return json(res, { error: "Failed to open path" }, 500);
        json(res, { opened: true });
      });
    } catch {
      json(res, { error: "Invalid JSON" }, 400);
    }
    return true;
  }

  // ── Files: pick with OS dialog ──
  if (req.method === "POST" && urlPath === "/api/files/pick") {
    const BINARY_EXTENSIONS = new Set([
      "png","jpg","jpeg","gif","bmp","svg","webp","ico","tiff","tif","avif","heic",
      "mp4","webm","avi","mov","mkv","flv","wmv","m4v","ogv",
      "mp3","wav","flac","aac","ogg","wma","m4a",
      "zip","rar","7z","tar","gz","exe","dll","so","bin","dat",
      "pdf","doc","docx","xls","xlsx","ppt","pptx","db","sqlite",
    ]);
    const MAX_SIZE = 512 * 1024;
    const cmd =
      process.platform === "win32"
        ? `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Filter = 'All files (*.*)|*.*'; if ($f.ShowDialog() -eq 'OK') { $f.FileName } else { '' }"`
        : process.platform === "darwin"
          ? `osascript -e 'POSIX path of (choose file)'`
          : `zenity --file-selection 2>/dev/null || kdialog --getopenfilename ~ 2>/dev/null`;

    exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      const filePath = (stdout || "").trim();
      if (err || !filePath) return json(res, { cancelled: true });
      try {
        const fileName = path.basename(filePath);
        const ext = fileName.split(".").pop()?.toLowerCase() || "";
        const stats = fs.statSync(filePath);
        const isBinary = BINARY_EXTENSIONS.has(ext);
        let fileContent = null;
        if (!isBinary && stats.size <= MAX_SIZE) {
          fileContent = fs.readFileSync(filePath, "utf-8");
        }
        json(res, { filePath, fileName, fileContent, fileSize: stats.size });
      } catch {
        json(res, { error: "Failed to read file" }, 500);
      }
    });
    return true;
  }

  // ── Files: open folder for file ──
  if (req.method === "POST" && urlPath === "/api/files/open-folder") {
    try {
      const { filePath } = JSON.parse((await readBody(req)).toString());
      if (!filePath) return json(res, { error: "filePath required" }, 400);
      const folderPath = path.dirname(filePath);
      const cmd =
        process.platform === "win32"
          ? `explorer "${path.resolve(folderPath)}"`
          : process.platform === "darwin"
            ? `open "${folderPath}"`
            : `xdg-open "${folderPath}"`;
      exec(cmd, (err) => {
        if (err) return json(res, { error: "Failed to open folder" }, 500);
        json(res, { opened: true });
      });
    } catch {
      json(res, { error: "Invalid JSON" }, 400);
    }
    return true;
  }

  // ── Videos: upload ──
  if (req.method === "POST" && urlPath.startsWith("/api/videos/upload")) {
    const fullUrl = new URL(req.url, `http://${req.headers.host}`);
    const projectId = fullUrl.searchParams.get("projectId");
    const filename = fullUrl.searchParams.get("filename");
    if (!projectId) return json(res, { error: "projectId required" }, 400);
    if (!filename) return json(res, { error: "filename required" }, 400);

    const projectDir = getProjectPath(projectId);
    const projectUrlPath = getProjectUrlPath(projectId);
    if (!projectDir || !projectUrlPath)
      return json(res, { error: "Project not found" }, 404);

    const videosDir = path.join(projectDir, "videos");
    if (!fs.existsSync(videosDir))
      fs.mkdirSync(videosDir, { recursive: true });

    const safeFilename = path.basename(filename);
    const buffer = await readBody(req);
    fs.writeFileSync(path.join(videosDir, safeFilename), buffer);
    return json(res, { url: `${projectUrlPath}/videos/${safeFilename}` });
  }

  // ── Videos: delete ──
  if (req.method === "DELETE" && urlPath.startsWith("/api/videos/")) {
    const videoPath = decodeURIComponent(urlPath.replace("/api/videos/", ""));
    let filePath;
    if (videoPath.startsWith("projects/")) {
      filePath = path.join(PUBLIC_DIR, videoPath);
    } else {
      filePath = path.join(PUBLIC_DIR, "videos", videoPath);
    }
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(PUBLIC_DIR)))
      return json(res, { error: "Invalid path" }, 403);
    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
      const dir = path.dirname(resolved);
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
      }
    }
    return json(res, { deleted: true });
  }

  // ── Videos: list ──
  if (req.method === "GET" && urlPath.startsWith("/api/videos/list")) {
    const fullUrl = new URL(req.url, `http://${req.headers.host}`);
    const projectId = fullUrl.searchParams.get("projectId");
    if (!projectId) return json(res, { files: [] });
    const projectDir = getProjectPath(projectId);
    if (!projectDir) return json(res, { files: [] });
    const videosDir = path.join(projectDir, "videos");
    const files = fs.existsSync(videosDir) ? fs.readdirSync(videosDir) : [];
    return json(res, { files });
  }

  return false; // not handled
}

// ── Static file serving ─────────────────────────────────────────────

function handleStatic(req, res, urlPath) {
  // Serve /projects/* from public/projects/ (canonical data, not build snapshot)
  if (urlPath.startsWith("/projects/")) {
    const filePath = path.join(PUBLIC_DIR, urlPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return serveStaticFile(filePath, res);
    }
  }

  // Serve everything else from build/
  let filePath = path.join(BUILD_DIR, urlPath);

  // If it's a directory, try index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return serveStaticFile(filePath, res);
  }

  // SPA fallback: serve index.html for non-file routes
  const indexPath = path.join(BUILD_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    return serveStaticFile(indexPath, res);
  }

  res.writeHead(404);
  res.end("Not found");
}

// ── Server ──────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const rawPath = (req.url || "/").split("?")[0];
  // Decode %20 etc. for filesystem lookups, but keep raw for API matching
  const urlPath = decodeURIComponent(rawPath);

  // Handle API routes
  if (urlPath.startsWith("/api/")) {
    try {
      const handled = await handleAPI(req, res, urlPath);
      if (!handled) {
        json(res, { error: "Unknown API route" }, 404);
      }
    } catch (err) {
      console.error(`[API Error] ${req.method} ${urlPath}:`, err);
      if (!res.writableEnded) {
        json(res, { error: "Internal server error" }, 500);
      }
    }
    return;
  }

  // Handle static files
  handleStatic(req, res, urlPath);
});

ensureProjectsDir();

server.listen(PORT, "localhost", () => {
  console.log(`Excalidraw production server running at http://localhost:${PORT}`);
  console.log(`Serving build from: ${BUILD_DIR}`);
  console.log(`Project data in:    ${PROJECTS_DIR}`);
});
