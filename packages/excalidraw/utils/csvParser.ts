/**
 * Parse CSV text into a 2D string array.
 * Handles quoted fields, embedded commas/newlines, and auto-detects delimiter.
 */
export const parseCSV = (text: string): string[][] => {
  if (!text.trim()) {
    return [];
  }

  // Auto-detect delimiter from first line
  const firstLine = text.split("\n")[0];
  let delimiter = ",";
  if (firstLine.includes("\t")) {
    delimiter = "\t";
  } else if (
    firstLine.includes(";") &&
    (firstLine.match(/;/g) || []).length >=
      (firstLine.match(/,/g) || []).length
  ) {
    delimiter = ";";
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = "";
      } else if (char === "\n" || (char === "\r" && nextChar === "\n")) {
        currentRow.push(currentField.trim());
        if (currentRow.some((cell) => cell !== "")) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
        if (char === "\r") {
          i++; // skip \n in \r\n
        }
      } else {
        currentField += char;
      }
    }
  }

  // Don't forget the last field/row
  currentRow.push(currentField.trim());
  if (currentRow.some((cell) => cell !== "")) {
    rows.push(currentRow);
  }

  // Normalize column count (pad shorter rows)
  const maxCols = Math.max(...rows.map((r) => r.length));
  return rows.map((row) => {
    while (row.length < maxCols) {
      row.push("");
    }
    return row;
  });
};

/**
 * Measure text widths and compute optimal column widths for table rendering.
 */
export const autoSizeColumns = (
  cells: string[][],
  minWidth: number = 80,
  maxWidth: number = 300,
  padding: number = 16,
  fontSize: number = 16,
): number[] => {
  if (cells.length === 0) {
    return [];
  }

  const numCols = cells[0].length;
  const widths: number[] = Array(numCols).fill(minWidth);

  // Use an offscreen canvas to measure text
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return widths;
  }

  ctx.font = `${fontSize}px Virgil, Segoe UI Emoji`;

  for (let c = 0; c < numCols; c++) {
    let maxTextWidth = 0;
    for (let r = 0; r < cells.length; r++) {
      const text = cells[r][c] || "";
      if (text) {
        const measured = ctx.measureText(text);
        maxTextWidth = Math.max(maxTextWidth, measured.width);
      }
    }
    widths[c] = Math.max(minWidth, Math.min(maxWidth, maxTextWidth + padding));
  }

  return widths;
};
