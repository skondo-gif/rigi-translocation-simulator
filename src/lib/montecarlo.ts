// 全試行(モンテカルロ)の実行。
// 各試行はフレーム履歴を保存せず要約(TrialResult)のみを記録することでメモリ・計算量を抑える。
// 個々の試行のアニメーションが必要になった時点で、同一シード・同一パラメータから再計算する
// (決定論的なため常に同じ結果になる)。

import { runTrial } from './simulation';
import type { Condition, Distributions, MonteCarloSummary, SimulationParams, TrialResult } from '../types';

const CHUNK_SIZE = 10;

function summarize(condition: Condition, results: TrialResult[]): MonteCarloSummary {
  const n = results.length;
  const formed = results.filter((r) => r.everFormedFilament).length;
  const persisted = results.filter((r) => r.endHasFilament).length;
  const avgMaxCluster = n > 0 ? results.reduce((s, r) => s + r.maxClusterSize, 0) / n : 0;
  return {
    condition,
    results,
    formationRatePct: n > 0 ? (100 * formed) / n : 0,
    averageMaxClusterSize: avgMaxCluster,
    endPersistenceRatePct: n > 0 ? (100 * persisted) / n : 0,
  };
}

export async function runMonteCarlo(
  condition: Condition,
  params: SimulationParams,
  dist: Distributions,
  onProgress?: (done: number, total: number) => void,
): Promise<MonteCarloSummary> {
  const total = params.trialsPerCondition;
  const results: TrialResult[] = [];
  for (let i = 0; i < total; i++) {
    const { result } = runTrial(condition, i, params, dist, false);
    results.push(result);
    if ((i + 1) % CHUNK_SIZE === 0 || i === total - 1) {
      onProgress?.(i + 1, total);
      // UIスレッドをブロックしないよう定期的に制御を返す
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  return summarize(condition, results);
}
