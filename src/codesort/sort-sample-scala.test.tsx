import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeScalaPreprocessor } from "./preprocessor";
import { scalaDistance } from "./distances";
import { sortCode } from "./sort";

// Paths are relative to the project root (this file lives in tests/).
const INPUT = fileURLToPath(new URL("../../data/sample_scala.csv", import.meta.url));
const OUTPUT = fileURLToPath(new URL("../../output/sample_scala.csv", import.meta.url));

/** Set to true if the first record of the CSV is a header: it is kept on top. */
const HAS_HEADER = false;
/** Names given by the assignment (function names, ...): they are never renamed. */
const CONTEXT: string[] = [];

type Row = { raw: string; text: string };

// ---------------------------------------------------------------------------
// Single-column CSV parser (no library)
//
// A record ends at a line break that is not inside double quotes, so a quoted
// snippet can span several lines. A double quote at the front and at the back
// is removed, and "" inside it becomes ". `raw` keeps the record exactly as it
// was in the file, so the output file can reproduce it unchanged.
// ---------------------------------------------------------------------------

const unquote = (raw: string): string =>
  raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')
    ? raw.slice(1, -1).replace(/""/g, '"')
    : raw;

function parseSingleColumnCsv(content: string): Row[] {
  const rows: Row[] = [];
  let inQuotes = false;
  let start = 0;

  const flush = (end: number) => {
    const raw = content.slice(start, end).replace(/\r$/, "");
    if (raw.trim() !== "") rows.push({ raw, text: unquote(raw) });
  };

  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "\n" && !inQuotes) {
      flush(i);
      start = i + 1;
    }
  }
  flush(content.length);
  return rows;
}

const readRows = (path: string): Row[] =>
  parseSingleColumnCsv(readFileSync(path, "utf8").replace(/^﻿/, ""));

// ---------------------------------------------------------------------------
// The parser itself
// ---------------------------------------------------------------------------

describe("parseSingleColumnCsv", () => {
  const rows = parseSingleColumnCsv('"a,b"\r\n"line1\nline2"\n"say ""hi"""\nplain\n\n');

  it("splits records, also inside quoted multi-line fields, and skips empty lines", () => {
    expect(rows.map((r) => r.text)).toEqual(["a,b", "line1\nline2", 'say "hi"', "plain"]);
  });

  it("keeps the raw record unchanged", () => {
    expect(rows[0]!.raw).toBe('"a,b"');
    expect(rows[1]!.raw).toBe('"line1\nline2"');
    expect(rows[3]!.raw).toBe("plain");
  });
});

// ---------------------------------------------------------------------------
// The Scala snippets
// ---------------------------------------------------------------------------

describe("Scala sort of data/sample_scala.csv", () => {
  const preprocess = makeScalaPreprocessor(CONTEXT);
  let header: string | undefined;
  let original: Row[] = [];
  let sorted: Row[] = [];

  beforeAll(() => {
    if (!existsSync(INPUT)) throw new Error(`Input file not found: ${INPUT}`);

    const rows = readRows(INPUT);
    header = HAS_HEADER ? rows.shift()?.raw : undefined;
    original = rows;

    const result = sortCode(original.map((r) => r.text), scalaDistance, preprocess);
    sorted = result.map((r) => original[r.index]!);

    // The output keeps the original records unchanged, only their order differs.
    mkdirSync(dirname(OUTPUT), { recursive: true });
    const out = [...(header !== undefined ? [header] : []), ...sorted.map((r) => r.raw)];
    writeFileSync(OUTPUT, out.join("\n") + "\n", "utf8");
  }, 300_000);

  it("writes output/sample_scala.csv", () => {
    expect(existsSync(OUTPUT)).toBe(true);
    const written = parseSingleColumnCsv(readFileSync(OUTPUT, "utf8"));
    expect(written).toHaveLength(original.length + (header !== undefined ? 1 : 0));
  });

  it("keeps every snippet exactly once", () => {
    expect(sorted.map((r) => r.raw).sort()).toEqual(original.map((r) => r.raw).sort());
  });

  it("puts similar snippets next to each other", () => {
    const adjacentAverage = (rows: Row[]) => {
      if (rows.length < 2) return 0;
      const tokens = rows.map((r) => preprocess(r.text));
      let total = 0;
      for (let i = 1; i < tokens.length; i++) {
        total += scalaDistance(tokens[i - 1]!, tokens[i]!);
      }
      return total / (tokens.length - 1);
    };
    const before = adjacentAverage(original);
    const after = adjacentAverage(sorted);
    console.log(
      `average distance between neighbours: ${before.toFixed(3)} (original) -> ${after.toFixed(3)} (sorted)`
    );
    expect(after).toBeLessThanOrEqual(before);
  });

  it("prints the first snippets of the result", () => {
    console.log(
      "\n" +
        sorted
          .slice(0, 12)
          .map((r, i) => `// #${i + 1}\n${r.text.trim()}`)
          .join("\n\n")
    );
  });
});