import { memo } from 'react';
import type { MonteCarloSummary } from '../types';

interface Props {
  label: string;
  accentVar: string;
  summary: MonteCarloSummary | null;
  selectedTrialIndex: number;
  onSelectTrial: (idx: number) => void;
  running: boolean;
  progress: { done: number; total: number } | null;
}

function TrialMatrix({
  label,
  accentVar,
  summary,
  selectedTrialIndex,
  onSelectTrial,
  running,
  progress,
}: Props) {
  const n = summary?.results.length ?? 0;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));

  return (
    <div className="matrix-panel" style={{ borderTopColor: `var(${accentVar})` }}>
      <h3 className="matrix-title" style={{ color: `var(${accentVar})` }}>
        {label}
      </h3>

      {running && progress && (
        <div className="progress-bar-outer">
          <div
            className="progress-bar-inner"
            style={{ width: `${(100 * progress.done) / Math.max(1, progress.total)}%` }}
          />
          <span className="progress-label">
            {progress.done} / {progress.total} 試行
          </span>
        </div>
      )}

      {!summary && !running && <p className="hint">「全試行を実行」を押すとモンテカルロ計算が始まります。</p>}

      {summary && (
        <>
          <div className="matrix-stats">
            <div className="stat-box">
              <span className="stat-label">フィラメント形成率</span>
              <span className="stat-value">{summary.formationRatePct.toFixed(1)}%</span>
              <span className="stat-sub">観察時間内に一度でも閾値到達</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">最大マルチマーサイズ(平均)</span>
              <span className="stat-value">{summary.averageMaxClusterSize.toFixed(2)}</span>
              <span className="stat-sub">分子/試行</span>
            </div>
            <div className="stat-box">
              <span className="stat-label">終了時残存率</span>
              <span className="stat-value">{summary.endPersistenceRatePct.toFixed(1)}%</span>
              <span className="stat-sub">観察終了時点で閾値以上のマルチマーが存在</span>
            </div>
          </div>

          <div className="matrix-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {summary.results.map((r) => (
              <button
                key={r.trialIndex}
                type="button"
                className={
                  'matrix-cell' +
                  (r.everFormedFilament ? ' matrix-cell-formed' : ' matrix-cell-notformed') +
                  (r.trialIndex === selectedTrialIndex ? ' matrix-cell-selected' : '')
                }
                title={`試行 #${r.trialIndex + 1}: 最大マルチマー ${r.maxClusterSize}, 形成${
                  r.everFormedFilament ? 'あり' : 'なし'
                }, 終了時残存${r.endHasFilament ? 'あり' : 'なし'}`}
                onClick={() => onSelectTrial(r.trialIndex)}
              />
            ))}
          </div>
          <div className="legend" style={{ marginTop: 8 }}>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: 'var(--c-formed)' }} />
              フィラメント形成あり
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: 'var(--c-notformed)' }} />
              形成なし
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(TrialMatrix);
