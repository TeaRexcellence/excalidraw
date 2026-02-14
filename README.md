# Excalidraw (Local Fork)

An all-in-one idea flow manager built on top of [Excalidraw](https://github.com/excalidraw/excalidraw), rewired for local-first personal use. No cloud, no accounts, no collaboration — just your files, your folders, your machine.

The core idea: your whiteboard is deeply connected to your local filesystem. Embed documents, videos, and code from your disk directly onto the canvas. Open files and folders from within Excalidraw. Link projects together with clickable cards and navigate between them without leaving the app — building your own interconnected web of organized thoughts. Everything is saved as plain files in a folder structure you control, so your work is always yours.

Shape libraries still work. Online collaboration, cloud storage, sharing, and telemetry have all been removed.

---

## Features at a Glance

| Feature | Description |
|---------|-------------|
| [Project Manager](#project-manager) | File-based project save/load with categories, favorites, export/import |
| [Video Embed](#video-embed) | YouTube, direct URL, and local video file embedding with playback controls |
| [Table Element](#table-element) | Spreadsheet-style tables with editable cells, resizable columns, CSV import |
| [Code Block Element](#code-block-element) | Syntax-highlighted code blocks with 6 language modes |
| [Document Element](#document-element) | Embed local files as code blocks or thumbnail cards |
| [Project Link Card](#project-link-card) | Clickable cards that navigate between projects |
| [Search](#search) | Find text elements and frames on the canvas (`Ctrl+F`) |
| [Image Viewer](#image-viewer) | Full-size image viewer on double-click |
| [Local Hyperlinks](#local-hyperlinks) | Support for local file paths and localhost URLs in hyperlinks |
| [Grid Opacity](#grid-opacity) | Adjustable grid transparency via context menu slider |
| [UI Debloat](#ui-debloat) | Cleaned-up interface with no cloud/collab clutter |

---

## Project Manager

A complete project management system backed by local files. Replaces the default browser localStorage approach with organized, folder-based persistence.

### How It Works

Projects live in `public/projects/` on disk:
```
public/projects/
├── projects.json                 # Master index
├── Work Projects/
│   └── My Diagram/
│       ├── scene.excalidraw      # Canvas data
│       ├── preview.png           # Auto-generated thumbnail
│       └── videos/               # Uploaded videos
│           └── demo.mp4
└── Uncategorized/
    └── Quick Sketch/
        └── scene.excalidraw
```

### Features

- **Categories** — Organize projects into named groups. Create, rename, reorder, expand/collapse.
- **Favorites** — Star projects for quick access with a dedicated filter.
- **Auto-save** — Debounced 1-second auto-save with preview regeneration.
- **Custom previews** — Upload a cover image or use the auto-generated canvas thumbnail.
- **Context menu** — Right-click any project card for: open in new tab, rename, move to category, set custom preview, open folder in file explorer, delete.
- **Card size slider** — Adjust project card thumbnail size (100px–300px).

### Export / Import

Access via the **⋮** (dots) button in the Project Manager header.

**Export** zips the entire project folder and downloads it:
```
MyProject.zip
├── scene.excalidraw      # Canvas data (required)
├── preview.png           # Thumbnail
└── videos/               # Any uploaded videos
    ├── demo.mp4
    └── clip.webm
```

**Import** accepts a `.zip` file:
1. Validates the zip contains a `scene.excalidraw` file (rejects if missing).
2. Adds the project to the **Uncategorized** group.
3. If a project with the same name already exists, appends `(1)`, `(2)`, etc.

**Reset Project Manager** — permanently deletes all projects. Requires typing `CONFIRM` to enable the delete button.

### Access

- **Sidebar** — "Projects" tab is docked by default.
- **Main menu** — "Save Project", "Open Project Folder", "Start New Project".
- **Settings** — Dots menu (⋮) in Project Manager header for export/import/reset.

---

## Video Embed

Full video embedding with YouTube, direct URLs, and local file uploads. Videos are stored inside the project folder.

### Supported Sources

| Source | Example |
|--------|---------|
| YouTube | Any youtube.com/youtu.be URL (regular, shorts, playlists, timestamps) |
| Direct URL | `https://example.com/video.mp4` (.mp4, .webm, .ogg, .mov, .avi, .mkv, .m4v) |
| Local upload | Browse and upload a file — copied into the project's `videos/` folder |

### Playback Controls

Hover over a video element to get the expanded controls panel:

| Control | Description |
|---------|-------------|
| Play / Pause | Toggle playback |
| Current time | Live position display (M:SS) |
| Loop | Loop entire video or custom range |
| Start / End time | Set playback range (accepts `1:30` or `90` seconds) |
| Autoplay | Start playing automatically on load |
| Mute | Toggle audio |

Options are persisted in the URL hash:
```
#excalidraw-video=loop,autoplay,muted,start:30,end:120,dim:1920x1080
```

### Export

Videos display their thumbnails in PNG/SVG exports:
- **YouTube** — Fetches `img.youtube.com` thumbnail
- **Local/Direct** — Captures a frame at 1 second (or video midpoint)

### Access

- Toolbar: Video icon (after the Image tool)

---

## Table Element

Spreadsheet-style tables rendered directly on the canvas.

### Features

- **Grid picker** — Click-drag to select table size (up to 8×8) in the creation dialog.
- **CSV import** — Upload a CSV file and it auto-creates a table with smart column widths.
- **Inline editing** — Double-click a table to open the spreadsheet editor (powered by jspreadsheet-ce). Supports tab/enter navigation, cell selection, copy/paste.
- **Header row** — Toggle to style the first row as a header.
- **Resizable** — Column widths and row heights are individually adjustable.
- **Context menu actions** — Add/delete rows and columns from the right-click menu:
  - Add row above / below
  - Delete row
  - Add column left / right
  - Delete column

### Properties

| Property | Default | Description |
|----------|---------|-------------|
| `columns` | User-selected | Number of columns |
| `rows` | User-selected | Number of rows |
| `cells` | Empty 2D array | Cell text content `[row][col]` |
| `columnWidths` | 120px each | Pixel width per column |
| `rowHeights` | 36px each | Pixel height per row |
| `headerRow` | false | Render first row as header |

### Access

- Toolbar: Table icon (after Embed tool)

---

## Code Block Element

Syntax-highlighted code blocks with inline editing.

### Supported Languages

JavaScript, Python, C#, C++, Markdown, Plain Text

### Features

- **Syntax highlighting** — Powered by Prism.js with language-specific coloring.
- **Line numbers** — Toggle line number display.
- **Inline editing** — Double-click to open the code editor overlay with a language selector toolbar.
- **Copy to clipboard** — Quick copy button in the editor.
- **Auto-detection** — Language auto-detected from file extension when inserted via Document tool.

### Access

- Toolbar: Code Block icon (after Table tool)

---

## Document Element

Embed local files from your filesystem onto the canvas.

### Display Modes

1. **Code block** — Renders file content with syntax highlighting (same engine as Code Block element).
2. **Thumbnail card** — Compact card showing filename and file type.

### Features

- **File picker** — Uses a system file picker dialog (via server API).
- **Auto language detection** — Detects programming language from file extension.
- **Context menu** — "Open file location" (opens folder in explorer) and "View contents" (opens viewer dialog).

### Properties

| Property | Description |
|----------|-------------|
| `fileName` | Name of the file |
| `fileType` | MIME type or extension |
| `filePath` | Absolute path on disk |
| `fileContent` | Full text content of the file |

### Access

- Toolbar: Document icon (after Code Block tool)

---

## Project Link Card

Interactive cards that link between projects — useful for building a network of related diagrams.

### Features

- **Project selector** — Pick any project from the Project Manager.
- **Custom card** — Set a title, description, and preview image.
- **Navigation** — Click "Navigate to project" to switch to the linked project.
- **Editable** — Right-click → "Edit project link" to update card properties.

### Properties

| Property | Description |
|----------|-------------|
| `title` | Card title |
| `description` | Short description text |
| `projectId` | ID of the linked project |
| `projectName` | Name of the linked project |
| `imageBase64` | Optional preview image (base64) |

### Access

- Toolbar: Project Link icon (after Document tool)

---

## Search

Find text elements and frames on the canvas by keyword.

### Features

- **Debounced search** (350ms) for performance.
- **Match count** — Shows "X results" indicator.
- **Keyboard navigation** — Arrow up/down to cycle through matches, Enter to jump and zoom.
- **Smart zoom** — Zooms to make matched text legible (minimum 14px threshold).
- **Escape** to close.

### Access

- Keyboard: `Ctrl+F` / `Cmd+F`
- Main menu: "Find on canvas"

---

## Image Viewer

Full-size image viewer modal.

### Access

- Double-click any image element on the canvas.
- Close with the X button or Escape.

---

## Local Hyperlinks

Extended hyperlink support beyond web URLs.

### Supported Formats

| Format | Example |
|--------|---------|
| Web URLs | `https://example.com` |
| Windows paths | `C:\path\to\file` or `C:/path/to/file` |
| UNC paths | `\\server\share\folder` |
| File protocol | `file:///path/to/file` |
| Localhost | `localhost:3000/page` or `127.0.0.1:8080` |
| Relative paths | `/path/to/file` (resolved against origin) |

Local paths bypass the standard URL sanitizer and are handled natively.

---

## Grid Opacity

Adjustable grid transparency from 10% to 100%.

### Access

- Right-click the canvas → Grid opacity slider.
- Slider range: 10%–100% in 10% steps.
- Real-time preview as you drag.

---

## UI Debloat

Stripped-out cloud and collaboration features for a clean, local-only experience.

### Removed

- Live collaboration UI and sharing links
- Excalidraw+ promotions and sign-in
- Cloud save/load options
- AI features (Text-to-Diagram)
- Firebase/WebSocket integrations
- Promotional content in welcome screen and sidebar

### Added to Main Menu

| Item | Description |
|------|-------------|
| Save Project | Open sidebar to Projects, trigger save |
| Open Project Folder | Open current project's folder in file explorer |
| Start New Project | Close current project + clear canvas (with confirmation) |
| Reset the canvas | Clear canvas content, keep project selected |

---

## Toolbar Layout

The shape toolbar includes all standard Excalidraw tools plus custom additions:

```
Selection | Rectangle | Diamond | Ellipse | Arrow | Line | Draw | Text | Image
  | Video | Embed | Table | Code Block | Document | Project Link |
Frame | Laser
```

---

## Development

### Commands

```bash
yarn start              # Dev server on port 3000
yarn test:typecheck     # TypeScript type checking
yarn test:update        # Run tests with snapshot updates
yarn fix                # Auto-fix formatting and linting
```

### Server APIs

The Vite dev server exposes local APIs for project and file management:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects/list` | GET | Get projects index |
| `/api/projects/save` | POST | Save projects index |
| `/api/projects/{id}/scene` | GET/POST | Get/save project scene data |
| `/api/projects/{id}/preview` | POST | Save preview image |
| `/api/projects/{id}` | DELETE | Delete project |
| `/api/projects/{id}/open-folder` | POST | Open folder in file explorer |
| `/api/projects/{id}/move` | POST | Move/rename project folder |
| `/api/projects/{id}/export` | POST | Export as zip |
| `/api/projects/import` | POST | Import from zip |
| `/api/projects/reset` | POST | Delete all projects |
| `/api/videos/upload` | POST | Upload video file |
| `/api/videos/{path}` | DELETE | Delete video file |
| `/api/files/pick` | POST | System file picker dialog |

### Architecture

```
excalidraw/
├── packages/
│   ├── excalidraw/          # Main React component library
│   │   ├── components/      # UI: ProjectManager, VideoPlayer, dialogs, etc.
│   │   ├── actions/         # Actions: table, codeBlock, document, projectLink, etc.
│   │   ├── renderer/        # Canvas/SVG rendering
│   │   └── wysiwyg/         # Inline editors: text, table spreadsheet, code block
│   ├── element/             # Element types, rendering, collision, type checks
│   ├── common/              # Shared constants, URL utilities
│   └── math/                # Math utilities
├── excalidraw-app/          # App shell: menus, data layer, Vite server config
│   ├── components/          # AppMainMenu, AppWelcomeScreen, etc.
│   ├── data/                # ProjectManagerData (auto-save, caching)
│   └── vite.config.mts      # Server-side file/project/video APIs
└── public/projects/          # Runtime project storage (gitignored)
```

### Custom Element Types

| Type | Type Guard | Factory | Renderer |
|------|-----------|---------|----------|
| `table` | `isTableElement()` | `newTableElement()` | `renderTable.ts` |
| `codeBlock` | `isCodeBlockElement()` | `newCodeBlockElement()` | `renderCodeBlock.ts` |
| `document` | `isDocumentElement()` | `newDocumentElement()` | `renderDocument.ts` |
| `projectLink` | `isProjectLinkElement()` | `newProjectLinkElement()` | `renderProjectLink.ts` |

All custom element types follow the standard pattern: types.ts → typeChecks.ts → newElement.ts → shape.ts → distance.ts → collision.ts → render[Type].ts → restore.ts.

---

## Getting Started

```bash
yarn start    # Dev server on http://localhost:3000
```

1. The **Project Manager** opens in the sidebar by default.
2. Click **"+ New Project"** to create your first project and start drawing.
3. Projects auto-save as you work. Use the toolbar to add videos, tables, code blocks, documents, or project links.
4. Right-click project cards to rename, move between categories, export, or open the folder on disk.

---

## Based On

[Excalidraw](https://github.com/excalidraw/excalidraw) — an open-source virtual hand-drawn style whiteboard. MIT licensed.
