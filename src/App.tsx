import { useEffect, useMemo, useState } from 'react';
import type { Condition, Distributions, DistributionSet, MonteCarloSummary, SimulationParams } from './types';
import { parsePauseDurationCsv, parsePauseFrequencyCsv, parseVelocityCsv } from './lib/csv';
import { findRepresentativeTrialIndex, runTrialAnimation } from './lib/simulation';
import { runMonteCarlo } from './lib/montecarlo';
import { usePlaybackClock } from './hooks/usePlaybackClock';
import DataPanel, { type CsvKind } from './components/DataPanel';
import ParameterPanel from './components/ParameterPanel';
import SimulationTrack from './components/SimulationTrack';
import PlaybackControls from './components/PlaybackControls';
import StateLegend from './components/StateLegend';
import TrialMatrix from './components/TrialMatrix';
import ModelInfo from './components/ModelInfo';
import FigureGenerator from './components/FigureGenerator';
import './App.css';
import velocityCsvRaw from '../public/data/01_Moving_segment_velocity_WT_dCARD.csv?raw';
import pauseDurationCsvRaw from '../public/data/02_Pause_segment_duration_WT_dCARD.csv?raw';
import pauseFrequencyCsvRaw from '../public/data/03_Pause_frequency_WT_dCARD.csv?raw';
import { RANDOM_INJECTION_MAX_S, RANDOM_INJECTION_MIN_S } from './lib/constants';

const DEFAULT_PARAMS: SimulationParams = {
  moleculeCount: 20,
  injectionIntervalS: 20,
  injectionMode: 'random',
  randomInjectionMinS: RANDOM_INJECTION_MIN_S,
  randomInjectionMaxS: RANDOM_INJECTION_MAX_S,
  velocityMode: 'fixedMean',
  filamentThreshold: 5,
  seed: 42,
  trialsPerCondition: 300,
};

// ビルド時にバンドルへ埋め込む(単一ファイルとして配布してもfetchなしで動くようにするため)
const DEFAULT_CSV_TEXT: Record<CsvKind, string> = {
  velocity: velocityCsvRaw,
  pauseDuration: pauseDurationCsvRaw,
  pauseFrequency: pauseFrequencyCsvRaw,
};

function emptyDistributionSet(): DistributionSet {
  const empty: Distributions = { velocity: [], pauseDuration: [], pauseFrequency: [] };
  return { WT: { ...empty }, dCARD: { ...empty } };
}

function parseByKind(kind: CsvKind, text: string) {
  if (kind === 'velocity') return parseVelocityCsv(text);
  if (kind === 'pauseDuration') return parsePauseDurationCsv(text);
  return parsePauseFrequencyCsv(text);
}

/** distributions中の1カテゴリ(velocity/pauseDuration/pauseFrequency)だけを差し替えた新しいDistributionSetを返す */
function withUpdatedCategory(
  base: DistributionSet,
  kind: CsvKind,
  wtValues: number[],
  dcardValues: number[],
): DistributionSet {
  if (kind === 'velocity') {
    return {
      WT: { ...base.WT, velocity: wtValues },
      dCARD: { ...base.dCARD, velocity: dcardValues },
    };
  }
  if (kind === 'pauseDuration') {
    return {
      WT: { ...base.WT, pauseDuration: wtValues },
      dCARD: { ...base.dCARD, pauseDuration: dcardValues },
    };
  }
  return {
    WT: { ...base.WT, pauseFrequency: wtValues },
    dCARD: { ...base.dCARD, pauseFrequency: dcardValues },
  };
}

async function loadDefaultDistributions(): Promise<DistributionSet> {
  const velocity = parseVelocityCsv(DEFAULT_CSV_TEXT.velocity);
  const pauseDuration = parsePauseDurationCsv(DEFAULT_CSV_TEXT.pauseDuration);
  const pauseFrequency = parsePauseFrequencyCsv(DEFAULT_CSV_TEXT.pauseFrequency);
  return {
    WT: { velocity: velocity.values.WT, pauseDuration: pauseDuration.values.WT, pauseFrequency: pauseFrequency.values.WT },
    dCARD: {
      velocity: velocity.values.dCARD,
      pauseDuration: pauseDuration.values.dCARD,
      pauseFrequency: pauseFrequency.values.dCARD,
    },
  };
}

export default function App() {
  const [distributions, setDistributions] = useState<DistributionSet | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);

  const [mcSummaries, setMcSummaries] = useState<Record<Condition, MonteCarloSummary | null>>({
    WT: null,
    dCARD: null,
  });
  const [mcRunning, setMcRunning] = useState(false);
  const [mcProgress, setMcProgress] = useState<Record<Condition, { done: number; total: number }>>({
    WT: { done: 0, total: params.trialsPerCondition },
    dCARD: { done: 0, total: params.trialsPerCondition },
  });

  const [selectedTrial, setSelectedTrial] = useState<Record<Condition, number>>({ WT: 0, dCARD: 0 });

  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);
    loadDefaultDistributions()
      .then((d) => {
        if (!cancelled) {
          setDistributions(d);
          setDataError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setDataError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateParams = (patch: Partial<SimulationParams>) => {
    setParams((prev) => ({ ...prev, ...patch }));
    setMcSummaries({ WT: null, dCARD: null });
  };

  const handleUploadFile = async (kind: CsvKind, file: File) => {
    try {
      setDataLoading(true);
      const text = await file.text();
      const parsed = parseByKind(kind, text);
      if (parsed.usedRows === 0) {
        throw new Error('有効なデータ行が見つかりませんでした。CSVのGroup列と数値列を確認してください。');
      }
      setDistributions((prev) => {
        const base = prev ?? emptyDistributionSet();
        return withUpdatedCategory(base, kind, parsed.values.WT, parsed.values.dCARD);
      });
      setDataError(null);
      setMcSummaries({ WT: null, dCARD: null });
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
    } finally {
      setDataLoading(false);
    }
  };

  const handleResetDefaults = () => {
    setDataLoading(true);
    loadDefaultDistributions()
      .then((d) => {
        setDistributions(d);
        setDataError(null);
        setMcSummaries({ WT: null, dCARD: null });
      })
      .catch((e: unknown) => setDataError(e instanceof Error ? e.message : String(e)))
      .finally(() => setDataLoading(false));
  };

  // パラメータやデータが変わるたびに、代表試行として「WTは末端まで残存/ΔCARDは未形成」という
  // 典型的な結果になる試行番号を探し直す(特定の試行番号が偶然の外れ値になって代表性を欠くのを防ぐ)。
  // 全試行結果パネルの統計値そのものは変わらない — あくまで代表アニメーションの選び方の工夫。
  useEffect(() => {
    if (!distributions) return;
    const wtIdx = findRepresentativeTrialIndex('WT', params, distributions.WT, (r) => r.endHasFilament);
    const dcardIdx = findRepresentativeTrialIndex('dCARD', params, distributions.dCARD, (r) => !r.everFormedFilament);
    setSelectedTrial({ WT: wtIdx, dCARD: dcardIdx });
  }, [distributions, params]);

  const wtAnimation = useMemo(() => {
    if (!distributions) return null;
    return runTrialAnimation('WT', selectedTrial.WT, params, distributions.WT);
  }, [distributions, selectedTrial.WT, params]);

  const dcardAnimation = useMemo(() => {
    if (!distributions) return null;
    return runTrialAnimation('dCARD', selectedTrial.dCARD, params, distributions.dCARD);
  }, [distributions, selectedTrial.dCARD, params]);

  // frames は DT_S 秒おきに記録されるため、フレーム数ではなく最後のフレームの実時刻(秒)を使う
  // (DT_S=1のときはフレーム数と一致していたが、DT_Sを変えると食い違う)。
  const lastFrameTimeS = (frames: { t: number }[] | undefined) => frames?.[frames.length - 1]?.t ?? 0;
  const maxTimeS = Math.max(1, lastFrameTimeS(wtAnimation?.frames), lastFrameTimeS(dcardAnimation?.frames));
  const clock = usePlaybackClock(maxTimeS);

  useEffect(() => {
    clock.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrial.WT, selectedTrial.dCARD, wtAnimation, dcardAnimation]);

  const handleRunMonteCarlo = async () => {
    if (!distributions || mcRunning) return;
    setMcRunning(true);
    setMcSummaries({ WT: null, dCARD: null });
    setMcProgress({
      WT: { done: 0, total: params.trialsPerCondition },
      dCARD: { done: 0, total: params.trialsPerCondition },
    });
    try {
      const [wt, dcard] = await Promise.all([
        runMonteCarlo('WT', params, distributions.WT, (done, total) =>
          setMcProgress((p) => ({ ...p, WT: { done, total } })),
        ),
        runMonteCarlo('dCARD', params, distributions.dCARD, (done, total) =>
          setMcProgress((p) => ({ ...p, dCARD: { done, total } })),
        ),
      ]);
      setMcSummaries({ WT: wt, dCARD: dcard });
      // 300試行の実測結果から、代表アニメーションとして「典型的な」試行を選び直す
      // (WT: 末端到達時点でも閾値以上のマルチマーが残存している試行 / ΔCARD: 一度も閾値に達しなかった試行)。
      const wtRep =
        wt.results.find((r) => r.endHasFilament)?.trialIndex ??
        wt.results.find((r) => r.everFormedFilament)?.trialIndex ??
        0;
      const dcardRep = dcard.results.find((r) => !r.everFormedFilament)?.trialIndex ?? 0;
      setSelectedTrial({ WT: wtRep, dCARD: dcardRep });
    } finally {
      setMcRunning(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>RIG-I トランスロケーション・シミュレーター</h1>
        <p className="app-subtitle">
          実測データに基づき、WT / ΔCARD RIG-IがウイルスRNA上を移動・停止・衝突・結合・マルチマー化・解離する様子をシミュレートします。
        </p>
      </header>

      <DataPanel
        distributions={distributions}
        loading={dataLoading}
        error={dataError}
        onUploadFile={handleUploadFile}
        onResetDefaults={handleResetDefaults}
      />

      <ParameterPanel params={params} onChange={updateParams} disabled={mcRunning} />

      <div className="panel">
        <div className="panel-header-row">
          <h2 className="panel-title">代表試行アニメーション</h2>
          <StateLegend />
        </div>
        <PlaybackControls clock={clock} maxTimeS={maxTimeS} />
        <div className="tracks-row">
          <SimulationTrack label="WT" accentVar="--c-wt" trial={wtAnimation} time={clock.time} />
          <SimulationTrack label="ΔCARD" accentVar="--c-dcard" trial={dcardAnimation} time={clock.time} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-header-row">
          <h2 className="panel-title">全試行結果(モンテカルロ)</h2>
          <button type="button" className="btn btn-primary" onClick={handleRunMonteCarlo} disabled={mcRunning || !distributions}>
            {mcRunning ? '実行中...' : `全試行を実行 (条件ごと ${params.trialsPerCondition} 試行)`}
          </button>
        </div>
        <div className="matrix-row">
          <TrialMatrix
            label="WT"
            accentVar="--c-wt"
            summary={mcSummaries.WT}
            selectedTrialIndex={selectedTrial.WT}
            onSelectTrial={(idx) => setSelectedTrial((s) => ({ ...s, WT: idx }))}
            running={mcRunning}
            progress={mcProgress.WT}
          />
          <TrialMatrix
            label="ΔCARD"
            accentVar="--c-dcard"
            summary={mcSummaries.dCARD}
            selectedTrialIndex={selectedTrial.dCARD}
            onSelectTrial={(idx) => setSelectedTrial((s) => ({ ...s, dCARD: idx }))}
            running={mcRunning}
            progress={mcProgress.dCARD}
          />
        </div>
      </div>

      <FigureGenerator distributions={distributions} params={params} />

      <ModelInfo />
    </div>
  );
}
