
import { describe, it, expect } from "vitest";
import { levenshteinDistance } from "./distances";
import { sortCode } from "./sort";
import type { Preprocessor } from "./types";

const toChars: Preprocessor<string, string[]> = (s) => [...s];
const distance = levenshteinDistance<string>(() => 1);

const words = ["banana", "apple", "bandana", "apply", "bananas", "apples"];

describe("sortCode with levenshteinDistance on strings", () => {
  const sorted = sortCode(words, distance, toChars);
  const result = sorted.map((r) => r.value);

  it("prints what the result looks like", () => {
    console.log(result);
  });

  it("keeps every word exactly once", () => {
    expect([...result].sort()).toEqual([...words].sort());
  });

  it("keeps the original index of each word", () => {
    expect(sorted.every((r) => words[r.index] === r.value)).toBe(true);
  });

  it("puts similar words in contiguous groups", () => {
    const groups = result.map((w) => (w.startsWith("app") ? "A" : "B")).join("");
    expect(["AAABBB", "BBBAAA"]).toContain(groups);
  });

  it("places the closest words next to each other", () => {
    const adjacent = (a: string, b: string) =>
      Math.abs(result.indexOf(a) - result.indexOf(b)) === 1;

    expect(adjacent("apple", "apples")).toBe(true);
    expect(adjacent("banana", "bananas")).toBe(true);
    expect(adjacent("banana", "bandana")).toBe(true);
  });
});
