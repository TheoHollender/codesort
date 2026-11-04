
import { describe, it, expect } from "vitest";
import { makeWordExtractor } from "./preprocessor";
import { jaccardDistance } from "./distances";
import { sortCode } from "./sort";

// Small dictionary covering the sample sentences (English + French).
const dictionary = [
  // cooking (EN)
  "add", "chopped", "onions", "hot", "pan", "stir", "sauce",
  // cooking (FR)
  "ajouter", "oignons", "poele", "chaude", "remuer",
  // football
  "team", "won", "match", "goal", "scored", "stadium",
  // programming
  "fixed", "bug", "function", "code", "compiler", "error",
];

const extract = makeWordExtractor(dictionary);
const words = (s: string) => [...extract(s)].sort();
const dist = (a: string, b: string) => jaccardDistance(extract(a), extract(b));

const cookingEn = [
  "Add the chopped onions to the hot pan and stir the sauce",
  "Stir the sauce and add onions to the pan",
  "Hot pan, chopped onions",
];
const cookingFr = [
  "Ajouter les oignons dans la poêle chaude et remuer la sauce",
  "Remuer la sauce et ajouter les oignons dans la poêle",
];
const football = [
  "The team won the match with a goal",
  "Goal in the stadium match",
  "Team scored in the stadium",
];
const programming = [
  "Fixed the bug in the function code",
  "Compiler error in the function code",
  "Bug and error in the code",
];

describe("word extraction on sample sentences", () => {
  it("keeps only meaningful words (English)", () => {
    expect(words(cookingEn[0]!)).toEqual(
      ["add", "chopped", "hot", "onions", "pan", "sauce", "stir"]
    );
  });

  it("keeps only meaningful words (French, accents removed)", () => {
    expect(words(cookingFr[0]!)).toEqual(
      ["ajouter", "chaude", "oignons", "poele", "remuer", "sauce"]
    );
  });

  it("fixes a typo by snapping to the dictionary", () => {
    expect(words("Stir the sauce and add choped onions")).toEqual(
      words("Stir the sauce and add chopped onions")
    );
  });
});

describe("sentences that do not look alike", () => {
  it("different topics share nothing -> distance 1", () => {
    expect(dist(cookingEn[0]!, football[0]!)).toBe(1);
    expect(dist(football[0]!, programming[0]!)).toBe(1);
  });

  it("related but too different for the default 0.5 threshold", () => {
    const a = extract(programming[0]!);
    const b = extract(programming[1]!);
    expect(jaccardDistance(a, b)).toBeCloseTo(2 / 3);
  });
});

describe("sorting a mixed list of sentences", () => {
  const samples = [
    ...cookingEn.map((text) => ({ text, topic: "cooking" })),
    ...football.map((text) => ({ text, topic: "football" })),
    ...programming.map((text) => ({ text, topic: "programming" })),
  ];
  const shuffled = [0, 4, 8, 1, 5, 6, 2, 7, 3].map((i) => samples[i]!);
  const topicOf = new Map(samples.map((s) => [s.text, s.topic]));

  const sorted = sortCode(shuffled.map((s) => s.text), jaccardDistance, extract);
  const topics = sorted.map((r) => topicOf.get(r.value)!);

  it("prints what the result looks like", () => {
    console.log(sorted.map((r) => `[${topicOf.get(r.value)}] ${r.value}`).join("\n"));
  });

  it("returns every sentence exactly once", () => {
    expect(sorted.map((r) => r.value).sort()).toEqual(
      shuffled.map((s) => s.text).sort()
    );
  });

  it("keeps the original index of each sentence", () => {
    expect(sorted.every((r) => shuffled[r.index]!.text === r.value)).toBe(true);
  });

  it("groups sentences of the same topic together", () => {
    const changes = topics.filter((t, i) => i > 0 && t !== topics[i - 1]).length;
    expect(changes).toBe(2);
  });
});