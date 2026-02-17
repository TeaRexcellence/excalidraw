import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
} from "react";
import Prism from "prismjs";

// Prism language imports — ORDER MATTERS (dependencies first)
import "prismjs/components/prism-markup"; // must be before php, markdown
import "prismjs/components/prism-css"; // must be before markup-templating
import "prismjs/components/prism-javascript"; // must be before typescript
import "prismjs/components/prism-c"; // must be before cpp
import "prismjs/components/prism-markup-templating"; // must be before php
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-php";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-scala";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-powershell";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-lua";
import "prismjs/components/prism-perl";
import "prismjs/components/prism-r";
import "prismjs/components/prism-dart";

import { CaptureUpdateAction } from "@excalidraw/element";
import { THEME } from "@excalidraw/common";

import type {
  ExcalidrawCodeBlockElement,
  CodeBlockLanguage,
} from "@excalidraw/element/types";

import { t } from "../i18n";
import {
  detectLanguageFromContent,
  detectLanguageFromExtension,
} from "../utils/languageDetect";

import { useApp } from "./App";

import "./CodeBlockEditorModal.scss";

// Duplicated from renderCodeBlock.ts intentionally — importing from
// @excalidraw/element would pull Prism + all grammars into this lazy chunk,
// defeating code-splitting.
const LANGUAGE_LABELS: Record<CodeBlockLanguage, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  java: "Java",
  csharp: "C#",
  cpp: "C++",
  go: "Go",
  rust: "Rust",
  ruby: "Ruby",
  php: "PHP",
  swift: "Swift",
  kotlin: "Kotlin",
  scala: "Scala",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  yaml: "YAML",
  sql: "SQL",
  bash: "Bash",
  powershell: "PowerShell",
  markdown: "Markdown",
  xml: "XML",
  docker: "Dockerfile",
  lua: "Lua",
  perl: "Perl",
  r: "R",
  dart: "Dart",
  plaintext: "Plain Text",
};

const PRISM_LANG_KEY: Record<CodeBlockLanguage, string | null> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  java: "java",
  csharp: "csharp",
  cpp: "cpp",
  go: "go",
  rust: "rust",
  ruby: "ruby",
  php: "php",
  swift: "swift",
  kotlin: "kotlin",
  scala: "scala",
  html: "markup",
  css: "css",
  json: "json",
  yaml: "yaml",
  sql: "sql",
  bash: "bash",
  powershell: "powershell",
  markdown: "markdown",
  xml: "markup",
  docker: "docker",
  lua: "lua",
  perl: "perl",
  r: "r",
  dart: "dart",
  plaintext: null,
};

// Inline token colors — dark (Catppuccin Mocha)
const DARK_TOKEN_COLORS: Record<string, string> = {
  keyword: "#cba6f7",
  string: "#a6e3a1",
  char: "#a6e3a1",
  comment: "#6c7086",
  number: "#fab387",
  function: "#89b4fa",
  punctuation: "#9399b2",
  operator: "#89dceb",
  "class-name": "#f9e2af",
  builtin: "#f9e2af",
  boolean: "#cba6f7",
  property: "#89b4fa",
  tag: "#f38ba8",
  "attr-name": "#fab387",
  "attr-value": "#a6e3a1",
  regex: "#f5c2e7",
  important: "#f38ba8",
  deleted: "#f38ba8",
  inserted: "#a6e3a1",
  selector: "#a6e3a1",
  atrule: "#cba6f7",
  constant: "#fab387",
  "template-string": "#a6e3a1",
};

// Inline token colors — light
const LIGHT_TOKEN_COLORS: Record<string, string> = {
  keyword: "#7c3aed",
  string: "#16a34a",
  char: "#16a34a",
  comment: "#9ca3af",
  number: "#ea580c",
  function: "#2563eb",
  punctuation: "#6b7280",
  operator: "#0891b2",
  "class-name": "#ca8a04",
  builtin: "#ca8a04",
  boolean: "#7c3aed",
  property: "#2563eb",
  tag: "#dc2626",
  "attr-name": "#ea580c",
  "attr-value": "#16a34a",
  regex: "#db2777",
  important: "#dc2626",
  deleted: "#dc2626",
  inserted: "#16a34a",
  selector: "#16a34a",
  atrule: "#7c3aed",
  constant: "#ea580c",
  "template-string": "#16a34a",
};

const escapeHTML = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Convert Prism tokens to HTML with inline styles (bulletproof, no CSS needed)
const tokensToInlineHTML = (
  tokens: Array<string | Prism.Token>,
  tokenColors: Record<string, string>,
): string => {
  let html = "";
  for (const token of tokens) {
    if (typeof token === "string") {
      html += escapeHTML(token);
    } else {
      const color = tokenColors[token.type];
      const italic = token.type === "comment" ? ";font-style:italic" : "";
      const styleAttr =
        color || italic ? ` style="color:${color || "inherit"}${italic}"` : "";
      const content = Array.isArray(token.content)
        ? tokensToInlineHTML(
            token.content as Array<string | Prism.Token>,
            tokenColors,
          )
        : escapeHTML(String(token.content));
      html += `<span${styleAttr}>${content}</span>`;
    }
  }
  return html;
};

// Sorted language options for the dropdown
const LANGUAGE_OPTIONS = (
  Object.entries(LANGUAGE_LABELS) as [CodeBlockLanguage, string][]
).sort((a, b) => a[1].localeCompare(b[1]));

interface CodeBlockEditorModalInnerProps {
  elementId: string;
  onClose: () => void;
}

const CodeBlockEditorModalInner: React.FC<CodeBlockEditorModalInnerProps> = ({
  elementId,
  onClose,
}) => {
  const app = useApp();

  const element = app.scene.getElement(elementId) as
    | ExcalidrawCodeBlockElement
    | undefined;

  const [code, setCode] = useState(element?.code ?? "");
  const [language, setLanguage] = useState<CodeBlockLanguage>(
    element?.language ?? "plaintext",
  );
  const [showLineNumbers, setShowLineNumbers] = useState(
    element?.showLineNumbers ?? true,
  );
  // Track whether user manually picked a language — if so, stop auto-detecting
  const userPickedLanguage = useRef(
    element?.language != null && element.language !== "plaintext",
  );

  // Track whether the element was empty when the editor opened.
  // If still empty on close, treat as cancel and delete the element.
  const wasEmptyOnOpen = useRef(!element?.code?.trim());

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isDark = app.state.theme === THEME.DARK;
  const tokenColors = isDark ? DARK_TOKEN_COLORS : LIGHT_TOKEN_COLORS;

  // Highlight code with Prism — uses inline styles for bulletproof rendering
  const highlightedHTML = useMemo(() => {
    const langKey = PRISM_LANG_KEY[language];
    if (langKey && Prism.languages[langKey]) {
      const tokens = Prism.tokenize(code, Prism.languages[langKey]);
      return tokensToInlineHTML(tokens, tokenColors);
    }
    return escapeHTML(code);
  }, [code, language, tokenColors]);

  // Line numbers
  const lineCount = useMemo(() => code.split("\n").length, [code]);

  // Sync scroll between textarea and highlighted pre
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const pre = highlightRef.current;
    const ln = lineNumbersRef.current;
    if (!ta) {
      return;
    }
    if (pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
    if (ln) {
      ln.style.transform = `translateY(${-ta.scrollTop}px)`;
    }
  }, []);

  // Import code from file
  const handleFileImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        setCode(text);

        // Detect language from filename (handles Dockerfile, extensions, etc.)
        const detected = detectLanguageFromExtension(file.name);
        if (detected !== "plaintext") {
          setLanguage(detected);
          userPickedLanguage.current = true;
        }
      };
      reader.readAsText(file);
      // Reset so the same file can be selected again
      e.target.value = "";
    },
    [],
  );

  // Save changes back to element
  const handleDone = useCallback(() => {
    // If it was empty when opened and still empty → cancel (delete element)
    if (!code.trim() && wasEmptyOnOpen.current) {
      const freshElement = app.scene.getElement(elementId);
      if (freshElement) {
        app.scene.mutateElement(freshElement as any, { isDeleted: true });
      }
      app.syncActionResult({
        appState: { ...app.state, openDialog: null },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      onClose();
      return;
    }

    const freshElement = app.scene.getElement(elementId);
    if (freshElement) {
      app.scene.mutateElement(freshElement as ExcalidrawCodeBlockElement, {
        code,
        language,
        showLineNumbers,
      });
    }

    app.syncActionResult({
      appState: {
        ...app.state,
        openDialog: null,
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    onClose();
  }, [app, elementId, code, language, showLineNumbers, onClose]);

  // Auto-detect language as user types (debounced, only while they haven't manually picked)
  useEffect(() => {
    if (userPickedLanguage.current || !code.trim()) {
      return;
    }
    const timer = window.setTimeout(() => {
      const detected = detectLanguageFromContent(code);
      if (detected !== "plaintext") {
        setLanguage(detected);
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [code]);

  // Handle tab key for indentation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;

        if (e.shiftKey) {
          // Dedent: remove leading 2 spaces from selected lines
          const before = code.substring(0, start);
          const after = code.substring(end);
          const selected = code.substring(start, end);

          // Find start of first line
          const lineStart = before.lastIndexOf("\n") + 1;
          const prefix = code.substring(lineStart, start);
          const toProcess = prefix + selected;
          const lines = toProcess.split("\n");
          const dedented = lines
            .map((line) => (line.startsWith("  ") ? line.substring(2) : line))
            .join("\n");
          const newCode = code.substring(0, lineStart) + dedented + after;
          setCode(newCode);

          // Adjust selection
          requestAnimationFrame(() => {
            const diff = toProcess.length - dedented.length;
            const firstLineDiff = lines[0].startsWith("  ") ? 2 : 0;
            ta.selectionStart = Math.max(lineStart, start - firstLineDiff);
            ta.selectionEnd = end - diff;
          });
        } else {
          // Indent: insert 2 spaces
          const newCode = `${code.substring(0, start)}  ${code.substring(end)}`;
          setCode(newCode);
          requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = start + 2;
          });
        }
      }
    },
    [code],
  );

  // Block ALL keyboard events from reaching Excalidraw's native document listener.
  // Without this, Ctrl+Z etc. would trigger Excalidraw's undo instead of the editor's.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleDone();
        return;
      }
      // Stop all other keys from propagating to Excalidraw
      e.stopPropagation();
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [handleDone]);

  // Focus textarea on mount
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.focus();
      // Move cursor to end
      ta.selectionStart = ta.selectionEnd = ta.value.length;
    }
  }, []);

  // Close if element was deleted while editor is open
  useEffect(() => {
    if (!element) {
      onClose();
    }
  }, [element, onClose]);

  if (!element) {
    return null;
  }

  return (
    <div
      className="CodeBlockEditorModal-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          handleDone();
        }
      }}
    >
      <div
        className="CodeBlockEditorModal"
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="CodeBlockEditorModal__toolbar">
          <div className="CodeBlockEditorModal__toolbarLeft">
            <span className="CodeBlockEditorModal__title">
              {t("codeBlockEditor.title")}
            </span>
            <select
              className="CodeBlockEditorModal__langSelect"
              value={language}
              onChange={(e) => {
                userPickedLanguage.current = true;
                setLanguage(e.target.value as CodeBlockLanguage);
              }}
            >
              {LANGUAGE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="CodeBlockEditorModal__toolbarRight">
            <label className="CodeBlockEditorModal__lineNumToggle">
              <input
                type="checkbox"
                checked={showLineNumbers}
                onChange={(e) => setShowLineNumbers(e.target.checked)}
              />
              {t("codeBlockEditor.lineNumbers")}
            </label>
            <button
              className="CodeBlockEditorModal__btn"
              onClick={() => fileInputRef.current?.click()}
            >
              {t("codeBlockEditor.importFile")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileImport}
              style={{ display: "none" }}
            />
            <button
              className="CodeBlockEditorModal__btn CodeBlockEditorModal__btn--primary"
              onClick={handleDone}
            >
              {t("codeBlockEditor.done")}
            </button>
          </div>
        </div>

        {/* Editor */}
        <div className="CodeBlockEditorModal__editorWrap" ref={editorWrapRef}>
          {showLineNumbers && (
            <div className="CodeBlockEditorModal__lineNumbers">
              <div ref={lineNumbersRef}>
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
            </div>
          )}
          <div
            className={`CodeBlockEditorModal__codeArea ${
              showLineNumbers ? "" : "CodeBlockEditorModal__codeArea--noGutter"
            }`}
          >
            {!code && (
              <div
                className="CodeBlockEditorModal__placeholder"
                style={{ color: isDark ? "#6c7086" : "#9ca3af", fontStyle: "italic" }}
              >
                {"// Code Editor\n//\n// Start typing or paste your code here.\n// Language is detected automatically.\n// You can also import a file using the\n// button in the top right of the toolbar."}
              </div>
            )}
            <pre
              ref={highlightRef}
              className="CodeBlockEditorModal__highlighted"
              dangerouslySetInnerHTML={{ __html: `${highlightedHTML}\n` }}
            />
            <textarea
              ref={textareaRef}
              className="CodeBlockEditorModal__textarea"
              style={{
                color: "transparent",
                backgroundColor: "transparent",
                border: "none",
                caretColor: isDark ? "#cdd6f4" : "#1f2937",
              }}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onScroll={syncScroll}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeBlockEditorModalInner;
