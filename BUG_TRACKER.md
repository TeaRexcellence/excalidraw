# Excalidraw Fork - Bug Tracker

> **Generated:** 2026-01-13
> **Total Issues:** 67
> **Status Legend:** 🔴 Open | 🟡 In Progress | 🟢 Fixed

---

## Table of Contents
1. [Critical Issues (P0)](#critical-issues-p0)
2. [High Priority Issues (P1)](#high-priority-issues-p1)
3. [Medium Priority Issues (P2)](#medium-priority-issues-p2)
4. [Low Priority Issues (P3)](#low-priority-issues-p3)

---

## Critical Issues (P0)

### BUG-001: 🟢 Project Selection Uses Stale Index State
**File:** `packages/excalidraw/components/ProjectManager/ProjectManager.tsx`
**Lines:** 495-562
**Symptom:** Clicking a project in the Project Manager doesn't switch to it

**Root Cause:**
The `handleSelectProject` callback is memoized with `useCallback` and depends on `index` state (line 561). When the user clicks a project:
1. The callback uses the `index` value captured at creation time
2. If `index` was updated but React hasn't re-rendered yet, the callback has stale data
3. The check `if (projectId === index.currentProjectId)` (line 500) may incorrectly return true
4. The function returns early, doing nothing

**Current Code (lines 496-503):**
```typescript
const handleSelectProject = useCallback(
  async (projectId: string) => {
    console.log("[ProjectManager] Selecting project:", projectId, "current:", index.currentProjectId);

    if (projectId === index.currentProjectId) {
      console.log("[ProjectManager] Already on this project, skipping");
      return;  // BUG: index.currentProjectId may be stale!
    }
```

**Fix:**
```typescript
// Add ref at component level (around line 135)
const indexRef = useRef(index);
useEffect(() => { indexRef.current = index; }, [index]);

// Modify handleSelectProject (line 496)
const handleSelectProject = useCallback(
  async (projectId: string) => {
    const currentIndex = indexRef.current; // Always fresh value

    if (projectId === currentIndex.currentProjectId) {
      return;
    }
    // ... rest uses currentIndex instead of index
  },
  [app, saveCurrentProject], // Remove index from dependencies
);
```

---

### BUG-002: 🟢 No Mutex on Project Operations Causes Race Conditions
**File:** `packages/excalidraw/components/ProjectManager/ProjectManager.tsx`
**Lines:** 495-562
**Symptom:** Rapid clicking between projects can cause data loss or corruption

**Root Cause:**
No lock prevents concurrent execution of `handleSelectProject`. If user clicks Project A then immediately clicks Project B:
1. First call starts saving current project (line 508)
2. Second call starts before first completes
3. Both calls try to update `index` state
4. Last write wins, potentially losing data

**Current Code (no protection):**
```typescript
const handleSelectProject = useCallback(
  async (projectId: string) => {
    // No check if another operation is in progress!
    if (index.currentProjectId) {
      await saveCurrentProject(index.currentProjectId); // Long async op
    }
    // User can click again during this await...
```

**Fix:**
```typescript
// Add ref at component level (around line 136)
const operationInProgress = useRef(false);

// Modify handleSelectProject
const handleSelectProject = useCallback(
  async (projectId: string) => {
    if (operationInProgress.current) {
      console.warn("[ProjectManager] Operation in progress, ignoring");
      return;
    }
    operationInProgress.current = true;

    try {
      // ... existing logic
    } finally {
      operationInProgress.current = false;
    }
  },
  [...]
);
```

---

### BUG-003: 🟢 Index Cache Divergence Between ProjectManagerData and ProjectManager
**File:** `packages/excalidraw/components/ProjectManager/ProjectManager.tsx` + `excalidraw-app/data/ProjectManagerData.ts`
**Lines:** ProjectManager.tsx:43, 131, 558 | ProjectManagerData.ts:102, 137-144, 251-253
**Symptom:** Auto-save may save to wrong project or UI shows wrong active project

**Root Cause:**
Two separate index states exist:
1. `cachedIndex` in ProjectManagerData.ts (line 102) - used by auto-save
2. `index` state in ProjectManager.tsx (line 131) - used by UI

They sync via `ProjectManagerData.updateCachedIndex(index)` (line 43) but ONLY when user manually saves. The debounced auto-save (lines 108-148 in ProjectManagerData.ts) updates `cachedIndex` without notifying the UI component.

**Current Code (ProjectManager.tsx line 43):**
```typescript
async saveIndex(index: ProjectsIndex): Promise<void> {
  // IMPORTANT: Also update the cached index in ProjectManagerData to prevent
  // race conditions where the debounced auto-save overwrites our changes
  ProjectManagerData.updateCachedIndex(index);
  await fetch("/api/projects/save", {...});
},
```

**Current Code (ProjectManagerData.ts lines 137-144):**
```typescript
// Update the project's updatedAt timestamp
if (cachedIndex) {
  cachedIndex = {
    ...cachedIndex,
    projects: cachedIndex.projects.map((p) =>
      p.id === projectId ? { ...p, updatedAt: Date.now() } : p,
    ),
  };
  await api.saveIndex(cachedIndex);  // UI doesn't know about this!
}
```

**Fix (ProjectManager.tsx - add around line 155):**
```typescript
// Keep ProjectManagerData cache in sync with local state
useEffect(() => {
  ProjectManagerData.updateCachedIndex(index);
}, [index]);
```

---

### BUG-004: 🔴 Blob URL Memory Leak in getVideoThumbnail
**File:** `packages/element/src/embeddable.ts`
**Lines:** 755-770
**Symptom:** Memory usage grows over time when working with videos

**Root Cause:**
`URL.createObjectURL(blob)` creates a blob URL (line 763) that holds a reference to the blob in memory. This URL is returned but **never revoked** anywhere in the codebase. Each call leaks memory.

**Current Code:**
```typescript
export const getVideoThumbnail = async (url: string): Promise<string | null> => {
  // ... YouTube handling ...

  if (isDirectVideoUrl(url)) {
    const cleanUrl = stripVideoOptionsFromUrl(url);
    const blob = await captureVideoFrame(cleanUrl);
    if (blob) {
      return URL.createObjectURL(blob);  // LINE 763 - NEVER REVOKED!
    }
  }
  return null;
};
```

**Fix Option A (caller manages lifecycle):**
```typescript
// Return blob instead of URL, let caller create/revoke URL
export const getVideoThumbnail = async (url: string): Promise<Blob | null> => {
  // ...
  if (isDirectVideoUrl(url)) {
    const cleanUrl = stripVideoOptionsFromUrl(url);
    return await captureVideoFrame(cleanUrl);  // Return blob directly
  }
  return null;
};
```

**Fix Option B (document and add cleanup helper):**
```typescript
// Add to embeddable.ts exports
const videoThumbnailUrls = new Set<string>();

export const getVideoThumbnail = async (url: string): Promise<string | null> => {
  // ...
  if (blob) {
    const blobUrl = URL.createObjectURL(blob);
    videoThumbnailUrls.add(blobUrl);
    return blobUrl;
  }
};

export const cleanupVideoThumbnails = () => {
  videoThumbnailUrls.forEach(url => URL.revokeObjectURL(url));
  videoThumbnailUrls.clear();
};
```

---

### BUG-005: 🟢 Blob URL Memory Leak in getVideoDimensions
**File:** `packages/excalidraw/components/VideoEmbedDialog.tsx`
**Lines:** 68-88
**Symptom:** Memory leak when opening video dialog multiple times

**Root Cause:**
The function creates a blob URL (line 74) but if neither `onloadedmetadata` nor `onerror` fires (network hang, browser issue), the URL is never revoked. No timeout exists.

**Current Code:**
```typescript
const getVideoDimensions = (file: File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    const blobUrl = URL.createObjectURL(file);  // Line 74

    video.onloadedmetadata = () => {
      resolve({ width: video.videoWidth, height: video.videoHeight });
      URL.revokeObjectURL(blobUrl);  // Only revoked if this fires
    };

    video.onerror = () => {
      resolve({ width: 560, height: 315 });
      URL.revokeObjectURL(blobUrl);  // Only revoked if this fires
    };

    video.src = blobUrl;
    // NO TIMEOUT - if neither event fires, URL leaks forever!
  });
};
```

**Fix:**
```typescript
const getVideoDimensions = (file: File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const blobUrl = URL.createObjectURL(file);
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        URL.revokeObjectURL(blobUrl);
        video.src = "";
      }
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve({ width: 560, height: 315 });
    }, 10000);

    video.onloadedmetadata = () => {
      clearTimeout(timeoutId);
      const result = { width: video.videoWidth, height: video.videoHeight };
      cleanup();
      resolve(result);
    };

    video.onerror = () => {
      clearTimeout(timeoutId);
      cleanup();
      resolve({ width: 560, height: 315 });
    };

    video.src = blobUrl;
  });
};
```

---

## High Priority Issues (P1)

### BUG-006: 🟢 Path Traversal Vulnerability in sanitizeFolderName
**File:** `excalidraw-app/vite.config.mts`
**Lines:** 16-25
**Symptom:** Security vulnerability - malicious project names could escape projects directory

**Root Cause:**
The `sanitizeFolderName` function removes some characters but doesn't explicitly prevent `..` path traversal:

**Current Code:**
```typescript
function sanitizeFolderName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")  // Removes slashes but not ".."
    .replace(/^[\s.]+|[\s.]+$/g, "")  // Only removes leading/trailing dots
    .substring(0, 100)
    || "Untitled";
}
```

**Attack Vector:** A name like `....//....//etc` after processing could become `....etc` or similar

**Fix:**
```typescript
function sanitizeFolderName(name: string): string {
  return name
    .replace(/\.\./g, "_")           // Prevent path traversal FIRST
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .substring(0, 100)
    || "Untitled";
}
```

---

### BUG-007: 🟢 captureVideoFrame Timeout Check Logic Error
**File:** `packages/element/src/embeddable.ts`
**Lines:** 731-737
**Symptom:** Video frame capture can hang indefinitely

**Root Cause:**
The timeout only cleans up if `video.readyState` is falsy (0). But `readyState` can be 1 (HAVE_METADATA) and still not trigger `onloadeddata`. The promise hangs.

**Current Code:**
```typescript
setTimeout(() => {
  if (!video.readyState) {  // Only checks if 0!
    cleanup();
    resolve(null);
  }
}, 10000);
```

**Fix:**
```typescript
const timeoutId = setTimeout(() => {
  cleanup();
  resolve(null);  // Always resolve after timeout
}, 10000);

// Clear timeout in success handlers
video.onloadeddata = () => {
  clearTimeout(timeoutId);
  // ... rest of handler
};
```

---

### BUG-008: 🟢 VideoPlayer isSeekingRef Race Condition
**File:** `packages/excalidraw/components/VideoPlayer.tsx`
**Lines:** 35-42
**Symptom:** Video loop sometimes fails to work correctly

**Root Cause:**
The `isSeekingRef` flag is reset via `requestAnimationFrame`, but RAF is not guaranteed to fire before the next `timeupdate` event. The flag may still be true when the next check happens.

**Current Code:**
```typescript
if (loop) {
  isSeekingRef.current = true;
  video.currentTime = startTime;
  requestAnimationFrame(() => {
    isSeekingRef.current = false;  // May fire AFTER next timeupdate!
  });
}
```

**Fix:**
```typescript
if (loop) {
  isSeekingRef.current = true;
  video.currentTime = startTime;

  const onSeeked = () => {
    isSeekingRef.current = false;
    video.removeEventListener('seeked', onSeeked);
  };
  video.addEventListener('seeked', onSeeked);
}
```

---

### BUG-009: 🟢 Missing AbortController in VideoEmbedDialog useEffect
**File:** `packages/excalidraw/components/VideoEmbedDialog.tsx`
**Lines:** 191-199
**Symptom:** Memory leak and potential state updates on unmounted component

**Root Cause:**
The useEffect fetches project ID but has no cleanup. If dialog closes before fetch completes, state update occurs on unmounted component.

**Current Code:**
```typescript
useEffect(() => {
  getCurrentProjectId().then((projectId) => {
    if (projectId) {
      setDialogState("video-dialog");  // May update unmounted component!
    } else {
      setDialogState("save-prompt");
    }
  });
}, []);
```

**Fix:**
```typescript
useEffect(() => {
  let mounted = true;

  getCurrentProjectId().then((projectId) => {
    if (!mounted) return;
    setDialogState(projectId ? "video-dialog" : "save-prompt");
  }).catch(() => {
    if (mounted) setDialogState("save-prompt");
  });

  return () => { mounted = false; };
}, []);
```

---

### BUG-010: 🟢 API Error Handling Missing in saveIndex
**File:** `packages/excalidraw/components/ProjectManager/ProjectManager.tsx`
**Lines:** 40-49
**Symptom:** Silent failures when saving project index

**Root Cause:**
The `saveIndex` function updates the local cache BEFORE the fetch completes. If fetch fails, cache is out of sync with server.

**Current Code:**
```typescript
async saveIndex(index: ProjectsIndex): Promise<void> {
  ProjectManagerData.updateCachedIndex(index);  // Updated BEFORE fetch!
  await fetch("/api/projects/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(index),
  });
  // No error handling! No res.ok check!
},
```

**Fix:**
```typescript
async saveIndex(index: ProjectsIndex): Promise<boolean> {
  try {
    const res = await fetch("/api/projects/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(index),
    });
    if (!res.ok) {
      console.error("[ProjectManager] Failed to save index:", res.status);
      return false;
    }
    // Only update cache after successful save
    ProjectManagerData.updateCachedIndex(index);
    return true;
  } catch (err) {
    console.error("[ProjectManager] Network error:", err);
    return false;
  }
},
```

---

### BUG-011: 🟢 Preview Generator Captures Stale Index
**File:** `packages/excalidraw/components/ProjectManager/ProjectManager.tsx`
**Lines:** 281-304
**Symptom:** Preview saved to wrong folder after project rename

**Root Cause:**
The preview generator callback captures `index` in its closure (line 284, 304). If project is renamed after generator is registered but before it executes, the stale index causes wrong path calculation.

**Current Code:**
```typescript
useEffect(() => {
  const generator = async (projectId: string) => {
    const project = index.projects.find((p) => p.id === projectId);  // Uses stale index!
    if (project?.hasCustomPreview) {
      return;
    }
    // ...
  };
  ProjectManagerData.setPreviewGenerator(generator);
  // ...
}, [generatePreview, index.projects]);  // index.projects in deps but closure is stale
```

**Fix:**
```typescript
useEffect(() => {
  const generator = async (projectId: string) => {
    // Fetch fresh index from ref instead of closure
    const currentIndex = indexRef.current;
    const project = currentIndex.projects.find((p) => p.id === projectId);
    if (project?.hasCustomPreview) {
      return;
    }
    // ...
  };
  ProjectManagerData.setPreviewGenerator(generator);
  // ...
}, [generatePreview]);  // Remove index.projects from deps
```

---

### BUG-012: 🟢 Debounce Not Cancelled on Project Switch
**File:** `excalidraw-app/data/ProjectManagerData.ts`
**Lines:** 108-148, 212-220
**Symptom:** Old project data may overwrite new project after switch

**Root Cause:**
When switching projects, the debounced save for the old project is not cancelled. It may fire with stale data.

**Current Code (no cancel):**
```typescript
static save(
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): void {
  if (cachedIndex?.currentProjectId) {
    this.saveDebounced(cachedIndex.currentProjectId, elements, appState, files);
  }
}
// No way to cancel pending debounce!
```

**Fix:**
```typescript
static cancelPendingSave(): void {
  this.saveDebounced.cancel();
}

// Call in handleSelectProject before switching:
// ProjectManagerData.cancelPendingSave();
```

---

### BUG-013: 🟢 SVG Export Missing x/y Attributes on Video Thumbnails
**File:** `packages/excalidraw/renderer/staticSvgScene.ts`
**Lines:** 184-202
**Symptom:** Video thumbnails positioned incorrectly in SVG exports

**Root Cause:**
SVG `<image>` elements require explicit `x` and `y` attributes. The code uses only `transform` for positioning.

**Current Code:**
```typescript
if (videoThumbnailDataUrl) {
  const image = svgRoot.ownerDocument.createElementNS(SVG_NS, "image");
  image.setAttribute("href", videoThumbnailDataUrl);
  image.setAttribute("width", `${element.width}`);
  image.setAttribute("height", `${element.height}`);
  // NO x/y attributes!
  image.setAttribute(
    "transform",
    `translate(${offsetX || 0} ${offsetY || 0}) rotate(${degree} ${cx} ${cy})`
  );
```

**Fix:**
```typescript
image.setAttribute("x", "0");
image.setAttribute("y", "0");
image.setAttribute("width", `${element.width}`);
image.setAttribute("height", `${element.height}`);
```

---

### BUG-014: 🟢 getVideoDuration Has No Timeout
**File:** `packages/excalidraw/components/hyperlink/Hyperlink.tsx`
**Lines:** 89-106
**Symptom:** Hyperlink panel hangs when video URL is CORS-blocked

**Current Code:**
```typescript
const getVideoDuration = async (url: string): Promise<number | null> => {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      resolve(video.duration);
    };

    video.onerror = () => {
      resolve(null);
    };

    video.src = cleanUrl;
    // NO TIMEOUT! Hangs forever if neither event fires
  });
};
```

**Fix:** Same pattern as BUG-005 - add 10 second timeout

---

### BUG-015: 🟢 Image Loading Timeout Doesn't Cancel Load
**File:** `packages/excalidraw/scene/videoThumbnails.ts`
**Lines:** 43-65
**Symptom:** Memory not released when image load times out

**Current Code:**
```typescript
const timeout = setTimeout(() => {
  if (!img.complete) {
    resolve(null);  // Resolves but image keeps loading!
  }
}, 10000);
```

**Fix:**
```typescript
const timeout = setTimeout(() => {
  img.src = "";  // Cancel the load
  resolve(null);
}, 10000);
```

---

### BUG-016: 🟢 Category Rename Doesn't Check for Conflicts
**File:** `excalidraw-app/vite.config.mts`
**Lines:** 327-354
**Symptom:** Renaming category to existing name silently fails or overwrites

**Current Code:**
```typescript
const oldPath = path.join(projectsDir, safeOldName);
const newPath = path.join(projectsDir, safeNewName);

if (oldPath !== newPath && fs.existsSync(oldPath)) {
  fs.renameSync(oldPath, newPath);  // Will fail if newPath exists!
}
```

**Fix:**
```typescript
if (oldPath !== newPath && fs.existsSync(oldPath)) {
  if (fs.existsSync(newPath)) {
    res.statusCode = 409;
    res.end(JSON.stringify({ error: "Category name already exists" }));
    return;
  }
  fs.renameSync(oldPath, newPath);
}
```

---

### BUG-017: 🟢 Unhandled Promise Rejection in Auto-Save
**File:** `excalidraw-app/data/ProjectManagerData.ts`
**Lines:** 108-148
**Symptom:** Silent save failures, inconsistent state

**Current Code:**
```typescript
private static saveDebounced = debounce(
  async (...) => {
    await api.saveScene(projectId, sceneData);  // No try/catch!
    if (previewGenerator) {
      await previewGenerator(projectId);  // No try/catch!
    }
    await api.saveIndex(cachedIndex);  // No try/catch!
  },
  1000,
);
```

**Fix:** Wrap entire function body in try/catch with error logging

---

## Medium Priority Issues (P2)

### BUG-018: 🟢 Context Menu Doesn't Close on Escape
**File:** `packages/excalidraw/components/ProjectManager/ProjectCard.tsx`
**Lines:** 131-138
**Fix:** Add keydown listener for Escape key

---

### BUG-019: 🔴 Tooltip Position Not Adjusted for Screen Edges
**File:** `packages/excalidraw/components/ProjectManager/ProjectCard.tsx`
**Lines:** 288-301
**Fix:** Add viewport boundary checking

---

### BUG-020: 🔴 Modal Auto-Focus Unreliable
**File:** `packages/excalidraw/components/ProjectManager/ProjectManager.tsx`
**Line:** 979
**Fix:** Use ref and imperative focus

---

### BUG-021: 🔴 Empty Project Names Become "Untitled" Silently
**File:** `packages/excalidraw/components/ProjectManager/ProjectManager.tsx`
**Lines:** 161-166
**Fix:** Show warning when name sanitizes to empty

---

### BUG-022: 🔴 Long Path Truncation Not Communicated to User
**File:** `excalidraw-app/vite.config.mts`
**Line:** 23
**Fix:** Return error if name exceeds limit

---

### BUG-023: 🟢 Grid Opacity Not Applied During Live Editing
**File:** `packages/excalidraw/renderer/staticScene.ts`
**Lines:** 56-133
**Symptom:** Grid opacity slider doesn't affect live canvas, only exports
**Fix:** Pass `appState.gridOpacity` to `strokeGrid` in interactive render path

---

### BUG-024: 🔴 Project IDs Not Validated
**File:** `excalidraw-app/vite.config.mts`
**Multiple lines
**Fix:** Validate projectId format before use

---

### BUG-025: 🔴 Index Validation Too Minimal
**File:** `excalidraw-app/vite.config.mts`
**Lines:** 105-124
**Fix:** Validate project objects have required fields

---

### BUG-026: 🔴 Stale Closure in Modal Handlers
**File:** `packages/excalidraw/components/ProjectManager/ProjectManager.tsx`
**Lines:** 325-335, 357-381
**Fix:** Use refs for app.state values

---

### BUG-027: 🔴 Project Validation Missing on Load
**File:** `packages/excalidraw/components/ProjectManager/ProjectManager.tsx`
**Lines:** 150-154
**Fix:** Validate all group references exist

---

### BUG-028: 🔴 Preview Cache Key Orphaned on Rename
**File:** `packages/excalidraw/components/ProjectManager/ProjectManager.tsx`
**Lines:** 169-187
**Fix:** Clear old cache key when project renamed

---

### BUG-029: 🔴 Silent Autoplay Failures in VideoPlayer
**File:** `packages/excalidraw/components/VideoPlayer.tsx`
**Line:** 61
**Current:** `video.play().catch(() => {});`
**Fix:** Log warning on autoplay failure

---

### BUG-030: 🔴 Error Recovery Missing in Project Save Flow
**File:** `packages/excalidraw/components/VideoEmbedDialog.tsx`
**Lines:** 300-325
**Fix:** Add retry button when save fails

---

### BUG-031: 🔴 Duration Refetch on Every Option Change
**File:** `packages/excalidraw/components/hyperlink/Hyperlink.tsx`
**Lines:** 220-233
**Fix:** Remove videoOptions.endTime from dependency array

---

### BUG-032: 🔴 Hyperlink Play State Sync Issue
**File:** `packages/excalidraw/components/hyperlink/Hyperlink.tsx`
**Lines:** 191-217
**Fix:** Retry listener attachment if video not mounted initially

---

### BUG-033: 🟢 Silent Thumbnail Failures in Export
**File:** `packages/excalidraw/scene/videoThumbnails.ts`
**Lines:** 80-116
**Fix:** Add warning logging for failed thumbnails

---

### BUG-034: 🔴 Canvas Memory in captureVideoFrame
**File:** `packages/element/src/embeddable.ts`
**Lines:** 697-719
**Fix:** Explicitly clear canvas context after use

---

### BUG-035: 🔴 Video Event Cleanup Race
**File:** `packages/element/src/embeddable.ts`
**Lines:** 682-688
**Fix:** Clear video src before removing listeners

---

### BUG-036: 🔴 Embed Link Cache Not Invalidated on Error
**File:** `packages/element/src/embeddable.ts`
**Lines:** 315-352
**Fix:** Don't cache failed lookups

---

### BUG-037: 🔴 Missing Loading States for Long Operations
**File:** `packages/excalidraw/components/ProjectManager/ProjectManager.tsx`
**Multiple locations
**Fix:** Add loading state for rename, delete, move operations

---

## Low Priority Issues (P3)

### BUG-038: 🔴 Debounce Threshold Not Configurable
**File:** `excalidraw-app/data/ProjectManagerData.ts`
**Line:** 147
**Note:** 1 second hardcoded

---

### BUG-039: 🔴 Inconsistent Error Messages in API
**File:** `excalidraw-app/vite.config.mts`
**Multiple lines

---

### BUG-040: 🔴 Uncategorized Section Empty State Inconsistent
**File:** `packages/excalidraw/components/ProjectManager/ProjectGroup.tsx`
**Lines:** 79-81

---

### BUG-041: 🔴 Favorite Projects Scroll Behavior
**File:** `packages/excalidraw/components/ProjectManager/ProjectManager.tsx`
**Lines:** 624-630

---

### BUG-042: 🔴 Group Expand State No Visual Feedback
**File:** `packages/excalidraw/components/ProjectManager/ProjectGroup.tsx`
**Line:** 51

---

### BUG-043: 🔴 Tooltip Memory Leak on Rapid Hover
**File:** `packages/excalidraw/components/ProjectManager/ProjectCard.tsx`
**Lines:** 45, 77-112

---

### BUG-044: 🔴 useNativeLoop Logic Confusing
**File:** `packages/excalidraw/components/VideoPlayer.tsx`
**Lines:** 106-107

---

### BUG-045: 🔴 handleEnded and handleTimeUpdate Race
**File:** `packages/excalidraw/components/VideoPlayer.tsx`
**Lines:** 27-67

---

### BUG-046-067: Additional Minor Issues
(See explore agent outputs for complete details - these are cosmetic or edge-case issues)

---

## Implementation Tracking

| Phase | Issues | Status | Date |
|-------|--------|--------|------|
| Phase 1: Critical | BUG-001 to BUG-003, BUG-005 | 🟢 Fixed | 2026-01-14 |
| Phase 2: High P1 | BUG-006 to BUG-017 | 🟢 Fixed | 2026-01-14 |
| Phase 3: Medium P2 | BUG-018, BUG-023, BUG-033 | 🟢 Fixed | 2026-01-14 |
| Phase 3: Medium P2 | BUG-019 to BUG-037 (remaining) | 🔴 Open | - |
| Phase 4: Low P3 | BUG-038 to BUG-067 | 🔴 Open | - |

**Note:** BUG-004 (getVideoThumbnail blob URL leak) - Function exists but is unused in codebase; no actual leak occurring.

---

## Quick Reference: Files to Modify

```
packages/excalidraw/components/ProjectManager/
├── ProjectManager.tsx     # BUG-001,002,003,010,011,020,021,026,027,028,030,037
├── ProjectCard.tsx        # BUG-018,019,043
└── ProjectGroup.tsx       # BUG-040,042

packages/excalidraw/components/
├── VideoEmbedDialog.tsx   # BUG-005,009
├── VideoPlayer.tsx        # BUG-008,029,044,045
├── GridOpacitySlider.tsx  # (no bugs)
└── hyperlink/Hyperlink.tsx # BUG-014,031,032

packages/element/src/
└── embeddable.ts          # BUG-004,007,034,035,036

packages/excalidraw/scene/
└── videoThumbnails.ts     # BUG-015,033

packages/excalidraw/renderer/
├── staticScene.ts         # BUG-023
└── staticSvgScene.ts      # BUG-013

excalidraw-app/
├── data/ProjectManagerData.ts  # BUG-003,012,017,038
└── vite.config.mts        # BUG-006,016,022,024,025,039
```
