import { describe, it, expect } from "vitest";
import {
  scalaDistance,
  scalaLookAlike,
} from "./distances";
import {
  makeScalaPreprocessor
} from "./preprocessor";
import { sortCode } from "./sort";

// ---------------------------------------------------------------------------
// Many bodies for the same task: List.map(f). Only the body, no header.
// Each approach has two or three "students" with different variable names.
// ---------------------------------------------------------------------------

type Solution = { approach: string; student: string; code: string };

const solutions: Solution[] = [
  // --- recursion with pattern matching -------------------------------------
  {
    approach: "recursion/match",
    student: "A1",
    code: `
xs match {
  case Nil => Nil
  case h :: t => f(h) :: myMap(t, f)
}`,
  },
  {
    approach: "recursion/match",
    student: "A2",
    code: `
list match {
  case Nil => Nil
  case x :: rest => g(x) :: go(rest, g)
}`,
  },
  {
    approach: "recursion/match",
    student: "A3",
    code: `
l match {
  case Nil => Nil
  case head :: tail => fn(head) :: mapAll(tail)(fn)
}`,
  },

  // --- recursion with if / else ---------------------------------------------
  {
    approach: "recursion/if",
    student: "B1",
    code: `
if (xs.isEmpty) Nil
else f(xs.head) :: myMap(xs.tail, f)`,
  },
  {
    approach: "recursion/if",
    student: "B2",
    code: `
if (list.isEmpty) List()
else g(list.head) :: go(list.tail, g)`,
  },

  // --- foldRight --------------------------------------------------------------
  {
    approach: "foldRight",
    student: "C1",
    code: `xs.foldRight(List[B]())((x, acc) => f(x) :: acc)`,
  },
  {
    approach: "foldRight",
    student: "C2",
    code: `list.foldRight(Nil: List[B])((e, res) => g(e) :: res)`,
  },

  // --- for / yield ------------------------------------------------------------
  {
    approach: "for-yield",
    student: "D1",
    code: `for (x <- xs) yield f(x)`,
  },
  {
    approach: "for-yield",
    student: "D2",
    code: `for (elem <- list) yield g(elem)`,
  },

  // --- mutable buffer ---------------------------------------------------------
  {
    approach: "buffer",
    student: "E1",
    code: `
val buf = new ListBuffer[B]()
for (x <- xs) buf += f(x)
buf.toList`,
  },
  {
    approach: "buffer",
    student: "E2",
    code: `
val out = ListBuffer[B]()
list.foreach(e => out += g(e))
out.toList`,
  },

  // --- tail recursion with an accumulator ----------------------------------
  {
    approach: "tail-recursive",
    student: "F1",
    code: `
@tailrec
def loop(rest: List[A], acc: List[B]): List[B] = rest match {
  case Nil => acc.reverse
  case h :: t => loop(t, f(h) :: acc)
}
loop(xs, Nil)`,
  },
  {
    approach: "tail-recursive",
    student: "F2",
    code: `
def aux(l: List[A], res: List[B]): List[B] = l match {
  case Nil => res.reverse
  case x :: xs2 => aux(xs2, g(x) :: res)
}
aux(list, Nil)`,
  },

  // --- flatMap ----------------------------------------------------------------
  {
    approach: "flatMap",
    student: "G1",
    code: `xs.flatMap(x => List(f(x)))`,
  },
  {
    approach: "flatMap",
    student: "G2",
    code: `list.flatMap(e => Some(g(e)))`,
  },

  // --- distractors: other tasks, NOT map --------------------------------------
  {
    approach: "other/filter",
    student: "H1",
    code: `
xs match {
  case Nil => Nil
  case h :: t => if (p(h)) h :: myFilter(t, p) else myFilter(t, p)
}`,
  },
  {
    approach: "other/filter",
    student: "H2",
    code: `
list match {
  case Nil => Nil
  case x :: rest => if (keep(x)) x :: go(rest, keep) else go(rest, keep)
}`,
  },
  {
    approach: "other/sum",
    student: "I1",
    code: `xs.foldLeft(0)((acc, x) => acc + x)`,
  },
  {
    approach: "other/sum",
    student: "I2",
    code: `list.foldLeft(0)((s, e) => s + e)`,
  },
];

const preprocess = makeScalaPreprocessor();
const byStudent = new Map(solutions.map((s) => [s.student, s]));
const dist = (a: string, b: string) =>
  scalaDistance(preprocess(byStudent.get(a)!.code), preprocess(byStudent.get(b)!.code));

const approaches = [...new Set(solutions.map((s) => s.approach))];

describe("map implementations: pairwise distances", () => {
  it("prints the average distance between approaches", () => {
    const avg = (x: string, y: string) => {
      const ds: number[] = [];
      for (const a of solutions.filter((s) => s.approach === x)) {
        for (const b of solutions.filter((s) => s.approach === y)) {
          if (a !== b) ds.push(dist(a.student, b.student));
        }
      }
      return ds.reduce((s, d) => s + d, 0) / ds.length;
    };
    const table: Record<string, Record<string, string>> = {};
    for (const x of approaches) {
      table[x] = {};
      for (const y of approaches) table[x]![y] = avg(x, y).toFixed(2);
    }
    console.table(table);
  });

  it("variants that only differ by variable names are identical", () => {
    expect(dist("A1", "A2")).toBe(0);
    expect(dist("D1", "D2")).toBe(0);
    expect(dist("H1", "H2")).toBe(0);
    expect(dist("I1", "I2")).toBe(0);
  });

  it("small variations inside one approach stay small", () => {
    expect(dist("A1", "A3")).toBeGreaterThan(0); // curried call
    expect(dist("A1", "A3")).toBeLessThan(0.15);
    expect(dist("B1", "B2")).toBeLessThan(0.15); // List() instead of Nil
    expect(dist("C1", "C2")).toBeLessThan(0.25); // Nil: List[B] instead of List[B]()
  });

  it("the closest solution to each one uses the same approach", () => {
    for (const s of solutions) {
      const others = solutions.filter((o) => o !== s);
      const nearest = others.reduce((best, o) =>
        dist(s.student, o.student) < dist(s.student, best.student) ? o : best
      );
      expect(`${s.student} -> ${nearest.approach}`).toBe(`${s.student} -> ${s.approach}`);
    }
  });
});

describe("map implementations: look-alike", () => {
  const like = (a: string, b: string, threshold?: number) =>
    scalaLookAlike(byStudent.get(a)!.code, byStudent.get(b)!.code, [], threshold);

  it("accepts the same approach written by different students", () => {
    expect(like("A1", "A2")).toBe(true);
    expect(like("A1", "A3")).toBe(true);
    expect(like("B1", "B2")).toBe(true);
    expect(like("D1", "D2")).toBe(true);
  });

  it("rejects very different ways of writing map", () => {
    expect(like("A1", "D1")).toBe(false); // recursion vs for/yield
    expect(like("D1", "F1")).toBe(false); // for/yield vs tail recursion
    expect(like("E1", "G1")).toBe(false); // buffer vs flatMap
  });

  it("rejects a different task, even when written in a similar style", () => {
    expect(like("A1", "I1")).toBe(false); // map vs sum
    expect(like("C1", "I1")).toBe(false); // foldRight map vs foldLeft sum
  });
});

describe("map implementations: sorting", () => {
  // deterministic shuffle (5 and 18 share no factor, so this is a permutation)
  const n = solutions.length;
  const shuffled = solutions.map((_, i) => solutions[(i * 5 + 3) % n]!);
  const approachOf = new Map(solutions.map((s) => [s.code, s.approach]));
  const studentOf = new Map(solutions.map((s) => [s.code, s.student]));

  const sorted = sortCode(shuffled.map((s) => s.code), scalaDistance, preprocess);

  it("prints the order found", () => {
    console.log(
      "\n" +
        sorted
          .map(
            (r) =>
              `// ${studentOf.get(r.value)} (${approachOf.get(r.value)})\n${r.value.trim()}`
          )
          .join("\n\n")
    );
  });

  it("returns every solution exactly once", () => {
    expect(sorted.map((r) => studentOf.get(r.value)!).sort()).toEqual(
      solutions.map((s) => s.student).sort()
    );
  });

  it("puts students of the same approach next to each other", () => {
    const order = sorted.map((r) => approachOf.get(r.value)!);
    const changes = order.filter((a, i) => i > 0 && a !== order[i - 1]).length;
    expect(changes).toBe(approaches.length - 1);
  });
});