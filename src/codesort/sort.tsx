import type { DistanceFunction, Preprocessor } from "./types";

class UnionFind {
    size:    number;
    parents: number[];
    
    constructor (size: number) {
        this.size    = size;
        this.parents = new Array(size);

        for (let idx = 0; idx < size; idx ++) {
            this.parents[idx] = idx;
        }
    }
    boss (node: number): number {
        if (this.parents[node]! !== node) {
            this.parents[node] = this.boss(this.parents[node]!);
        }
        return this.parents[node];
    }
    merge (a: number, b: number) {
        a = this.boss(a); b = this.boss(b);
        this.parents[a] = b;
    }
};

function pairs (upto: number) {
    const result: [number, number][] = [];

    for (let a = 0; a < upto; a ++) {
        for (let b = 0; b < upto; b ++) {
            result.push([a, b]);
        }
    }

    return result;
}

export function argSortCode<U> (
    code: U[],
    distance: DistanceFunction<U>
): number[] {
    const ufd: UnionFind = new UnionFind(code.length);
    const roads = pairs(code.length)
        .filter(([x, y]) => x < y)
        .map<[number, number, number]>(([x, y]) => [distance(code[x]!, code[y]!), x, y])
        .sort(([d1, a1, b1], [d2, a2, b2]) => d1 - d2)
    
    const argSortedPerBlob: number[][] = [];
    for (let idx = 0; idx < code.length; idx ++) {
        argSortedPerBlob[idx] = [idx];
    }

    function optimalMerge (a: number[], b: number[]): number[] {
        const scores: [number, number[]][] = [];
        
        for (const potA of [a, a.toReversed()]) {
            for (const potB of [b, b.toReversed()]) {
                scores.push([
                    distance(code[potA[potA.length - 1]!]!, code[potB[0]!]!),
                    potA.concat(potB)
                ]);
            }
        }

        return scores.sort( ([sa, a], [sb, b]) => sa - sb )[0]![1]
    }

    for (const [dist, aIdx, bIdx] of roads) {
        const bossA = ufd.boss(aIdx)
        const bossB = ufd.boss(bIdx)

        if (bossA != bossB) {
            ufd.merge(bossA, bossB);

            const merged = ufd.boss(aIdx)

            argSortedPerBlob[merged] = optimalMerge(argSortedPerBlob[bossA]!, argSortedPerBlob[bossB]!);
        }
    }

    const ordered = argSortedPerBlob[ufd.boss(0)]!;
    const order   = [];
    for (let idx = 0; idx < code.length; idx ++) {
        order.push(0);
    }
    for (let idx = 0; idx < code.length; idx ++) {
        order[ordered[idx]!] = idx;
    }

    return order;
}

export function sortCode<U, V> (
    code: U[],
    distance: DistanceFunction<V>,
    preprocessor: Preprocessor<U, V>
) {
    const order = argSortCode( code.map(preprocessor), distance )

    return code.map((value, index) => ({ index, value }))
        .sort((a, b) => (order[a.index]! - order[b.index]!))
}
