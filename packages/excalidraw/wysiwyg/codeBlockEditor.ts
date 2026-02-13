import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-markdown";

import type { ExcalidrawCodeBlockElement, CodeBlockLanguage } from "@excalidraw/element/types";
import type { Scene } from "@excalidraw/element";

import "./codeBlockEditor.scss";

const LANGUAGE_MAP: Record<CodeBlockLanguage, string | null> = {
  javascript: "javascript",
  python: "python",
  csharp: "csharp",
  cpp: "cpp",
  markdown: "markdown",
  plaintext: null,
};

const LANGUAGE_LABELS: Record<CodeBlockLanguage, string> = {
  javascript: "JavaScript",
  python: "Python",
  csharp: "C#",
  cpp: "C++",
  markdown: "Markdown",
  plaintext: "Plain Text",
};

interface OpenCodeBlockEditorOpts {
  element: ExcalidrawCodeBlockElement;
  excalidrawContainer: HTMLDivElement | null;
  scene: Scene;
  onClose: () => void;
}

export const openCodeBlockEditor = ({
  element,
  excalidrawContainer,
  scene,
  onClose,
}: OpenCodeBlockEditorOpts): (() => void) => {
  if (!excalidrawContainer) {
    onClose();
    return () => {};
  }

  let closed = false;

  // Backdrop
  const backdrop = document.createElement("div");
  backdrop.className = "excalidraw-codeBlockEditor-backdrop";

  // Modal container
  const editorDiv = document.createElement("div");
  editorDiv.className = "excalidraw-codeBlockEditor";

  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "excalidraw-codeBlockEditor__toolbar";

  const toolbarLeft = document.createElement("div");
  toolbarLeft.className = "excalidraw-codeBlockEditor__toolbarLeft";

  const langLabel = document.createElement("span");
  langLabel.className = "excalidraw-codeBlockEditor__langLabel";
  langLabel.textContent = "Language:";

  const langSelect = document.createElement("select");
  let currentLanguage: CodeBlockLanguage = element.language;

  for (const [key, label] of Object.entries(LANGUAGE_LABELS)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = label;
    if (key === element.language) {
      opt.selected = true;
    }
    langSelect.appendChild(opt);
  }

  toolbarLeft.appendChild(langLabel);
  toolbarLeft.appendChild(langSelect);
  toolbar.appendChild(toolbarLeft);

  const closeBtn = document.createElement("button");
  closeBtn.className = "excalidraw-codeBlockEditor__closeBtn";
  closeBtn.textContent = "Done (Esc)";
  toolbar.appendChild(closeBtn);

  editorDiv.appendChild(toolbar);

  // Editor wrap
  const editorWrap = document.createElement("div");
  editorWrap.className = "excalidraw-codeBlockEditor__editorWrap";

  // Line numbers
  const lineNumbers = document.createElement("div");
  lineNumbers.className = "excalidraw-codeBlockEditor__lineNumbers";

  // Highlighted pre
  const highlightedPre = document.createElement("pre");
  highlightedPre.className = "excalidraw-codeBlockEditor__highlighted";

  // Textarea
  const textarea = document.createElement("textarea");
  textarea.className = "excalidraw-codeBlockEditor__textarea";
  textarea.value = element.code;
  textarea.spellcheck = false;

  editorWrap.appendChild(lineNumbers);
  editorWrap.appendChild(highlightedPre);
  editorWrap.appendChild(textarea);
  editorDiv.appendChild(editorWrap);
  backdrop.appendChild(editorDiv);
  excalidrawContainer.appendChild(backdrop);

  const updateHighlight = () => {
    const code = textarea.value;
    const langKey = LANGUAGE_MAP[currentLanguage];
    let html: string;

    if (langKey && Prism.languages[langKey]) {
      html = Prism.highlight(code, Prism.languages[langKey], langKey);
    } else {
      html = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
    highlightedPre.innerHTML = html;

    // Update line numbers
    const lines = code.split("\n");
    lineNumbers.innerHTML = lines
      .map((_, i) => `<div>${i + 1}</div>`)
      .join("");
  };

  const syncScroll = () => {
    highlightedPre.scrollTop = textarea.scrollTop;
    highlightedPre.scrollLeft = textarea.scrollLeft;
    lineNumbers.style.top = `${16 - textarea.scrollTop}px`;
  };

  // Initial render
  updateHighlight();

  // Event listeners
  textarea.addEventListener("input", updateHighlight);
  textarea.addEventListener("scroll", syncScroll);

  langSelect.addEventListener("change", () => {
    currentLanguage = langSelect.value as CodeBlockLanguage;
    updateHighlight();
  });

  // Handle Tab key for indentation
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value =
        textarea.value.substring(0, start) +
        "  " +
        textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      updateHighlight();
    }
  });

  // Focus textarea
  setTimeout(() => textarea.focus(), 0);

  // Close function
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;

    // Save changes back to element
    scene.mutateElement(element, {
      code: textarea.value,
      language: currentLanguage,
    });

    backdrop.remove();
    onClose();
  };

  // Close on Escape
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener("keydown", handleKeyDown, true);

  // Close button
  closeBtn.addEventListener("click", close);

  // Close on backdrop click (not on the editor itself)
  backdrop.addEventListener("pointerdown", (e) => {
    if (e.target === backdrop) {
      close();
    }
  });

  // Block all events from reaching the canvas
  backdrop.addEventListener("wheel", (e) => e.stopPropagation());

  // Return cleanup function
  return () => {
    document.removeEventListener("keydown", handleKeyDown, true);
    close();
  };
};
