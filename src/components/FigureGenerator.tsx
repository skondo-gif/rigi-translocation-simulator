// Figure S1(占有率+形成率)と到達率(速度・停止ノックアウト)図を、ボタン一つでアプリ内に再現する。
// 既存の runTrial をそのまま複数条件・複数シードでバッチ実行するだけで、シミュレーション本体
// には手を入れない。
import { useState } from 'react';
import type { DistributionSet, SimulationParams } from '../types';
import {
  buildDistributionFor,
  computeOccupancyPerSeed,
  computeReachRatePerSeed,
  STAT_SEEDS,
  type KnockoutId,
} from '../lib/experiments';
import { mean, sem, welchTTest, significanceStars } from '../lib/stats';
import PairedBarChart, { type PairedSeries } from './charts/PairedBarChart';
import MultiBarChart, { type BarSpec, type BracketSpec } from './charts/MultiBarChart';

const SIZE_LABELS = ['1', '2', '3', '4', '5+'];
const THRESHOLD_LABELS = ['≥2', '≥3', '≥4', '≥5'];

const C_WT = '#2563eb';
const C_DC = '#16a34a';
const C_KO = '#c2660f';
const C_NP = '#9d1c1c';
const C_PF = '#0891b2';

function toSeriesByCategory(occPerSeed: number[][], categoryCount: number): number[][] {
  // occPerSeed[seed] = [size1..size5] -> byCategory[category] = [seed1val, seed2val, ...]
  const byCategory: number[][] = Array.from({ length: categoryCount }, () => []);
  for (const seedRow of occPerSeed) {
    for (let c = 0; c < categoryCount; c++) byCategory[c].push(seedRow[c]);
  }
  return byCategory;
}

/** 図の各パネルに対応する形(カテゴリごとの平均・SEM・有意差)でCSVを出力する
 *  ——グラフに描かれている棒(平均)・エラーバー(SEM)・星印(有意差)と1対1で対応させ、
 *  生データを長形式のまま並べるよりExcelで見やすくするため。 */
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

/** Claude Artifactとして開かれている場合はdownloadsケーパビリティ経由で保存し(ビューアの
 *  確認ダイアログを介す——スクリプトによる直接ダウンロードはArtifactのサンドボックスでは
 *  動作しないため)、それ以外(ローカルのnpm run devなど通常のブラウザ)では通常の<a download>
 *  にフォールバックする。 */
async function downloadCsv(filename: string, csvText: string): Promise<void> {
  const blob = new Blob(['﻿' + csvText], { type: 'text/csv;charset=utf-8;' });
  const claude = (window as unknown as { claude?: { use: (name: string) => Promise<unknown> } }).claude;
  if (claude?.use) {
    try {
      const downloads = (await claude.use('downloads')) as { save: (req: { filename: string; data: Blob }) => Promise<unknown> } | null;
      if (downloads) {
        await downloads.save({ filename, data: blob });
        return;
      }
    } catch {
      // 拒否・レート制限などはビューア側にすでに表示されている。フォールバックはしない。
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatP(p: number): string {
  return p < 0.0001 ? '<0.0001' : p.toFixed(4);
}

/** グラフに打たれている個々の点(シードごとの値)の列名: <prefix>_seed42, <prefix>_seed43, ... */
function seedColumnNames(prefix: string): string[] {
  return STAT_SEEDS.map((s) => `${prefix}_seed${s}`);
}

/** WT(基準)とcompare群の1カテゴリ分の統計行を作る(パネルa〜cの棒1組=1行に対応)。
 *  平均・SEMに加え、グラフ上のジッタードット1つ1つに対応するシードごとの値も列として含む。 */
function statRow(
  panel: string,
  panelLabel: string,
  category: string,
  wtValues: number[],
  compareId: string,
  compareLabel: string,
  compareValues: number[],
): (string | number)[] {
  const p = wtValues.length > 1 && compareValues.length > 1 ? welchTTest(wtValues, compareValues).p : 1;
  return [
    panel,
    panelLabel,
    category,
    mean(wtValues).toFixed(2),
    sem(wtValues).toFixed(2),
    wtValues.length,
    ...wtValues.map((v) => v.toFixed(3)),
    compareId,
    compareLabel,
    mean(compareValues).toFixed(2),
    sem(compareValues).toFixed(2),
    compareValues.length,
    ...compareValues.map((v) => v.toFixed(3)),
    formatP(p),
    significanceStars(p),
  ];
}

const OCC_PANEL_HEADER = [
  'panel',
  'panel_label',
  'size_category',
  'WT_mean_occupancy_pct',
  'WT_sem_pct',
  'WT_n_seeds',
  ...seedColumnNames('WT'),
  'compare_id',
  'compare_label',
  'compare_mean_occupancy_pct',
  'compare_sem_pct',
  'compare_n_seeds',
  ...seedColumnNames('compare'),
  'p_value_vs_WT',
  'significance',
];

/** Figure S1のパネルa〜c(占有率、WT vs. 各ノックアウト)に1対1で対応するCSV。 */
function buildOccupancyCsv(occ: Record<KnockoutId, number[][]>): string {
  const wtBySize = toSeriesByCategory(occ.wtNative, 5);
  const panels: { panel: string; panelLabel: string; compareId: KnockoutId; compareLabel: string }[] = [
    { panel: 'a', panelLabel: '主モデル(WT vs. ΔCARD)', compareId: 'dcNative', compareLabel: 'ΔCARD' },
    { panel: 'b', panelLabel: '速度ノックアウト(WTにΔCARDの速度を付与)', compareId: 'velocityKO', compareLabel: 'WT+ΔCARD速度' },
    { panel: 'c', panelLabel: '停止の完全排除(WT、停止頻度=0)', compareId: 'noPause', compareLabel: 'WT、停止なし' },
    { panel: 'd', panelLabel: '停止頻度ノックアウト(WTの停止頻度をΔCARDに合わせる)', compareId: 'pauseFreqKO', compareLabel: 'WT+ΔCARD停止頻度' },
  ];
  const rows: (string | number)[][] = [OCC_PANEL_HEADER];
  for (const { panel, panelLabel, compareId, compareLabel } of panels) {
    const compareBySize = toSeriesByCategory(occ[compareId], 5);
    SIZE_LABELS.forEach((size, i) => {
      rows.push(statRow(panel, panelLabel, size, wtBySize[i], compareId, compareLabel, compareBySize[i]));
    });
  }
  return toCsv(rows);
}

/** Figure S1のパネルd(形成率の決定的な比較、4条件+4組の有意差ブラケット)に対応するCSV。
 *  上半分が各条件の平均±SEM(棒そのもの)、下半分がブラケットで示されている4組の有意差。 */
function buildFormRateCsv(formRate: Fig1Data['formRate']): string {
  const bars: { id: keyof Fig1Data['formRate']; label: string }[] = [
    { id: 'wtNative', label: 'WT (normal)' },
    { id: 'velocityKO', label: 'WT with ΔCARD speed' },
    { id: 'dcNative', label: 'ΔCARD (normal)' },
    { id: 'noPause', label: 'WT, no pausing' },
  ];
  const seedCols = STAT_SEEDS.map((s) => `seed${s}`);
  const header = ['section', 'id', 'label', 'mean_formation_rate_pct', 'sem_pct', 'n_seeds', ...seedCols, 'p_value', 'significance'];
  const rows: (string | number)[][] = [header];
  for (const { id, label } of bars) {
    const v = formRate[id];
    rows.push([
      'bar',
      id,
      label,
      mean(v).toFixed(2),
      sem(v).toFixed(2),
      v.length,
      ...v.map((x) => x.toFixed(3)),
      '',
      '',
    ]);
  }
  const blankSeedCols = seedCols.map(() => '');
  const brackets: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [0, 3],
  ];
  for (const [fi, ti] of brackets) {
    const a = formRate[bars[fi].id];
    const b = formRate[bars[ti].id];
    const p = a.length > 1 && b.length > 1 ? welchTTest(a, b).p : 1;
    rows.push([
      'comparison',
      `${bars[fi].id}_vs_${bars[ti].id}`,
      `${bars[fi].label} vs ${bars[ti].label}`,
      '',
      '',
      '',
      ...blankSeedCols,
      formatP(p),
      significanceStars(p),
    ]);
  }
  return toCsv(rows);
}

/** 到達率図のパネルa〜c(WT vs. 各ノックアウト、閾値別)に1対1で対応するCSV。 */
function buildReachRateCsv(reach: Fig2Data['reach']): string {
  const panels: { panel: string; panelLabel: string; compareId: 'dcNative' | 'velocityKO' | 'noPause' | 'pauseFreqKO'; compareLabel: string }[] = [
    { panel: 'a', panelLabel: '主モデル(WT vs. ΔCARD、実測通り)', compareId: 'dcNative', compareLabel: 'ΔCARD(実測)' },
    { panel: 'b', panelLabel: '速度ノックアウト(WTにΔCARDの速度を付与)', compareId: 'velocityKO', compareLabel: 'WT+ΔCARD速度' },
    { panel: 'c', panelLabel: '停止の完全排除(WT、停止頻度=0)', compareId: 'noPause', compareLabel: 'WT、停止なし' },
    { panel: 'd', panelLabel: '停止頻度ノックアウト(WTの停止頻度をΔCARDに合わせる)', compareId: 'pauseFreqKO', compareLabel: 'WT+ΔCARD停止頻度' },
  ];
  const header = OCC_PANEL_HEADER.map((h) => h.replace('size_category', 'threshold').replace('occupancy', 'reach_rate'));
  const rows: (string | number)[][] = [header];
  for (const { panel, panelLabel, compareId, compareLabel } of panels) {
    [2, 3, 4, 5].forEach((th, i) => {
      rows.push(statRow(panel, panelLabel, THRESHOLD_LABELS[i], reach.wtNative[th], compareId, compareLabel, reach[compareId][th]));
    });
  }
  return toCsv(rows);
}

interface Fig1Data {
  occ: Record<KnockoutId, number[][]>; // [seed][size]
  formRate: Record<'wtNative' | 'velocityKO' | 'dcNative' | 'noPause', number[]>; // [seed]
}

interface Fig2Data {
  reach: Record<'wtNative' | 'dcNative' | 'velocityKO' | 'noPause' | 'pauseFreqKO', Record<number, number[]>>;
}

interface Props {
  distributions: DistributionSet | null;
  params: SimulationParams;
}

export default function FigureGenerator({ distributions, params }: Props) {
  const [fig1, setFig1] = useState<Fig1Data | null>(null);
  const [fig1Running, setFig1Running] = useState(false);
  const [fig1Progress, setFig1Progress] = useState({ done: 0, total: 1, label: '' });

  const [fig2, setFig2] = useState<Fig2Data | null>(null);
  const [fig2Running, setFig2Running] = useState(false);
  const [fig2Progress, setFig2Progress] = useState({ done: 0, total: 1, label: '' });

  const runFig1 = async () => {
    if (!distributions || fig1Running) return;
    setFig1Running(true);
    setFig1(null);
    try {
      const occConditions: KnockoutId[] = ['wtNative', 'dcNative', 'velocityKO', 'noPause', 'pauseFreqKO'];
      const occ: Partial<Record<KnockoutId, number[][]>> = {};
      for (const id of occConditions) {
        const dist = buildDistributionFor(distributions, id);
        occ[id] = await computeOccupancyPerSeed(dist, params, 15, (done, total) =>
          setFig1Progress({ done, total, label: `占有率: ${id}` }),
        );
      }
      const formConditions: Array<'wtNative' | 'velocityKO' | 'dcNative' | 'noPause'> = [
        'wtNative',
        'velocityKO',
        'dcNative',
        'noPause',
      ];
      const formRate: Partial<Record<'wtNative' | 'velocityKO' | 'dcNative' | 'noPause', number[]>> = {};
      for (const id of formConditions) {
        const dist = buildDistributionFor(distributions, id);
        const r = await computeReachRatePerSeed(dist, params, 200, [params.filamentThreshold], (done, total) =>
          setFig1Progress({ done, total, label: `形成率: ${id}` }),
        );
        formRate[id] = r[params.filamentThreshold];
      }
      setFig1({ occ: occ as Record<KnockoutId, number[][]>, formRate: formRate as Fig1Data['formRate'] });
    } finally {
      setFig1Running(false);
    }
  };

  const runFig2 = async () => {
    if (!distributions || fig2Running) return;
    setFig2Running(true);
    setFig2(null);
    try {
      const conditions: Array<'wtNative' | 'dcNative' | 'velocityKO' | 'noPause' | 'pauseFreqKO'> = [
        'wtNative',
        'dcNative',
        'velocityKO',
        'noPause',
        'pauseFreqKO',
      ];
      const reach: Partial<Fig2Data['reach']> = {};
      for (const id of conditions) {
        const dist = buildDistributionFor(distributions, id);
        reach[id] = await computeReachRatePerSeed(dist, params, 200, [2, 3, 4, 5], (done, total) =>
          setFig2Progress({ done, total, label: id }),
        );
      }
      setFig2({ reach: reach as Fig2Data['reach'] });
    } finally {
      setFig2Running(false);
    }
  };

  const disabled = !distributions || fig1Running || fig2Running;

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h2 className="panel-title">図の生成</h2>
      </div>
      <p className="hint">
        現在のパラメーター(投入分子数・投入間隔・フィラメント判定閾値)と、上で読み込んだ実測データを使い、
        統計用に固定した20シード({STAT_SEEDS[0]}〜{STAT_SEEDS[STAT_SEEDS.length - 1]})で複数条件をバッチ実行します。
        Welchの両側t検定(ns/*/**/***/**** = P≥0.05/&lt;0.05/&lt;0.01/&lt;0.001/&lt;0.0001)。
      </p>

      <div className="fig-generate-row">
        <button type="button" className="btn btn-primary" onClick={runFig1} disabled={disabled}>
          {fig1Running ? `実行中… (${fig1Progress.label} ${fig1Progress.done}/${fig1Progress.total})` : 'Figure S1(占有率+形成率)を生成'}
        </button>
        <button type="button" className="btn btn-primary" onClick={runFig2} disabled={disabled}>
          {fig2Running
            ? `実行中… (${fig2Progress.label} ${fig2Progress.done}/${fig2Progress.total})`
            : '到達率(速度・停止ノックアウト)を生成'}
        </button>
      </div>

      {fig1 && (
        <div className="fig-block">
          <h3 className="fig-block-title">Figure S1. Pausing, not velocity, is required for WT filament formation</h3>
          <div className="fig-generate-row">
            <button
              type="button"
              className="btn btn-small"
              onClick={() =>
                downloadCsv(
                  `figureS1_occupancy_seed${STAT_SEEDS[0]}-${STAT_SEEDS[STAT_SEEDS.length - 1]}.csv`,
                  buildOccupancyCsv(fig1.occ),
                )
              }
            >
              占有率CSVをダウンロード
            </button>
            <button
              type="button"
              className="btn btn-small"
              onClick={() =>
                downloadCsv(
                  `figureS1_formation_rate_seed${STAT_SEEDS[0]}-${STAT_SEEDS[STAT_SEEDS.length - 1]}.csv`,
                  buildFormRateCsv(fig1.formRate),
                )
              }
            >
              形成率CSVをダウンロード
            </button>
          </div>
          <div className="fig-grid-3col">
            <div className="fig-cell">
              <div className="fig-cell-title">a. 主モデル(WT vs. ΔCARD)</div>
              <PairedBarChart
                categories={SIZE_LABELS}
                seriesA={{ label: 'WT', color: C_WT, fill: 'white', valuesByCategory: toSeriesByCategory(fig1.occ.wtNative, 5) }}
                seriesB={{ label: 'ΔCARD', color: C_DC, fill: C_DC, valuesByCategory: toSeriesByCategory(fig1.occ.dcNative, 5) }}
                yLabel="RNA-track occupancy (%)"
                yMax={100}
              />
            </div>
            <div className="fig-cell">
              <div className="fig-cell-title">b. 速度ノックアウト(WTにΔCARDの速度を付与)</div>
              <PairedBarChart
                categories={SIZE_LABELS}
                seriesA={{ label: 'WT', color: C_WT, fill: 'white', valuesByCategory: toSeriesByCategory(fig1.occ.wtNative, 5) }}
                seriesB={{
                  label: 'WT+ΔCARD速度',
                  color: C_KO,
                  fill: C_KO,
                  valuesByCategory: toSeriesByCategory(fig1.occ.velocityKO, 5),
                }}
                yLabel="RNA-track occupancy (%)"
                yMax={100}
              />
            </div>
            <div className="fig-cell">
              <div className="fig-cell-title">c. 停止の完全排除(WT、停止頻度=0)</div>
              <PairedBarChart
                categories={SIZE_LABELS}
                seriesA={{ label: 'WT', color: C_WT, fill: 'white', valuesByCategory: toSeriesByCategory(fig1.occ.wtNative, 5) }}
                seriesB={{
                  label: 'WT、停止なし',
                  color: C_NP,
                  fill: C_NP,
                  valuesByCategory: toSeriesByCategory(fig1.occ.noPause, 5),
                }}
                yLabel="RNA-track occupancy (%)"
                yMax={100}
              />
            </div>
            <div className="fig-cell">
              <div className="fig-cell-title">d. 停止頻度ノックアウト(WTの停止頻度をΔCARDに合わせる)</div>
              <PairedBarChart
                categories={SIZE_LABELS}
                seriesA={{ label: 'WT', color: C_WT, fill: 'white', valuesByCategory: toSeriesByCategory(fig1.occ.wtNative, 5) }}
                seriesB={{
                  label: 'WT+ΔCARD停止頻度',
                  color: C_PF,
                  fill: C_PF,
                  valuesByCategory: toSeriesByCategory(fig1.occ.pauseFreqKO, 5),
                }}
                yLabel="RNA-track occupancy (%)"
                yMax={100}
              />
            </div>
          </div>
          <div className="fig-cell fig-cell-wide">
            <div className="fig-cell-title">
              e. 形成率: 決定的な比較 — 部分的(速度)vs. 完全(停止)な機能喪失
            </div>
            {(() => {
              const bars: BarSpec[] = [
                { label: 'WT\n(normal)', color: C_WT, fill: 'white', values: fig1.formRate.wtNative },
                { label: 'WT with\nΔCARD speed', color: C_KO, fill: C_KO, values: fig1.formRate.velocityKO },
                { label: 'ΔCARD\n(normal)', color: C_DC, fill: C_DC, values: fig1.formRate.dcNative },
                { label: 'WT, no\npausing', color: C_NP, fill: 'white', values: fig1.formRate.noPause },
              ];
              const brackets: BracketSpec[] = [
                { fromIndex: 0, toIndex: 1, level: 0 },
                { fromIndex: 1, toIndex: 2, level: 1 },
                { fromIndex: 2, toIndex: 3, level: 0 },
                { fromIndex: 0, toIndex: 3, level: 2 },
              ];
              return (
                <MultiBarChart
                  bars={bars}
                  brackets={brackets}
                  yLabel="Filament formation rate (%)"
                  refLineIndex={2}
                  width={700}
                  height={340}
                />
              );
            })()}
          </div>
        </div>
      )}

      {fig2 && (
        <div className="fig-block">
          <h3 className="fig-block-title">到達率: 主モデル・速度ノックアウト・停止の完全排除・停止頻度ノックアウトの比較</h3>
          <div className="fig-generate-row">
            <button
              type="button"
              className="btn btn-small"
              onClick={() =>
                downloadCsv(
                  `reach_rate_seed${STAT_SEEDS[0]}-${STAT_SEEDS[STAT_SEEDS.length - 1]}.csv`,
                  buildReachRateCsv(fig2.reach),
                )
              }
            >
              到達率CSVをダウンロード
            </button>
          </div>
          <div className="fig-grid-3col">
            <div className="fig-cell">
              <div className="fig-cell-title">a. 主モデル(WT vs. ΔCARD、実測通り)</div>
              <PairedBarChart
                categories={THRESHOLD_LABELS}
                seriesA={{
                  label: 'Simulated WT',
                  color: C_WT,
                  fill: 'white',
                  valuesByCategory: [2, 3, 4, 5].map((th) => fig2.reach.wtNative[th]),
                }}
                seriesB={{
                  label: 'Simulated ΔCARD',
                  color: C_DC,
                  fill: C_DC,
                  valuesByCategory: [2, 3, 4, 5].map((th) => fig2.reach.dcNative[th]),
                }}
                xLabel="Complex-size threshold (≥ N subunits)"
                yLabel="Trials reaching threshold (%)"
                yMax={100}
              />
            </div>
            <div className="fig-cell">
              <div className="fig-cell-title">b. 速度ノックアウト(WTにΔCARDの速度を付与)</div>
              <PairedBarChart
                categories={THRESHOLD_LABELS}
                seriesA={{
                  label: 'Simulated WT',
                  color: C_WT,
                  fill: 'white',
                  valuesByCategory: [2, 3, 4, 5].map((th) => fig2.reach.wtNative[th]),
                }}
                seriesB={{
                  label: 'Simulated WT (ΔCARD velocity)',
                  color: C_KO,
                  fill: C_KO,
                  valuesByCategory: [2, 3, 4, 5].map((th) => fig2.reach.velocityKO[th]),
                }}
                xLabel="Complex-size threshold (≥ N subunits)"
                yLabel="Trials reaching threshold (%)"
                yMax={100}
              />
            </div>
            <div className="fig-cell">
              <div className="fig-cell-title">c. 停止の完全排除(WT、停止頻度=0)</div>
              <PairedBarChart
                categories={THRESHOLD_LABELS}
                seriesA={{
                  label: 'Simulated WT',
                  color: C_WT,
                  fill: 'white',
                  valuesByCategory: [2, 3, 4, 5].map((th) => fig2.reach.wtNative[th]),
                }}
                seriesB={{
                  label: 'Simulated WT (no pausing)',
                  color: C_NP,
                  fill: C_NP,
                  valuesByCategory: [2, 3, 4, 5].map((th) => fig2.reach.noPause[th]),
                }}
                xLabel="Complex-size threshold (≥ N subunits)"
                yLabel="Trials reaching threshold (%)"
                yMax={100}
              />
            </div>
            <div className="fig-cell">
              <div className="fig-cell-title">d. 停止頻度ノックアウト(WTの停止頻度をΔCARDに合わせる)</div>
              <PairedBarChart
                categories={THRESHOLD_LABELS}
                seriesA={{
                  label: 'Simulated WT',
                  color: C_WT,
                  fill: 'white',
                  valuesByCategory: [2, 3, 4, 5].map((th) => fig2.reach.wtNative[th]),
                }}
                seriesB={{
                  label: 'Simulated WT (ΔCARD pause frequency)',
                  color: C_PF,
                  fill: C_PF,
                  valuesByCategory: [2, 3, 4, 5].map((th) => fig2.reach.pauseFreqKO[th]),
                }}
                xLabel="Complex-size threshold (≥ N subunits)"
                yLabel="Trials reaching threshold (%)"
                yMax={100}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
