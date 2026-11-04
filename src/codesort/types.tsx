
export type DistanceFunction<X> = (a: X, b: X) => number
export type EqualityFunction<X> = (a: X, b: X) => boolean;
export type Preprocessor<U, V>  = (a: U) => V

export type LevenshteinDictionary<X> = (a: X) => number;

export function areReferencesEqual<X> (a: X, b: X): boolean {
    return a == b;
}
