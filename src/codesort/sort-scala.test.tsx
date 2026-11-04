import { describe, it, expect } from "vitest";
import {
  scalaTokenCost,
  scalaDistance
} from "./distances";
import {
  tokenize,
  makeScalaPreprocessor
} from "./preprocessor";
import { sortCode } from "./sort";

const preprocess = makeScalaPreprocessor();
const show = (code: string, context: string[] = []) =>
  makeScalaPreprocessor(context)(code).join(" ");
const dist = (a: string, b: string) => scalaDistance(preprocess(a), preprocess(b));

// ---------------------------------------------------------------------------
// Sample programs
// ---------------------------------------------------------------------------

// Family A: recursive sum over a list
const sumA = `
def mySum(xs: List[Int]): Int = xs match {
  case Nil => 0
  case h :: t => h + mySum(t)
}`;
// same program, every name changed
const sumB = `
def total(list: List[Int]): Int = list match {
  case Nil => 0
  case x :: rest => x + total(rest)
}`;
// almost the same program: + becomes *
const prod = `
def prod(xs: List[Int]): Int = xs match {
  case Nil => 1
  case h :: t => h * prod(t)
}`;
// does not compile: a ')' and the final '}' are missing
const sumBroken = `
def mySum(xs: List[Int]: Int = xs match {
  case Nil => 0
  case h :: t => h + mySum(t)
`;

// Family B: same idea, written with if / else
const countA = `
def howMany(xs: List[Int]): Int =
  if (xs.isEmpty) 0 else 1 + howMany(xs.tail)`;
const countB = `
def total(list: List[Int]): Int =
  if (list.isEmpty) 0 else 1 + total(list.tail)`;

// Family C: a main program
const mainA = `
object Main {
  def main(args: Array[String]): Unit = {
    println("hello")
  }
}`;
const mainB = `
object Hello {
  def main(args: Array[String]): Unit = {
    println("bye")
  }
}`;

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

describe("tokenize", () => {
  const texts = (code: string) => tokenize(code).map((t) => t.text);

  it("splits identifiers, dots, parentheses and operators", () => {
    expect(texts("xs.map(_ + 1) // done")).toEqual(
      ["xs", ".", "map", "(", "_", "+", "1", ")"]
    );
  });

  it("recognizes arrows and ::", () => {
    expect(texts("a => b <- c -> d :: e")).toEqual(
      ["a", "=>", "b", "<-", "c", "->", "d", "::", "e"]
    );
  });

  it("keeps strings and decimals in one piece", () => {
    expect(texts('val s = "a b" + 1.5')).toEqual(
      ["val", "s", "=", '"a b"', "+", "1.5"]
    );
  });

  it("skips comments", () => {
    expect(texts("a /* x */ b // y")).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Preprocessor (renaming)
// ---------------------------------------------------------------------------

describe("makeScalaPreprocessor", () => {
  it("renames unknown identifiers in order of first appearance", () => {
    expect(show("val a = 1; val b = a + 2")).toBe(
      "val _x0 = <num> ; val _x1 = _x0 + <num>"
    );
  });

  it("gives the same tokens whatever the variable names are", () => {
    expect(show("val a = 1; val b = a + 2")).toBe(show("val x = 1; val y = x + 2"));
  });

  it("still tells apart code that reuses a variable from code that does not", () => {
    expect(show("val a = 1; val b = 2")).not.toBe(show("val a = 1; val b = a"));
  });

  it("does not touch keywords and standard names", () => {
    expect(show("xs.map(f).filter(g)")).toBe("_x0 . map ( _x1 ) . filter ( _x2 )");
  });

  it("renames standard method names used as variables, but keeps them after a dot", () => {
    // `head` and `tail` are student variables here...
    expect(show("l match { case head :: tail => head }")).toBe(
      "_x0 match { case _x1 :: _x2 => _x1 }"
    );
    // ...and the library's methods here
    expect(show("l.head :: l.tail")).toBe("_x0 . head :: _x0 . tail");
    // a student's own function called sum or count is not mistaken for the library's
    expect(show("def sum(xs: List[Int]): Int = xs.sum")).toBe(
      "def _x0 ( _x1 : List [ Int ] ) : Int = _x1 . sum"
    );
  });

  it("does not touch names given in the context", () => {
    expect(show("sumList(xs)", ["sumList"])).toBe("sumList ( _x0 )");
    expect(show("sumList(xs)")).toBe("_x0 ( _x1 )");
  });

  it("replaces strings, chars and numbers by placeholders and drops comments", () => {
    expect(show('val s = "hello" // greeting')).toBe("val _x0 = <str>");
    expect(show("val c = 'a'")).toBe("val _x0 = <str>");
  });

  it("does not crash on code that does not compile", () => {
    expect(show("def f(x: Int = { x +")).toBe("def _x0 ( _x1 : Int = { _x1 +");
    expect(show('println("abc')).toBe("println ( <str>");
  });
});

// ---------------------------------------------------------------------------
// Cost function
// ---------------------------------------------------------------------------

describe("scalaTokenCost", () => {
  it("separators are cheap, then variables, keywords, and finally brackets and library names", () => {
    expect(scalaTokenCost(",")).toBeLessThan(scalaTokenCost("_x0"));
    expect(scalaTokenCost("_x0")).toBeLessThan(scalaTokenCost("val"));
    expect(scalaTokenCost("val")).toBeLessThan(scalaTokenCost("("));
    expect(scalaTokenCost("(")).toBe(scalaTokenCost("map"));
  });
});

// ---------------------------------------------------------------------------
// Distances
// ---------------------------------------------------------------------------

describe("scalaDistance", () => {
  it("is 0 for programs that only differ by variable names", () => {
    expect(dist(sumA, sumB)).toBe(0);
    expect(dist(countA, countB)).toBe(0);
    expect(dist(mainA, mainB)).toBe(0);
  });

  it("is small but not 0 when a single operator changes", () => {
    const d = dist(sumA, prod);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(0.05);
  });

  it("regrouping with a parenthesis costs more than changing an operator", () => {
    // (1 + 2) * 3  is not  (1 + 2 * 3)
    // Note: a plain edit distance sees this as moving "* 3" across the ")"
    // (cost 2 x 1), not as moving the ")" itself, so it is only about twice an
    // operator change (1). Telling it apart more strongly needs the bracket
    // depth in the tokens.
    const grouped = "val r = (1 + 2) * 3";
    const regrouped = "val r = (1 + 2 * 3)";
    const otherOperator = "val r = (1 - 2) * 3";
    expect(dist(grouped, regrouped)).toBeGreaterThan(1.5 * dist(grouped, otherOperator));
  });

  it("a missing parenthesis costs as much as a library name", () => {
    const withParen = "val r = (1 + 2)";
    const withoutParen = "val r = (1 + 2";
    // raw cost 2 out of a worst case of (total A + total B)
    const a = preprocess(withParen);
    const b = preprocess(withoutParen);
    expect(scalaDistance(a, b)).toBeGreaterThan(
      dist("val r = (1 + 2)", "val r = (1 - 2)") // an operator change
    );
  });

  it("a missing parenthesis counts, but broken code is still closer than a different solution", () => {
    const d = dist(sumA, sumBroken);
    console.log({ broken: d });
    expect(d).toBeGreaterThan(dist(sumA, prod)); // two missing brackets matter
    expect(d).toBeLessThan(dist(sumA, countA));
  });

  it("grows with the structural difference", () => {
    const sameIdea = dist(sumA, prod);
    const otherStyle = dist(sumA, countA);
    const unrelated = dist(sumA, mainA);
    console.log({ sameIdea, otherStyle, unrelated });
    expect(sameIdea).toBeLessThan(otherStyle);
    expect(otherStyle).toBeLessThan(unrelated);
  });

  it("stays within [0, 1] and is symmetric", () => {
    for (const a of [sumA, countA, mainA]) {
      for (const b of [sumB, prod, mainB]) {
        const d = dist(a, b);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(1);
        expect(d).toBeCloseTo(dist(b, a));
      }
    }
  });

  it("handles empty programs", () => {
    expect(scalaDistance([], [])).toBe(0);
    expect(scalaDistance([], ["val"])).toBe(1);
  });
});

describe("scalaLookAlike", () => {
  it("uses the context to keep given function names", () => {
    const a = "def sumList(xs: List[Int]): Int = xs.sum";
    const b = "def sumList(ys: List[Int]): Int = ys.sum";
    const c = "def other(ys: List[Int]): Int = ys.sum";
    const pre = makeScalaPreprocessor(["sumList"]);
    expect(scalaDistance(pre(a), pre(b))).toBe(0);
    expect(scalaDistance(pre(a), pre(c))).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Sorting a mixed list of submissions
// ---------------------------------------------------------------------------

describe("sortCode on Scala submissions", () => {
  const submissions = [
    ...[sumA, sumB, prod].map((text) => ({ text, family: "recursion" })),
    ...[countA, countB].map((text) => ({ text, family: "if/else" })),
    ...[mainA, mainB].map((text) => ({ text, family: "main" })),
  ];
  // deterministic shuffle so the input is not already grouped
  const shuffled = [3, 5, 0, 6, 1, 4, 2].map((i) => submissions[i]!);
  const familyOf = new Map(submissions.map((s) => [s.text, s.family]));

  const sorted = sortCode(shuffled.map((s) => s.text), scalaDistance, preprocess);
  const families = sorted.map((r) => familyOf.get(r.value)!);

  it("prints what the result looks like", () => {
    console.log(families.join("\n"));
  });

  it("returns every submission exactly once", () => {
    expect(sorted.map((r) => r.value).sort()).toEqual(
      shuffled.map((s) => s.text).sort()
    );
  });

  it("puts submissions of the same family next to each other", () => {
    // 3 families laid out contiguously -> exactly 2 changes
    const changes = families.filter((f, i) => i > 0 && f !== families[i - 1]).length;
    expect(changes).toBe(2);
  });
});