import { memo } from 'react';
import type { SimulationParams } from '../types';
import { REFERENCE_VELOCITY_DCARD_NM_S, REFERENCE_VELOCITY_WT_NM_S } from '../lib/constants';

interface Props {
  params: SimulationParams;
  onChange: (patch: Partial<SimulationParams>) => void;
  disabled?: boolean;
}

interface RangeFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled?: boolean;
  className?: string;
  onChange: (v: number) => void;
}

function RangeField({ label, value, min, max, step, unit, disabled, className, onChange }: RangeFieldProps) {
  return (
    <label className={`field${className ? ` ${className}` : ''}`}>
      <span className="field-label">
        {label}
        <span className="field-value">
          {value}
          {unit ?? ''}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number.parseFloat(e.target.value))}
      />
    </label>
  );
}

function ParameterPanel({ params, onChange, disabled }: Props) {
  return (
    <div className="panel">
      <h2 className="panel-title">パラメータ設定</h2>
      <p className="hint" style={{ marginBottom: 12 }}>
        結合ルールに自由パラメータはありません。ここで変更できるのは実験設計に相当するパラメータのみです。
      </p>

      <RangeField
        label="投入するRIG-I分子数"
        value={params.moleculeCount}
        min={1}
        max={20}
        step={1}
        unit=" 分子"
        disabled={disabled}
        onChange={(v) => onChange({ moleculeCount: v })}
      />
      <div className="field">
        <span className="field-label">投入タイミング</span>
        <div className="segmented" role="radiogroup" aria-label="投入タイミング">
          <button
            type="button"
            className={`segmented-btn${params.injectionMode === 'regular' ? ' active' : ''}`}
            disabled={disabled}
            onClick={() => onChange({ injectionMode: 'regular' })}
          >
            規則的(間隔+ゆらぎ)
          </button>
          <button
            type="button"
            className={`segmented-btn${params.injectionMode === 'random' ? ' active' : ''}`}
            disabled={disabled}
            onClick={() => onChange({ injectionMode: 'random' })}
          >
            完全ランダム
          </button>
        </div>
      </div>
      {params.injectionMode === 'random' && (
        <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
          1個前の分子から{params.randomInjectionMinS}〜{params.randomInjectionMaxS}秒後にランダムに投入します(下の投入間隔は使われません)。
        </p>
      )}
      <div className="field-row">
        <RangeField
          label="ランダム投入間隔(下限)"
          value={params.randomInjectionMinS}
          min={20}
          max={200}
          step={1}
          unit=" s"
          className="field-inline"
          disabled={disabled || params.injectionMode !== 'random'}
          onChange={(v) => onChange({ randomInjectionMinS: v })}
        />
        <RangeField
          label="ランダム投入間隔(上限)"
          value={params.randomInjectionMaxS}
          min={20}
          max={200}
          step={1}
          unit=" s"
          className="field-inline"
          disabled={disabled || params.injectionMode !== 'random'}
          onChange={(v) => onChange({ randomInjectionMaxS: v })}
        />
      </div>
      <div className="field">
        <span className="field-label">移動速度の与え方</span>
        <div className="segmented" role="radiogroup" aria-label="移動速度の与え方">
          <button
            type="button"
            className={`segmented-btn${params.velocityMode === 'distribution' ? ' active' : ''}`}
            disabled={disabled}
            onClick={() => onChange({ velocityMode: 'distribution' })}
          >
            実測分布から毎ステップ抽選
          </button>
          <button
            type="button"
            className={`segmented-btn${params.velocityMode === 'fixedMean' ? ' active' : ''}`}
            disabled={disabled}
            onClick={() => onChange({ velocityMode: 'fixedMean' })}
          >
            平均速度で固定
          </button>
        </div>
      </div>
      {params.velocityMode === 'fixedMean' && (
        <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
          平均速度(WT {REFERENCE_VELOCITY_WT_NM_S} nm/s・ΔCARD {REFERENCE_VELOCITY_DCARD_NM_S} nm/s)を条件ごとの一定速度として固定します(読み込んだCSVの平均値は使いません)。
        </p>
      )}
      <RangeField
        label="分子投入間隔"
        value={params.injectionIntervalS}
        min={5}
        max={90}
        step={1}
        unit=" s"
        disabled={disabled || params.injectionMode === 'random'}
        onChange={(v) => onChange({ injectionIntervalS: v })}
      />
      <RangeField
        label="フィラメント判定分子数(閾値)"
        value={params.filamentThreshold}
        min={2}
        max={20}
        step={1}
        unit=" 分子以上"
        disabled={disabled}
        onChange={(v) => onChange({ filamentThreshold: v })}
      />

      <div className="field-row">
        <label className="field field-inline">
          <span className="field-label">乱数シード</span>
          <input
            type="number"
            className="number-input"
            value={params.seed}
            disabled={disabled}
            onChange={(e) => onChange({ seed: Number.parseInt(e.target.value, 10) || 0 })}
          />
        </label>
        <label className="field field-inline">
          <span className="field-label">試行数(条件ごと)</span>
          <input
            type="number"
            className="number-input"
            min={1}
            max={2000}
            value={params.trialsPerCondition}
            disabled={disabled}
            onChange={(e) =>
              onChange({ trialsPerCondition: Math.max(1, Number.parseInt(e.target.value, 10) || 1) })
            }
          />
        </label>
      </div>
    </div>
  );
}

export default memo(ParameterPanel);
