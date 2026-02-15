import type { CodeBlockLanguage } from "@excalidraw/element/types";

const EXTENSION_TO_LANGUAGE: Record<string, CodeBlockLanguage> = {
  // JavaScript / TypeScript
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  // Python
  py: "python",
  pyw: "python",
  pyi: "python",
  // Java
  java: "java",
  // C#
  cs: "csharp",
  csx: "csharp",
  // C / C++
  c: "cpp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  h: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  // Go
  go: "go",
  // Rust
  rs: "rust",
  // Ruby
  rb: "ruby",
  rake: "ruby",
  gemspec: "ruby",
  // PHP
  php: "php",
  phtml: "php",
  // Swift
  swift: "swift",
  // Kotlin
  kt: "kotlin",
  kts: "kotlin",
  // Scala
  scala: "scala",
  sc: "scala",
  // HTML
  html: "html",
  htm: "html",
  // CSS
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",
  // JSON
  json: "json",
  jsonc: "json",
  // YAML
  yml: "yaml",
  yaml: "yaml",
  // SQL
  sql: "sql",
  // Shell
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  // PowerShell
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  // Markdown
  md: "markdown",
  mdx: "markdown",
  markdown: "markdown",
  // XML
  xml: "xml",
  xsl: "xml",
  xslt: "xml",
  svg: "xml",
  // Docker
  dockerfile: "docker",
  // Lua
  lua: "lua",
  // Perl
  pl: "perl",
  pm: "perl",
  // R
  r: "r",
  R: "r",
  // Dart
  dart: "dart",
};

export const detectLanguageFromExtension = (
  filename: string,
): CodeBlockLanguage => {
  const lower = filename.toLowerCase();
  // Handle Dockerfile (no extension)
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) {
    return "docker";
  }
  const ext = lower.split(".").pop() ?? "";
  return EXTENSION_TO_LANGUAGE[ext] ?? "plaintext";
};

// ── Content-based language detection ─────────────────────────────────

interface LanguagePattern {
  language: CodeBlockLanguage;
  patterns: RegExp[];
  weight?: number; // bonus weight per match (default 1)
}

const LANGUAGE_PATTERNS: LanguagePattern[] = [
  {
    language: "python",
    patterns: [
      /^(import\s+\w|from\s+\w+\s+import)/m,
      /\bdef\s+\w+\s*\(/m,
      /\bclass\s+\w+.*:/m,
      /\bprint\s*\(/m,
      /\bself\b/,
      /\b(elif|except|finally|lambda|yield)\b/,
      /^\s*#.*coding[:=]/m,
      /\bif\s+__name__\s*==\s*['"]__main__['"]/,
    ],
  },
  {
    language: "javascript",
    patterns: [
      /\b(const|let|var)\s+\w+\s*=/,
      /\bfunction\s+\w+\s*\(/,
      /=>\s*[{(]/,
      /\bconsole\.(log|warn|error)\s*\(/,
      /\brequire\s*\(/,
      /\bmodule\.exports\b/,
      /\bdocument\.(getElementById|querySelector)/,
      /\bnew\s+Promise\b/,
    ],
  },
  {
    language: "typescript",
    patterns: [
      /:\s*(string|number|boolean|void|any|unknown|never)\b/,
      /\binterface\s+\w+/,
      /\btype\s+\w+\s*=/,
      /\benum\s+\w+/,
      /<\w+(\s*,\s*\w+)*>/,
      /\bas\s+(string|number|any|const)\b/,
      /\bReadonly<|Partial<|Record</,
    ],
  },
  {
    language: "java",
    patterns: [
      /\bpublic\s+(static\s+)?class\s+\w+/,
      /\bSystem\.out\.println\s*\(/,
      /\bpublic\s+static\s+void\s+main\s*\(/,
      /\bimport\s+java\./,
      /\b(extends|implements)\s+\w+/,
      /@Override\b/,
      /\bnew\s+\w+\s*<.*>\s*\(/,
    ],
  },
  {
    language: "csharp",
    patterns: [
      /\busing\s+System/,
      /\bnamespace\s+\w+/,
      /\bpublic\s+(partial\s+)?class\s+\w+/,
      /\bConsole\.(Write|ReadLine)/,
      /\basync\s+Task</,
      /\bvar\s+\w+\s*=\s*new\b/,
      /\bstring\[\]\s+args\b/,
    ],
  },
  {
    language: "cpp",
    patterns: [
      /^#include\s*[<"]/m,
      /\bstd::/,
      /\bcout\s*<</,
      /\bcin\s*>>/,
      /\bint\s+main\s*\(/,
      /\bvector<|map<|string>/,
      /\bnamespace\s+\w+/,
      /\btemplate\s*</,
    ],
  },
  {
    language: "go",
    patterns: [
      /^package\s+\w+/m,
      /\bfunc\s+(\(\w+\s+\*?\w+\)\s+)?\w+\s*\(/,
      /\bfmt\.(Print|Sprintf|Errorf)/,
      /\b:=\s/,
      /\bgo\s+func\b/,
      /\bchan\s+\w+/,
      /\bdefer\s+/,
      /\bimport\s*\(/,
    ],
  },
  {
    language: "rust",
    patterns: [
      /\bfn\s+\w+\s*[(<]/,
      /\blet\s+(mut\s+)?\w+/,
      /\bimpl\s+\w+/,
      /\bpub\s+(fn|struct|enum|mod)\b/,
      /\buse\s+std::/,
      /\bmatch\s+\w+\s*\{/,
      /\bprintln!\s*\(/,
      /\bOption<|Result<|Vec</,
    ],
  },
  {
    language: "ruby",
    patterns: [
      /\bdef\s+\w+/,
      /\bputs\s+/,
      /\brequire\s+['"]/,
      /\bclass\s+\w+\s*<\s*\w+/,
      /\battr_(accessor|reader|writer)\b/,
      /\bdo\s*\|/,
      /\bend\s*$/m,
      /\b\.each\s+do\b/,
    ],
  },
  {
    language: "php",
    patterns: [
      /^<\?php/m,
      /\$\w+\s*=/,
      /\bfunction\s+\w+\s*\(/,
      /\becho\s+/,
      /\b->\w+\s*\(/,
      /\buse\s+\w+\\\w+/,
    ],
  },
  {
    language: "swift",
    patterns: [
      /\bfunc\s+\w+\s*\(/,
      /\bvar\s+\w+\s*:\s*\w+/,
      /\blet\s+\w+\s*:\s*\w+/,
      /\bguard\s+let\b/,
      /\bimport\s+(UIKit|Foundation|SwiftUI)/,
      /\bprint\s*\("/,
    ],
  },
  {
    language: "kotlin",
    patterns: [
      /\bfun\s+\w+\s*\(/,
      /\bval\s+\w+\s*[=:]/,
      /\bvar\s+\w+\s*[=:]/,
      /\bprintln\s*\(/,
      /\bdata\s+class\b/,
      /\bwhen\s*\(/,
    ],
  },
  {
    language: "html",
    patterns: [
      /<!DOCTYPE\s+html>/i,
      /<html[\s>]/i,
      /<\/?(div|span|p|a|h[1-6]|body|head|script|style)[\s>]/i,
      /<meta\s/i,
      /<link\s+rel=/i,
    ],
  },
  {
    language: "css",
    patterns: [
      /[.#]\w+\s*\{/,
      /\b(margin|padding|display|color|background|font-size)\s*:/,
      /@media\s*\(/,
      /@import\s+/,
      /\b(flex|grid|block|none|inherit)\s*;/,
    ],
  },
  {
    language: "json",
    patterns: [/^\s*[[{]/, /"\w+"\s*:\s*["{[dtfn]/],
    weight: 0.5, // JSON patterns are very generic, lower weight
  },
  {
    language: "yaml",
    patterns: [/^\w[\w-]*:\s/m, /^\s*-\s+\w/m, /^---\s*$/m],
    weight: 0.7,
  },
  {
    language: "sql",
    patterns: [
      /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i,
      /\bFROM\s+\w+/i,
      /\bWHERE\s+/i,
      /\bJOIN\s+\w+/i,
      /\bGROUP\s+BY\b/i,
      /\bORDER\s+BY\b/i,
    ],
  },
  {
    language: "bash",
    patterns: [
      /^#!/m,
      /\b(echo|export|source|alias)\s+/,
      /\$\{\w+\}/,
      /\bif\s+\[\s/,
      /\bfi\s*$/m,
      /\|\s*grep\b/,
    ],
  },
  {
    language: "powershell",
    patterns: [
      /\$\w+\s*=/,
      /\b(Get-|Set-|New-|Remove-|Write-Host|Write-Output)\w*/,
      /\bparam\s*\(/i,
      /\b-eq\b|\b-ne\b|\b-like\b/,
      /\bForEach-Object\b/i,
    ],
  },
  {
    language: "markdown",
    patterns: [
      /^#{1,6}\s+/m,
      /^\s*[-*+]\s+/m,
      /\[.*?\]\(.*?\)/,
      /^>\s+/m,
      /```\w*/m,
    ],
    weight: 0.6, // markdown patterns are common in comments
  },
  {
    language: "xml",
    patterns: [/^<\?xml/m, /<\/?\w+[\s>]/, /<!\[CDATA\[/, /xmlns[:=]/],
    weight: 0.7,
  },
  {
    language: "docker",
    patterns: [
      /^FROM\s+\w+/m,
      /^RUN\s+/m,
      /^(CMD|ENTRYPOINT|COPY|ADD|EXPOSE|ENV|WORKDIR)\s/m,
    ],
  },
  {
    language: "lua",
    patterns: [
      /\bfunction\s+\w+\s*\(/,
      /\blocal\s+\w+\s*=/,
      /\bprint\s*\(/,
      /\bend\s*$/m,
      /\brequire\s*[("]/,
      /\b\.\.\s/,
    ],
  },
  {
    language: "scala",
    patterns: [
      /\bdef\s+\w+\s*[([]/,
      /\bval\s+\w+\s*[=:]/,
      /\bvar\s+\w+\s*[=:]/,
      /\bobject\s+\w+/,
      /\bcase\s+class\b/,
      /\bimplicit\s+/,
    ],
  },
  {
    language: "dart",
    patterns: [
      /\bvoid\s+main\s*\(\)/,
      /\bimport\s+'package:/,
      /\bWidget\s+build\b/,
      /\bfinal\s+\w+\s*=/,
      /\b(StatelessWidget|StatefulWidget)\b/,
    ],
  },
  {
    language: "r",
    patterns: [
      /\blibrary\s*\(/,
      /\b<-\s/,
      /\bfunction\s*\(/,
      /\bdata\.frame\s*\(/,
      /\bggplot\s*\(/,
    ],
  },
  {
    language: "perl",
    patterns: [
      /^use\s+strict/m,
      /\$\w+\s*=/,
      /\bmy\s+[$@%]/,
      /\bsub\s+\w+/,
      /\bprint\s+"/,
      /=~\s*\//,
    ],
  },
];

const MIN_CONFIDENCE = 2; // need at least 2 weighted matches

export const detectLanguageFromContent = (code: string): CodeBlockLanguage => {
  if (!code.trim()) {
    return "plaintext";
  }

  const scores: Partial<Record<CodeBlockLanguage, number>> = {};

  for (const { language, patterns, weight = 1 } of LANGUAGE_PATTERNS) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(code)) {
        score += weight;
      }
    }
    if (score > 0) {
      scores[language] = (scores[language] ?? 0) + score;
    }
  }

  let bestLang: CodeBlockLanguage = "plaintext";
  let bestScore = 0;

  for (const [lang, score] of Object.entries(scores) as [
    CodeBlockLanguage,
    number,
  ][]) {
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  return bestScore >= MIN_CONFIDENCE ? bestLang : "plaintext";
};
