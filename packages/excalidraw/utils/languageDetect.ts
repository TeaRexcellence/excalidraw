import type { CodeBlockLanguage } from "@excalidraw/element/types";

const EXTENSION_TO_LANGUAGE: Record<string, CodeBlockLanguage> = {
  js: "javascript",
  jsx: "javascript",
  ts: "javascript",
  tsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  pyw: "python",
  cs: "csharp",
  cpp: "cpp",
  c: "cpp",
  h: "cpp",
  hpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  md: "markdown",
  mdx: "markdown",
  markdown: "markdown",
};

export const detectLanguageFromExtension = (
  filename: string,
): CodeBlockLanguage => {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TO_LANGUAGE[ext] ?? "plaintext";
};
