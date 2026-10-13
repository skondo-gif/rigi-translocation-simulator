// Figure S1(占有率+形成率)・到達率(逆方向ノックイン)図で使う、条件の組み立てと
// 複数シード・複数試行のバッチ実行。既存の runTrial をそのまま使い、シミュレーション本体には
// 一切手を入れない——WT/ΔCARDのどの分布をどの量に使うかの組み合わせを変えるだけ。

import { runTrial } from './simulation';
import type { Distributions, DistributionSet, SimulationParams } from '../types';

/** 20シード固定(42〜61)。全試行結果パネルの単一シードとは独立に、統計(平均±SEM)用に使う。 */
export const STAT_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, i) => 42 + i);

export type KnockoutId = 'wtNative' | 'dcNative' | 'velocityKO' | 'noPause' | 'pauseFreqKO';

export const KNOCKOUT_LABELS: Record<KnockoutId, string> = {
  wtNative: 'WT(実測通り)',
  dcNative: 'ΔCARD(実測通り)',
  velocityKO: '速度→ΔCARD(WT背景)',
  noPause: '停止頻度→0(WT背景)',
  pauseFreqKO: '停止頻度→ΔCARD(WT背景)',
};

/** 条件IDから、速度/停止時間/停止頻度をそれぞれWT・ΔCARDのどちらの分布から取るかを組み立てる。
 *  1つだけを入れ替える、という設計を1箇所に集約する。 */
export function buildDistributionFor(dists: DistributionSet, id: KnockoutId): Distributions {
  const wt = dists.WT;
  const dc = dists.dCARD;
  switch (id) {
    case 'wtNative':
      return wt;
    case 'dcNative':
      return dc;
    case 'velocityKO':
      return { velocity: dc.velocity, pauseDuration: wt.pauseDuration, pauseFrequency: wt.pauseFrequency };
    case 'noPause':
      return { velocity: wt.velocity, pauseDuration: wt.pauseDuration, pauseFrequency: [0] };
    case 'pauseFreqKO':
      return { velocity: wt.velocity, pauseDuration: wt.pauseDuration, pauseFrequency: dc.pauseFrequency };
  }
}

const SIZES = [1, 2, 3, 4, 5] as const; // 5 = "5以上"

/** 占有率: 20シード x trialsPerSeed試行を全軌跡記録付きで実行し、10秒おきにサンプリングして
 *  複合体サイズ(1/2/3/4/5以上)の分布をシードごとに求める(各シード内で100%に正規化)。
 *  戻り値: シードごとの[size1,size2,size3,size4,size5+]の配列(%)。 */
export async function computeOccupancyPerSeed(
  dist: Distributions,
  params: SimulationParams,
  trialsPerSeed: number,
  onProgress?: (done: number, total: number) => void,
): Promise<number[][]> {
  const seeds = STAT_SEEDS;
  const out: number[][] = [];
  let done = 0;
  const total = seeds.length * trialsPerSeed;
  for (const seed of seeds) {
    const counts = [0, 0, 0, 0, 0];
    let sum = 0;
    const p: SimulationParams = { ...params, seed };
    for (let i = 0; i < trialsPerSeed; i++) {
      const { frames } = runTrial('WT', i, p, dist, true);
      for (const f of frames) {
        if (Math.round(f.t) % 10 !== 0) continue;
        for (const m of f.molecules) {
          if (m.status === 'pending' || m.status === 'finished') continue;
          const sz = Math.min(5, m.clusterSize);
          counts[sz - 1]++;
          sum++;
        }
      }
      done++;
      if (done % 5 === 0 || done === total) {
        onProgress?.(done, total);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    out.push(counts.map((c) => (sum > 0 ? (c / sum) * 100 : 0)));
  }
  return out;
}

/** 形成率: 20シード x N試行(記録なし)を実行し、シードごとに「最大複合体サイズが一度でも
 *  threshold以上に達した試行」の割合(%)を求める。thresholds省略時は既定の[filamentThreshold]のみ。 */
export async function computeReachRatePerSeed(
  dist: Distributions,
  params: SimulationParams,
  N: number,
  thresholds: readonly number[],
  onProgress?: (done: number, total: number) => void,
): Promise<Record<number, number[]>> {
  const seeds = STAT_SEEDS;
  const out: Record<number, number[]> = {};
  for (const th of thresholds) out[th] = [];
  let done = 0;
  const total = seeds.length * N;
  for (const seed of seeds) {
    const counts: Record<number, number> = {};
    for (const th of thresholds) counts[th] = 0;
    const p: SimulationParams = { ...params, seed };
    for (let i = 0; i < N; i++) {
      const { result } = runTrial('WT', i, p, dist, false);
      for (const th of thresholds) if (result.maxClusterSize >= th) counts[th]++;
      done++;
      if (done % 20 === 0 || done === total) {
        onProgress?.(done, total);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    for (const th of thresholds) out[th].push((counts[th] / N) * 100);
  }
  return out;
}

export { SIZES };
