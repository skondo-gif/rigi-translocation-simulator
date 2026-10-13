// CSV読み込み・パースユーティリティ。
// 実測データCSVの Group 列 (WT / ΔCARD) から条件を判定し、対象の数値列を抽出する。

import type { Condition } from '../types';

function splitCsvLine(line: string): string[] {
  return line.split(',').map((s) => s.trim());
}

function normalizeGroup(raw: string): Condition | null {
  const g = raw.trim();
  if (g.length === 0) return null;
  if (g.toUpperCase() === 'WT') return 'WT';
  if (g.toUpperCase().includes('CARD')) return 'dCARD'; // ΔCARD / dCARD / DCARD 等を許容
  return null;
}

export interface CsvParseResult {
  values: Record<Condition, number[]>;
  totalRows: number;
  usedRows: number;
}

/**
 * 汎用CSVパーサー。
 * Group 列で WT / ΔCARD を判定し、valueColumnNames のいずれかに一致する列を数値として抽出する。
 * 一致する列名が見つからない場合は最終列を使用する。
 */
export function parseGroupedCsv(text: string, valueColumnNames: string[]): CsvParseResult {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  const values: Record<Condition, number[]> = { WT: [], dCARD: [] };
  if (lines.length < 2) {
    return { values, totalRows: 0, usedRows: 0 };
  }

  const header = splitCsvLine(lines[0]);
  const groupIdx = header.findIndex((h) => h.toLowerCase() === 'group');

  let valueIdx = -1;
  for (const name of valueColumnNames) {
    const idx = header.findIndex((h) => h === name);
    if (idx >= 0) {
      valueIdx = idx;
      break;
    }
  }
  if (valueIdx < 0) valueIdx = header.length - 1;

  let usedRows = 0;
  const totalRows = lines.length - 1;
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length <= Math.max(groupIdx, valueIdx)) continue;
    const cond = groupIdx >= 0 ? normalizeGroup(cols[groupIdx]) : null;
    if (!cond) continue;
    const v = Number.parseFloat(cols[valueIdx]);
    if (!Number.isFinite(v)) continue;
    values[cond].push(v);
    usedRows++;
  }

  return { values, totalRows, usedRows };
}

export function parseVelocityCsv(text: string): CsvParseResult {
  return parseGroupedCsv(text, ['Moving_velocity_nm_s']);
}

export function parsePauseDurationCsv(text: string): CsvParseResult {
  return parseGroupedCsv(text, ['Pause_duration_s']);
}

export function parsePauseFrequencyCsv(text: string): CsvParseResult {
  return parseGroupedCsv(text, ['Pause_frequency_events_per_100s_Moving']);
}
