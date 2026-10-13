// 決定論的な乱数生成ユーティリティ。
// 同じシード・同じ条件からは常に同じ乱数列が得られる（結果の再現性を担保する）。

export type Rng = () => number;

/** 文字列から 32bit ハッシュを生成する (xmur3) */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32: 軽量な決定論的擬似乱数生成器。戻り値は [0, 1) */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** マスターシードとキー文字列から、試行ごとに独立な整数シードを導出する */
export function deriveSeed(masterSeed: number, key: string): number {
  const gen = xmur3(`${masterSeed}:${key}`);
  return gen();
}

/** マスターシードとキー文字列から、試行ごとに独立な RNG を生成する */
export function createTrialRng(masterSeed: number, key: string): Rng {
  return mulberry32(deriveSeed(masterSeed, key));
}
