# Excalidraw Fork - Custom Features Documentation

This document provides comprehensive documentation for all custom features added to this Excalidraw fork.

---

## Table of Contents

1. [Video Player Support](#1-video-player-support)
2. [Local Project Manager](#2-local-project-manager)
3. [Grid Opacity Control](#3-grid-opacity-control)
4. [UI Debloat](#4-ui-debloat)
5. [Video Thumbnail Export](#5-video-thumbnail-export)
6. [File Structure](#6-file-structure)
7. [API Reference](#7-api-reference)

---

## 1. Video Player Support

### Overview
Full video embedding support including YouTube videos, direct video URLs, and local video file uploads. Videos are persisted to disk within the project folder structure.

### Features

#### YouTube Video Embedding
- Paste any YouTube URL (regular, shorts, playlists) and it will be converted to an embedded player
- Supports timestamp parameters (`?t=`, `?start=`)
- Automatic thumbnail extraction for exports

#### Direct Video URL Support
- Supports `.mp4`, `.webm`, `.ogg`, `.mov`, `.avi`, `.mkv`, `.m4v` formats
- Videos can be hosted anywhere on the web
- Automatic dimension detection

#### Local Video Upload
- Upload videos directly from your computer
- Videos are stored in the project's `/videos/` subfolder
- Automatic file sanitization for safe filenames

### Video Player Component

**Location:** `packages/excalidraw/components/VideoPlayer.tsx`

The custom video player supports:
- **Custom start/end times** - Set specific playback ranges
- **Loop control** - Loop entire video or custom range
- **Autoplay** - Start playing automatically
- **Muted playback** - For autoplay compatibility

### Video Options Format

Video options are encoded in the URL hash:
```
#excalidraw-video=loop,autoplay,muted,start:30,end:120,dim:1920x1080
```

| Option | Description |
|--------|-------------|
| `loop` | Enable video looping |
| `autoplay` | Start playing automatically |
| `muted` | Mute audio |
| `start:N` | Start time in seconds |
| `end:N` | End time in seconds |
| `dim:WxH` | Video dimensions |

### Video Embed Dialog

**Location:** `packages/excalidraw/components/VideoEmbedDialog.tsx`

A multi-step dialog for inserting videos:

1. **Project Check** - Verifies a project is saved (required for local uploads)
2. **Save Prompt** - If no project exists, prompts user to save first ("OOPS!" message)
3. **Video Input** - URL input or file browser for local videos

### Key Files

| File | Purpose |
|------|---------|
| `packages/element/src/embeddable.ts` | Video URL detection, options parsing, thumbnail extraction |
| `packages/excalidraw/components/VideoPlayer.tsx` | Custom video player component |
| `packages/excalidraw/components/VideoEmbedDialog.tsx` | Video insertion dialog |
| `packages/excalidraw/components/VideoEmbedDialog.scss` | Dialog styling |

---

## 2. Local Project Manager

### Overview
A complete project management system that replaces browser localStorage with file-based persistence. Projects are organized into categories and stored in the `public/projects/` directory.

### Features

#### Project Organization
- **Categories (Groups)** - Organize projects into named categories
- **Favorites** - Star projects for quick access (shown at top)
- **Custom Previews** - Upload custom cover images for projects
- **Auto-Generated Previews** - Automatic thumbnail generation on save

#### Project Operations
- Create new blank projects
- Save current canvas as a project
- Rename projects (updates folder name)
- Delete projects (cleans up files)
- Move projects between categories
- Open project folder in file explorer
- Open project in new browser tab

#### UI Features
- **Zoom Controls** - Adjust project card size (100px - 300px)
- **Tooltips** - Hover to see full project name
- **"Saved!" Badge** - Visual confirmation after manual save
- **Unsaved Canvas Banner** - Prompts to save when canvas has content

### Project Card Context Menu

Right-click any project card to access:
- Open in new tab
- Rename
- Open project folder (opens in system file explorer)
- Set custom preview
- Remove custom preview
- Move to category (submenu)
- Delete

### Data Model

**Location:** `packages/excalidraw/components/ProjectManager/types.ts`

```typescript
interface Project {
  id: string;              // Unique nanoid
  title: string;           // Display name
  groupId: string | null;  // Category ID (null = Uncategorized)
  createdAt: number;       // Unix timestamp
  updatedAt: number;       // Unix timestamp
  hasCustomPreview?: boolean;
  isFavorite?: boolean;
}

interface ProjectGroup {
  id: string;
  name: string;
  order: number;
  expanded: boolean;
}

interface ProjectsIndex {
  projects: Project[];
  groups: ProjectGroup[];
  currentProjectId: string | null;
}
```

### Auto-Save System

**Location:** `excalidraw-app/data/ProjectManagerData.ts`

The `ProjectManagerData` class provides:
- **Debounced auto-save** (1 second debounce)
- **Automatic preview generation** on save
- **Cached index** to prevent race conditions
- **Flush on unload** for data safety

### Key Files

| File | Purpose |
|------|---------|
| `packages/excalidraw/components/ProjectManager/ProjectManager.tsx` | Main component |
| `packages/excalidraw/components/ProjectManager/ProjectCard.tsx` | Individual project card |
| `packages/excalidraw/components/ProjectManager/ProjectGroup.tsx` | Category/group container |
| `packages/excalidraw/components/ProjectManager/types.ts` | TypeScript interfaces |
| `packages/excalidraw/components/ProjectManager/ProjectManager.scss` | Styling |
| `excalidraw-app/data/ProjectManagerData.ts` | Data layer with auto-save |
| `excalidraw-app/vite.config.mts` | Server-side file APIs |

---

## 3. Grid Opacity Control

### Overview
Adjustable grid opacity (10% - 100%) accessible from the canvas context menu.

### Implementation

**Location:** `packages/excalidraw/components/GridOpacitySlider.tsx`

A slider component added to the context menu that controls `appState.gridOpacity`.

### App State Changes

Added to `packages/excalidraw/appState.ts`:
```typescript
gridOpacity: 100  // 10-100, default 100
```

### Usage
1. Right-click on canvas to open context menu
2. Find "Grid opacity" slider
3. Drag to adjust (10% minimum, 100% maximum)

---

## 4. UI Debloat

### Overview
Removed unnecessary UI elements and simplified the interface for a cleaner experience.

### Removed Elements

| Component | Removed Items |
|-----------|---------------|
| **App Footer** | Excalidraw+ promos, collaboration hints |
| **Main Menu** | AI features, cloud save options, Excalidraw+ links |
| **Sidebar** | Unused tabs and promotional content |
| **Welcome Screen** | Tutorials, promotional links |
| **Actions Panel** | Redundant action buttons |

### Files Modified

- `excalidraw-app/App.tsx` - Removed ~200 lines of promotional/AI code
- `excalidraw-app/components/AppFooter.tsx` - Simplified footer
- `excalidraw-app/components/AppMainMenu.tsx` - Cleaned up menu items
- `excalidraw-app/components/AppSidebar.tsx` - Removed unused sidebar content
- `excalidraw-app/components/AppWelcomeScreen.tsx` - Simplified welcome screen

---

## 5. Video Thumbnail Export

### Overview
Videos now display their thumbnails in PNG/SVG exports instead of black boxes or placeholder text.

### How It Works

1. **Before export** - The system prefetches thumbnails for all video embeds:
   - **YouTube** - Fetches from `img.youtube.com/vi/{id}/hqdefault.jpg`
   - **Local/Direct videos** - Captures a frame at 1 second (or video midpoint)

2. **During export** - Thumbnails are drawn in place of video embeds:
   - Canvas export uses `HTMLImageElement` objects
   - SVG export embeds thumbnails as data URLs

### Key Functions

**Location:** `packages/element/src/embeddable.ts`

```typescript
// Extract YouTube video ID
getYouTubeVideoId(url: string): string | null

// Get YouTube thumbnail URL
getYouTubeThumbnailUrl(videoId: string, quality: string): string

// Capture a frame from a video
captureVideoFrame(videoSrc: string, seekTime?: number): Promise<Blob | null>

// Get thumbnail for any video type
getVideoThumbnail(url: string): Promise<string | null>
```

**Location:** `packages/excalidraw/scene/videoThumbnails.ts`

```typescript
// Prefetch thumbnails as HTMLImageElement (for canvas)
prefetchVideoThumbnails(elements): Promise<Map<string, HTMLImageElement>>

// Prefetch thumbnails as data URLs (for SVG)
prefetchVideoThumbnailsAsDataUrls(elements): Promise<Map<string, string>>
```

### Modified Renderers

| File | Changes |
|------|---------|
| `packages/excalidraw/renderer/staticScene.ts` | Draws video thumbnails on canvas export |
| `packages/excalidraw/renderer/staticSvgScene.ts` | Embeds thumbnails in SVG export |
| `packages/excalidraw/scene/export.ts` | Calls prefetch before render |
| `packages/excalidraw/scene/types.ts` | Added `videoThumbnails` to render configs |

---

## 6. File Structure

### Project Storage Layout

```
public/projects/
├── projects.json                    # Master index file
├── {CategoryName}/
│   ├── {ProjectTitle}/
│   │   ├── scene.excalidraw        # Canvas data (JSON)
│   │   ├── preview.png             # Project thumbnail
│   │   └── videos/
│   │       ├── video1.mp4          # Uploaded videos
│   │       └── video2.webm
│   └── {AnotherProject}/
│       └── ...
└── Uncategorized/
    └── {UngroupedProject}/
        └── ...
```

### Index File Format

`projects.json`:
```json
{
  "projects": [
    {
      "id": "abc123xyz",
      "title": "My Project",
      "groupId": "group456",
      "createdAt": 1705190400000,
      "updatedAt": 1705190500000,
      "hasCustomPreview": false,
      "isFavorite": true
    }
  ],
  "groups": [
    {
      "id": "group456",
      "name": "Work Projects",
      "order": 0,
      "expanded": true
    }
  ],
  "currentProjectId": "abc123xyz"
}
```

---

## 7. API Reference

### Server-Side APIs

The Vite development server provides these APIs (defined in `excalidraw-app/vite.config.mts`):

#### Project APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects/list` | GET | Get projects index |
| `/api/projects/save` | POST | Save projects index |
| `/api/projects/{id}/scene` | GET | Get project scene data |
| `/api/projects/{id}/scene` | POST | Save project scene data |
| `/api/projects/{id}/preview` | POST | Save project preview image |
| `/api/projects/{id}` | DELETE | Delete project |
| `/api/projects/{id}/open-folder` | POST | Open project folder in file explorer |
| `/api/projects/{id}/move` | POST | Move/rename project folder |
| `/api/projects/rename-category` | POST | Rename category folder |

#### Video APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/videos/upload?projectId=X&filename=Y` | POST | Upload video file |
| `/api/videos/{path}` | DELETE | Delete video file |
| `/api/videos/list?projectId=X` | GET | List project videos |

### Client-Side Helpers

**VideoEmbedDialog.tsx:**
```typescript
getCurrentProjectId(): Promise<string | null>
uploadVideoFile(file: File): Promise<{ url, width, height }>
saveAsNewProject(name, elements, appState, files): Promise<string>
deleteVideoFile(videoUrl: string): Promise<void>
```

**ProjectManagerData.ts:**
```typescript
ProjectManagerData.getIndex(): Promise<ProjectsIndex>
ProjectManagerData.getCurrentProjectId(): Promise<string | null>
ProjectManagerData.loadCurrentProject(): Promise<SceneData | null>
ProjectManagerData.save(elements, appState, files): void
ProjectManagerData.flushSave(): void
ProjectManagerData.setCurrentProjectId(id): Promise<void>
```

---

## Commit History

| Commit | Description |
|--------|-------------|
| `84316b0f` | Video Player Support - YouTube, video URL, local upload |
| `c8ca318e` | Grid opacity slider and UI debloat |
| `742dd1bb` | Local Project Manager initial implementation |
| `177b3d31` | Working project manager, file explorer, create new project |
| `f7750b12` | Custom video icon, untrack projects folder |
| `4266a6d6` | Force project manager, video in project folder, project support |
| `14a0639d` | Fix project manager bugs, add custom preview |
| `88753953` | Add favorites, custom previews, tooltips, UI improvements |
| `10bbf123` | Make project folders match project manager structure |
| `e931a3c4` | Video thumbnail export & improved local video workflow |

---

## Getting Started

1. Run the development server:
   ```bash
   yarn start
   ```

2. The Project Manager appears in the sidebar by default

3. Create your first project:
   - Click "+ New Project" in the sidebar
   - Enter a name and click Create
   - Start drawing!

4. To add a video:
   - Click the video icon in the toolbar (or use the hyperlink panel)
   - Paste a YouTube URL or upload a local video
   - Videos are stored in your project's folder

5. Organize with categories:
   - Click "+ New Category" to create groups
   - Right-click projects to move them between categories
   - Star projects to mark as favorites

---

*Documentation generated from commit analysis on 2026-01-13*
