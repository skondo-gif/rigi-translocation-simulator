// RIG-I トランスロケーション・シミュレーター 共通型定義

export type Condition = 'WT' | 'dCARD';

/** 実測分布（1条件分） */
export interface Distributions {
  /** 移動速度 (nm/s) */
  velocity: number[];
  /** 停止持続時間 (s) */
  pauseDuration: number[];
  /** 停止頻度 (events / 100 s moving)。0 を含む */
  pauseFrequency: number[];
}

export type DistributionSet = Record<Condition, Distributions>;

export type InjectionMode = 'regular' | 'random';

/** 移動速度の与え方。'distribution' = 動いている間、計算時間刻みごとに実測分布から引き直す
 *  (既定)。'fixedMean' = 条件(WT/ΔCARD)の実測分布の平均値を1つだけ計算し、その条件の
 *  全分子・全時刻で同じ一定速度として使う(実測分布からの毎ステップ抽選はしない)。 */
export type VelocityMode = 'distribution' | 'fixedMean';

export interface SimulationParams {
  /** 投入するRIG-I分子数 (1-20) */
  moleculeCount: number;
  /** 分子投入間隔 (s) (5-90)。injectionMode='random'のときは使われない。 */
  injectionIntervalS: number;
  /** 投入タイミングの方式。'regular' = injectionIntervalS間隔+ゆらぎ(既定)、
   *  'random' = 分子数を固定した上で、1個前の分子からの投入間隔を毎回
   *  [randomInjectionMinS, randomInjectionMaxS) から独立に一様乱数で抽選し累積していく
   *  完全ランダム方式。 */
  injectionMode: InjectionMode;
  /** 完全ランダムモード時、1個前の分子からの投入間隔の下限 (s)。injectionMode='regular'のときは使われない。 */
  randomInjectionMinS: number;
  /** 完全ランダムモード時、1個前の分子からの投入間隔の上限 (s)。injectionMode='regular'のときは使われない。 */
  randomInjectionMaxS: number;
  /** 移動速度の与え方。詳細は VelocityMode を参照。 */
  velocityMode: VelocityMode;
  /** フィラメント判定分子数 (マルチマーサイズの閾値) */
  filamentThreshold: number;
  /** 乱数シード */
  seed: number;
  /** 試行数 (条件ごと) */
  trialsPerCondition: number;
}

export type MoleculeStatus = 'pending' | 'moving' | 'paused' | 'finished';

/** 1分子・1時刻分の表示用スナップショット */
export interface MoleculeSnapshot {
  id: number;
  status: MoleculeStatus;
  position: number; // nm (未投入時は -1)
  clusterSize: number; // 1 = 単量体
  clusterId: number | null;
  isLeader: boolean;
}

export interface TrialFrame {
  t: number; // s
  molecules: MoleculeSnapshot[];
}

export interface TrialResult {
  condition: Condition;
  trialIndex: number;
  everFormedFilament: boolean;
  maxClusterSize: number;
  endHasFilament: boolean;
  endTimeS: number;
}

export interface TrialAnimation {
  condition: Condition;
  trialIndex: number;
  moleculeCount: number;
  frames: TrialFrame[];
}

export interface MonteCarloSummary {
  condition: Condition;
  results: TrialResult[];
  formationRatePct: number;
  averageMaxClusterSize: number;
  endPersistenceRatePct: number;
}
