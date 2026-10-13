import { memo, type ChangeEvent } from 'react';
import type { DistributionSet } from '../types';

export type CsvKind = 'velocity' | 'pauseDuration' | 'pauseFrequency';

interface Props {
  distributions: DistributionSet | null;
  loading: boolean;
  error: string | null;
  onUploadFile: (kind: CsvKind, file: File) => void;
  onResetDefaults: () => void;
}

const ROWS: { kind: CsvKind; title: string; hint: string }[] = [
  { kind: 'velocity', title: '① 移動速度 (Moving segment velocity)', hint: 'Moving_velocity_nm_s 列' },
  { kind: 'pauseDuration', title: '② 停止持続時間 (Pause segment duration)', hint: 'Pause_duration_s 列' },
  {
    kind: 'pauseFrequency',
    title: '③ 停止頻度 (Pause frequency)',
    hint: 'Pause_frequency_events_per_100s_Moving 列',
  },
];

function countsFor(distributions: DistributionSet | null, kind: CsvKind): string {
  if (!distributions) return '未読み込み';
  return `WT: ${distributions.WT[kind].length} 件 / ΔCARD: ${distributions.dCARD[kind].length} 件`;
}

function DataPanel({ distributions, loading, error, onUploadFile, onResetDefaults }: Props) {
  const handleFile = (kind: CsvKind) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadFile(kind, file);
    e.target.value = '';
  };

  return (
    <div className="panel">
      <div className="panel-header-row">
        <h2 className="panel-title">実測データ (CSV)</h2>
        <button type="button" className="btn btn-small" onClick={onResetDefaults} disabled={loading}>
          既定データに戻す
        </button>
      </div>
      {loading && <p className="hint">読み込み中...</p>}
      {error && <p className="error-text">{error}</p>}
      <div className="data-rows">
        {ROWS.map((row) => (
          <div key={row.kind} className="data-row">
            <div className="data-row-main">
              <span className="data-row-title">{row.title}</span>
              <span className="data-row-hint">{row.hint}</span>
            </div>
            <span className="data-row-count">{countsFor(distributions, row.kind)}</span>
            <label className="btn btn-small btn-file">
              CSVを選択
              <input type="file" accept=".csv,text/csv" onChange={handleFile(row.kind)} hidden />
            </label>
          </div>
        ))}
      </div>
      <p className="hint">
        各CSVはGroup列でWT / ΔCARDを判別します。既定では同梱のサンプルデータ(public/data)が読み込まれます。
      </p>
    </div>
  );
}

export default memo(DataPanel);
