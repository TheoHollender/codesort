
import { KEYWORDS, makeScalaPreprocessor } from "./preprocessor";
import { 
    areReferencesEqual,

    type DistanceFunction,
    type EqualityFunction,
    type LevenshteinDictionary,
    type Preprocessor
} from "./types";

export function levenshteinDistance<Y> (
        dictionary: LevenshteinDictionary<Y>,
        areEqual: EqualityFunction<Y> = areReferencesEqual<Y>
    ): DistanceFunction<Y[]> {
    return (a: Y[], b: Y[]) => {
        let table: number[][] = new Array(a.length + 1);

        function getTable (aIdx: number, bIdx: number): number {
            if (aIdx < 0 || aIdx > a.length) return Infinity;
            if (bIdx < 0 || bIdx > b.length) return Infinity;
            return table[aIdx]![bIdx]!;
        }
        function setTable (aIdx: number, bIdx: number, value: number) {
            if (aIdx < 0 || aIdx > a.length) return ;
            if (bIdx < 0 || bIdx > b.length) return ;
            table[aIdx]![bIdx] = value;
        }
        
        for (let aIdx = 0; aIdx <= a.length; aIdx ++) {
            table[aIdx] = new Array(b.length + 1);

            for (let bIdx = 0; bIdx <= b.length; bIdx ++) {
                setTable(aIdx, bIdx, Infinity);
            }
        }

        setTable(0, 0, 0);

        for (let aIdx = 1; aIdx <= a.length; aIdx ++) {
            setTable(aIdx, 0, getTable(aIdx - 1, 0) + dictionary(a[aIdx - 1]!));
        }
        for (let bIdx = 1; bIdx <= b.length; bIdx ++) {
            setTable(0, bIdx, getTable(0, bIdx - 1) + dictionary(b[bIdx - 1]!));
        }

        for (let aIdx = 1; aIdx <= a.length; aIdx ++) {
            for (let bIdx = 1; bIdx <= b.length; bIdx ++) {
                let value = Math.min(
                    getTable(aIdx - 1, bIdx) + dictionary(a[aIdx - 1]!),
                    getTable(aIdx, bIdx - 1) + dictionary(b[bIdx - 1]!)
                );

                if (areEqual(a[aIdx - 1]!, b[bIdx - 1]!)) {
                    value = Math.min(value, getTable(aIdx - 1, bIdx - 1));
                }

                setTable(aIdx, bIdx, value);
            }
        }
        
        return getTable(a.length, b.length);
    };
}

export const jaccardDistance: DistanceFunction<Set<string>> = (a, b) => {
  if (a.size === 0 && b.size === 0) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return 1 - common / (a.size + b.size - common);
};

// ---------------------------------------------------------------------------
// 4. Cost of inserting / deleting one token (the "levenshtein dictionary")
// ---------------------------------------------------------------------------
 
// Brackets decide how an expression is grouped: (1 + 2) * 3 is not 1 + 2 * 3.
const BRACKETS = new Set(["(", ")", "[", "]", "{", "}"]);
// Separators carry little meaning.
const SEPARATORS = new Set([".", ",", ";", ":"]);
 
/**
 * Brackets and names from the standard library cost the most (2): they carry
 * the structure and the meaning (map vs filter). Keywords cost 1, operators and
 * variables 0.5, and separators (commas, dots, ...) only 0.2.
 */
export function scalaTokenCost(token: string): number {
  if (BRACKETS.has(token)) return 2;
  if (SEPARATORS.has(token)) return 0.2;
  if (/^_x\d+$/.test(token) || token === "_") return 0.5; // renamed variable
  if (token === "<num>" || token === "<str>") return 0.5;
  if (KEYWORDS.has(token)) return 1;
  if (/^[A-Za-z_]/.test(token)) return 2; // standard or context name
  return 0.5; // operators and arrows
}
 
// ---------------------------------------------------------------------------
// 5. Distance between two preprocessed programs
// ---------------------------------------------------------------------------
 
const rawDistance = levenshteinDistance<string>(scalaTokenCost);
const totalCost = (tokens: string[]) =>
  tokens.reduce((sum, t) => sum + scalaTokenCost(t), 0);
 
/** Normalized to [0, 1]: 0 = same tokens, 1 = nothing in common. */
export const scalaDistance: DistanceFunction<string[]> = (a, b) => {
  const worst = totalCost(a) + totalCost(b); // delete all of a, insert all of b
  return worst === 0 ? 0 : rawDistance(a, b) / worst;
};
 
export function scalaLookAlike(
  codeA: string,
  codeB: string,
  context: Iterable<string> = [],
  threshold = 0.25
): boolean {
  const preprocess = makeScalaPreprocessor(context);
  return scalaDistance(preprocess(codeA), preprocess(codeB)) <= threshold;
}
