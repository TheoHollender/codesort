import { levenshteinDistance } from "./distances";
import type { Preprocessor } from "./types";

/* ============================ IDENTITY ============================ */

export function identity<X> (x: X) {
    return x;
}

/* ============================ WORDS ============================ */

export const normalize = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

export const STOPWORDS = new Set(
  [
    "the", "an", "of", "to", "in", "on", "at", "is", "are", "was",
    "were", "be", "been", "it", "this", "that", "for", "with", "as", "by",
    "from", "you", "he", "she", "we", "they", "not", "his", "her", "its",
    "le", "la", "les", "un", "une", "des", "du", "de", "au", "aux",
    "dans", "sur", "est", "sont", "etait", "etre", "il", "elle", "nous", "vous",
    "ils", "elles", "ce", "cet", "cette", "ces", "que", "qui", "ne", "pas",
    "par", "pour", "avec", "se", "sa", "son", "ses", "et", "ou", "or", "and"
  ].map(normalize)
);

interface ExtractorOptions {
  maxDistance?: number;
  minLength?: number;
}

export function makeWordExtractor(
  dictionary: Iterable<string>,
  { maxDistance = 1, minLength = 0 }: ExtractorOptions = {}
): Preprocessor<string, Set<string>> {
  const words = new Set([...dictionary].map(normalize));

  // Bucket by length so we only compare plausible candidates.
  const byLength = new Map<number, string[]>();
  for (const w of words) {
    const bucket = byLength.get(w.length) ?? [];
    bucket.push(w);
    byLength.set(w.length, bucket);
  }

  const editDistance = levenshteinDistance<string>(() => 1);
  const cache = new Map<string, string>();

  function closest(word: string): string {
    if (words.has(word)) return word;
    const cached = cache.get(word);
    if (cached !== undefined) return cached;

    let best = word; // unknown word: keep as is (name, jargon, ...)
    let bestDist = maxDistance + 1;
    for (let len = word.length - maxDistance; len <= word.length + maxDistance; len++) {
      for (const candidate of byLength.get(len) ?? []) {
        const d = editDistance([...word], [...candidate]);
        if (d < bestDist) {
          best = candidate;
          bestDist = d;
        }
      }
    }
    cache.set(word, best);
    return best;
  }

  return (sentence) => {
    const tokens = (normalize(sentence).match(/\p{L}+/gu) ?? [])
      .filter((t) => t.length >= minLength && !STOPWORDS.has(t));
    return new Set(tokens.map(closest));
  };
}

/* ============================ SCALA TOKENS ============================ */

// ---------------------------------------------------------------------------
// 1. Tokenizer (very simple, tolerant: it never throws on broken code)
// ---------------------------------------------------------------------------
 
export type TokenKind = "string" | "number" | "ident" | "op" | "punct";
export interface Token {
  kind: TokenKind;
  text: string;
}
 
// One alternation, tried in order at each position:
//  whitespace, // comments, /* comments */   -> skipped (no capture group)
//  1: string or char literal (an unterminated string runs to the end of the line)
//  2: number
//  3: identifier or keyword
//  4: operator (arrows, ::, comparisons, ...)
//  5: punctuation
// Any other character is silently skipped.
const TOKEN_REGEX =
  /\s+|\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)')|(\d+(?:\.\d+)?[lLfFdD]?)|([A-Za-z_][A-Za-z0-9_]*)|(:::|::|=>|<-|->|<:|>:|==|!=|<=|>=|&&|\|\||\+\+|[+\-*/%<>=!&|^~:?@#])|([()\[\]{}.,;])/g;
 
export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  for (const m of code.matchAll(TOKEN_REGEX)) {
    if (m[1] !== undefined) tokens.push({ kind: "string", text: m[1] });
    else if (m[2] !== undefined) tokens.push({ kind: "number", text: m[2] });
    else if (m[3] !== undefined) tokens.push({ kind: "ident", text: m[3] });
    else if (m[4] !== undefined) tokens.push({ kind: "op", text: m[4] });
    else if (m[5] !== undefined) tokens.push({ kind: "punct", text: m[5] });
  }
  return tokens;
}
 
// ---------------------------------------------------------------------------
// 2. Names we never rename
// ---------------------------------------------------------------------------
 
export const KEYWORDS = new Set([
  "abstract", "case", "catch", "class", "def", "do", "else", "enum", "extends",
  "false", "final", "finally", "for", "given", "if", "implicit", "import",
  "lazy", "match", "new", "null", "object", "override", "package", "private",
  "protected", "return", "sealed", "super", "this", "throw", "trait", "true",
  "try", "type", "using", "val", "var", "while", "with", "yield",
]);
 
// Standard library names: types, constructors and common methods.
export const STANDARD_NAMES = new Set([
  // types and values
  "Int", "Long", "Double", "Float", "Boolean", "Char", "Byte", "Short", "String",
  "Unit", "Any", "AnyRef", "Nothing", "Option", "Some", "None", "Either", "Left",
  "Right", "List", "Nil", "Seq", "Vector", "Map", "Set", "Array", "Try",
  "Success", "Failure", "Future", "Iterator", "Range", "StringBuilder", "Math",
  "Ordering", "Console",
  // common methods
  "apply", "unapply", "map", "flatMap", "filter", "filterNot", "foreach",
  "foldLeft", "foldRight", "fold", "reduce", "reduceLeft", "reduceRight",
  "collect", "find", "exists", "forall", "count", "head", "tail", "last", "init",
  "headOption", "lastOption", "isEmpty", "nonEmpty", "length", "size", "take",
  "takeWhile", "drop", "dropWhile", "zip", "zipWithIndex", "unzip", "sum",
  "product", "min", "max", "minBy", "maxBy", "sorted", "sortBy", "sortWith",
  "reverse", "distinct", "contains", "indexOf", "mkString", "toList", "toSeq",
  "toSet", "toMap", "toArray", "toString", "toInt", "toDouble", "getOrElse",
  "orElse", "get", "isDefined", "groupBy", "partition", "flatten", "updated",
  "appended", "prepended", "concat", "println", "print", "main", "args", "abs",
  "sqrt", "pow", "to", "until", "by",
]);
 
// ---------------------------------------------------------------------------
// 3. Preprocessor: tokens + alpha-renaming of unknown identifiers
// ---------------------------------------------------------------------------
 
/**
 * Builds a Preprocessor from Scala source to a list of normalized tokens.
 *
 * - keywords, standard types (`List`, `Int`, ...), standard methods called on
 *   something (`xs.map`) and names in `context` (e.g. the function names given
 *   in the assignment) are kept as they are;
 * - any other identifier is renamed `_x0`, `_x1`, ... in order of first
 *   appearance, so two students using different names get the same tokens;
 * - string/char literals become `<str>`, numbers become `<num>`.
 */
export function makeScalaPreprocessor(
  context: Iterable<string> = []
): Preprocessor<string, string[]> {
  const known = new Set<string>([...KEYWORDS, ...context]);
 
  // Lowercase standard names (head, tail, size, ...) are only the library's
  // when called on something (`xs.head`). On their own (`case head :: tail`)
  // they are the student's variables and get renamed like any other.
  const FREE_FUNCTIONS = new Set(["println", "print", "main", "args", "to", "until", "by"]);
  const isStandard = (name: string, afterDot: boolean) =>
    STANDARD_NAMES.has(name) &&
    (afterDot || /^[A-Z]/.test(name) || FREE_FUNCTIONS.has(name));
 
  return (code) => {
    const renamed = new Map<string, string>();
    const tokens = tokenize(code);
 
    return tokens.map((token, i) => {
      switch (token.kind) {
        case "string":
          return "<str>";
        case "number":
          return "<num>";
        case "ident": {
          const afterDot = tokens[i - 1]?.text === ".";
          if (
            known.has(token.text) ||
            token.text === "_" ||
            isStandard(token.text, afterDot)
          ) {
            return token.text;
          }
          let name = renamed.get(token.text);
          if (name === undefined) {
            name = `_x${renamed.size}`;
            renamed.set(token.text, name);
          }
          return name;
        }
        default:
          return token.text;
      }
    });
  };
}
