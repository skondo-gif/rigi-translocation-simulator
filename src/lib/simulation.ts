// RIG-I トランスロケーション・シミュレーション エンジン(簡略版)
//
// RNAを1次元トラックとして扱い、RIG-I粒子(直径7.04022nm)が5'側から投入され、
// 移動・停止を繰り返しながら衝突・結合・マルチマー化する様子を1秒刻みでシミュレートする。
//
// 自由パラメータ(結合確率・結合寿命など)は一切使わない:
//
//   ・衝突(中心間距離7.04022nm以下)したら必ず結合する(確率的な結合判定はしない)。
//   ・「結合」「解離」という持続的な状態は一切管理しない。各分子はつねに自分自身の
//     投入タイミング・速度・停止スケジュールに従って独立に動こうとするだけであり、唯一の
//     制約は「自分より3'側(前)の分子を追い越せない」という瞬間瞬間の位置制約である。
//     見かけ上の「マルチマー」は、この制約下での現在の位置関係(隣接分子間の中心間距離が
//     粒子直径以下)から毎ステップその場で再計算する、純粋に幾何学的な概念にすぎない。
//     したがって、前の分子が動き出して隙間が空けば、後ろの分子は(自分が停止中でない限り)
//     追加のロジックなしで自動的に、また離れて動ける——「一度結合したら、自分の停止が
//     終わるまで一生離れられない」という持続的な結合状態は存在しない。
//   ・5'側入口が塞がっていて投入できない分子は、入口の外(座標0未満)に列を作って待機する。
//     この「詰まって並ぶ」こと自体もマルチマー化の一形態として扱う。
//   ・各分子の移動速度の与え方は2方式から選べる(VelocityMode、既定は'distribution'):
//       'distribution' — 条件(WT/ΔCARD)ごとの実測分布から「1秒(計算時間刻み)ごとに」
//         復元抽出する瞬間的なゆらぎとして扱う(分子固有の恒久的な「速さ」という形質にはしない)。
//       'fixedMean' — 平均速度(WT 0.39 nm/s・ΔCARD 0.81 nm/s、constants.ts参照)を
//         その条件の全分子・全時刻で同じ一定速度として使う。実測分布からの毎ステップ抽選はしない。
//     停止時間・停止頻度は、モードによらず、分子が投入された瞬間に実測分布から1回だけ復元抽出し、
//     その分子がトラック上に存在する間はずっと同じ値を使う(毎回の停止のたびに引き直すのではなく、
//     分子ごとに固定)。
//
// 速度を「分子ごとに固定した1つの値」として扱うと(投入時や停止明けに1回だけ抽選する、あるいは
// 'fixedMean'のように条件で1つに固定するなど)、たまたま恒久的に速い分子が遅い分子の後ろに来た
// ときに、追い越せないまま一生離れられない(=停止と無関係に、速度の個体差だけで恒久的な結合が
// 生まれる)という交絡が生じ得る。既定の'distribution'モード(「1秒ごとに引き直す瞬間的なゆらぎ」)
// はこの交絡を解消する——ある瞬間に速い/遅いという関係が固定されないため、速度の違いだけで生じる
// 結合は一時的なものにとどまり、継続的な結合(マルチマー化)を安定して生み出せるのは、実際に一定
// 時間(数秒〜十数秒)動きを止める「停止」だけになる。この設計のもとで、WT/ΔCARDの移動速度・
// 停止時間・停止頻度という実測分布をそのまま使うと、WTだけがフィラメント(5量体以上)を
// 安定して形成し、ΔCARDはほとんど形成しない、という差が再現される。
//
// 'fixedMean'モードは「速度のゆらぎを排除したら結果はどう変わるか」を確認するための比較用
// モードである。regular(規則的)投入との組み合わせでは大きな破綻は見られないが、random(完全
// ランダム)投入と組み合わせると、同一条件内の相対速度が常にゼロになるため分子同士が停止でしか
// 離れられなくなり、形成率が極端に(ほぼ100%に)跳ね上がるなど、WT/ΔCARDの対比が崩れる異常な
// 挙動が確認されている。組み合わせて使う際はこの点に注意すること。
//
// 確率的な要素は3つ:「分子ごとの停止時間・停止頻度(実測分布からの復元抽出、分子につき1回)」
// 「移動速度('distribution'モードの場合のみ、実測分布からの復元抽出、1秒ごと)」「投入タイミング
// のゆらぎ」。結合・解離のルール自体には自由パラメータは一切ない。

import {
  DT_S,
  EXIT_CLEAR_NM,
  INJECTION_JITTER_S,
  MAX_HORIZON_S,
  MIN_EXIT_SPEED_NM_S,
  PARTICLE_DIAMETER_NM,
  REFERENCE_VELOCITY_DCARD_NM_S,
  REFERENCE_VELOCITY_WT_NM_S,
  RNA_LENGTH_NM,
} from './constants';
import { createTrialRng, type Rng } from './rng';
import { mean } from './stats';
import type {
  Condition,
  Distributions,
  MoleculeSnapshot,
  MoleculeStatus,
  SimulationParams,
  TrialAnimation,
  TrialFrame,
  TrialResult,
} from '../types';

const EPS = 1e-6;

interface MoleculeState {
  id: number;
  injectedAt: number;
  position: number; // nm, -1 = 未投入
  status: MoleculeStatus;
  velocity: number;
  moveElapsed: number;
  moveDurationUntilPause: number;
  pauseRemaining: number;
  pauseDurationOwn: number; // 分子固有の停止時間(投入時に実測分布から1回抽選)
  moveDurationUntilPauseOwn: number; // 分子固有の停止頻度由来の移動時間(投入時に1回抽選)
  finished: boolean;
}

/** 実測分布(values)から一様乱数で1つ復元抽出する。停止時間・停止頻度(分子ごとに1回)と
 *  速度(1秒ごと)の抽選に使う。 */
function sampleFrom(values: readonly number[], rng: Rng): number {
  if (values.length === 0) return 0;
  const idx = Math.min(values.length - 1, Math.floor(rng() * values.length));
  return values[idx];
}

/** velocityMode='fixedMean'で使う一定速度を選ぶ。速度分布(velocityValues)がWT・ΔCARDの
 *  どちらの実測データかをTrialSimulatorは意識しない設計(速度ノックアウトなどで、他条件の
 *  速度分布がそのまま渡されてくることがあるため)なので、読み込んだ分布の平均値がどちらの
 *  平均速度(REFERENCE_VELOCITY_*_NM_S)に近いかで判定する。 */
function pickReferenceVelocity(velocityValues: readonly number[]): number {
  const m = mean(velocityValues);
  const distToWT = Math.abs(m - REFERENCE_VELOCITY_WT_NM_S);
  const distToDCARD = Math.abs(m - REFERENCE_VELOCITY_DCARD_NM_S);
  return distToWT <= distToDCARD ? REFERENCE_VELOCITY_WT_NM_S : REFERENCE_VELOCITY_DCARD_NM_S;
}

interface ContactGroup {
  memberIds: number[]; // 昇順(5'->3')。末尾が先頭(3'側最先端)分子。毎ステップ位置から再計算する。
}

class TrialSimulator {
  private molecules: MoleculeState[] = [];
  private params: SimulationParams;
  private simTime = 0;
  private maxClusterSize = 1;
  private everFormedFilament = false;
  private pauseDurationDist: readonly number[];
  private pauseFrequencyDist: readonly number[];
  private velocityDist: readonly number[];
  /** velocityMode='fixedMean'のときだけ使う、条件ごとに1つの一定速度(平均速度)。 */
  private fixedVelocity: number;
  private rng: Rng;

  constructor(params: SimulationParams, dist: Distributions, rng: Rng) {
    this.params = params;
    this.pauseDurationDist = dist.pauseDuration;
    this.pauseFrequencyDist = dist.pauseFrequency;
    this.velocityDist = dist.velocity;
    this.fixedVelocity = pickReferenceVelocity(dist.velocity);
    this.rng = rng;
    // 投入タイミングは2方式から選べる:
    //   'regular'(既定): injectionIntervalS 秒ごとの等間隔クロックを基本とし、実際の分子到着に
    //     完全な規則性はないと考えられるため、±INJECTION_JITTER_S 秒の一様乱数だけを加える。
    //     ポアソン過程化(到着間隔そのものを指数分布にする)も試したが、ランダムな到着の偏りにより
    //     偶発的な大クラスターが生じやすくなり、WT/ΔCARDの形成率コントラストが大きく弱まったため
    //     不採用とした。
    //   'random': 分子数を固定した上で、1個前の分子からの投入間隔を毎回
    //     [randomInjectionMinS, randomInjectionMaxS) s の範囲(UIから調整可能)から独立に一様乱数で
    //     抽選し、累積していく方式(投入間隔(injectionIntervalS)は使われない)。各分子の絶対投入
    //     時刻を範囲内から独立に抽選する方式も試したが、その場合は分子間の間隔が一切保証されない
    //     ため、偶然複数の分子がほぼ同時刻に投入予定になり、5'側入口で人工的な渋滞(条件によらず
    //     物理的密集だけでフィラメントが形成される現象)が起きることを確認した。間隔そのものを
    //     下限以上に保つことで、この渋滞を避けつつタイミングの不規則性を表現する。
    const randomGapMin = Math.min(params.randomInjectionMinS, params.randomInjectionMaxS);
    const randomGapMax = Math.max(params.randomInjectionMinS, params.randomInjectionMaxS);
    let nextInjectionAt = 0;
    for (let i = 0; i < params.moleculeCount; i++) {
      let injectedAt: number;
      if (params.injectionMode === 'random') {
        nextInjectionAt += randomGapMin + rng() * (randomGapMax - randomGapMin);
        injectedAt = nextInjectionAt;
      } else {
        injectedAt = Math.max(0, i * params.injectionIntervalS + (rng() * 2 - 1) * INJECTION_JITTER_S);
      }
      this.molecules.push({
        id: i,
        injectedAt,
        position: -1,
        status: 'pending',
        velocity: 0,
        moveElapsed: 0,
        moveDurationUntilPause: Number.POSITIVE_INFINITY,
        pauseRemaining: 0,
        pauseDurationOwn: 0,
        moveDurationUntilPauseOwn: Number.POSITIVE_INFINITY,
        finished: false,
      });
    }
  }

  private isActive(m: MoleculeState): boolean {
    return !m.finished && m.status !== 'pending';
  }

  private minActivePosition(): number {
    let min = Number.POSITIVE_INFINITY;
    for (const m of this.molecules) {
      if (this.isActive(m) && m.position < min) min = m.position;
    }
    return min;
  }

  /** 投入予定時刻になった分子は必ずその時刻に投入する。5'側入口(position 0)が塞がっている
   *  場合は、塞いでいる分子・クラスターのすぐ後ろ(0未満の座標)に並んで入口の外で待機する。
   *  投入待ちの分子同士が詰まって並ぶこと自体も、集合(オリゴマー化)の一形態として扱う。 */
  private handleInjection(): void {
    for (const m of this.molecules) {
      if (m.status !== 'pending' || m.injectedAt > this.simTime) continue;
      const minPos = this.minActivePosition();
      m.position = Number.isFinite(minPos) ? Math.min(0, minPos - PARTICLE_DIAMETER_NM) : 0;
      // この分子固有の停止時間・停止頻度を実測分布から1回だけ抽選する(以後トラック上に
      // いる間はずっとこの値を使い、毎回の停止のたびには引き直さない)。速度は別方式(下記)。
      m.pauseDurationOwn = sampleFrom(this.pauseDurationDist, this.rng);
      const ownFreq = sampleFrom(this.pauseFrequencyDist, this.rng);
      m.moveDurationUntilPauseOwn = ownFreq > 0 ? 100 / ownFreq : Number.POSITIVE_INFINITY;
      this.startMovingSegment(m);
    }
  }

  /** 動き出す(投入時、または停止明け)瞬間の状態遷移。停止時間・停止頻度は分子固有の値
   *  (handleInjectionで抽選済み)を使う。速度はここでは決めない——速度は「動いている間、
   *  1秒ごとに実測分布から引き直す」瞬間的なゆらぎとして扱うため、resolveMovementの中で
   *  都度サンプリングする(molに恒久的な速度という「形質」を持たせない。理由は本ファイル
   *  冒頭のコメントを参照)。 */
  private startMovingSegment(mol: MoleculeState): void {
    mol.status = 'moving';
    mol.moveDurationUntilPause = mol.moveDurationUntilPauseOwn;
    mol.moveElapsed = 0;
  }

  /** 各分子は自分の速度・停止スケジュールで独立に動こうとするが、自分より3'側(前)の分子を
   *  追い越すことはできない(中心間距離が粒子直径未満にならない)。この瞬間瞬間の位置制約だけで
   *  移動を解決する——「クラスターに属している」という持続的な状態は使わない。RNA末端
   *  (position >= RNA_LENGTH_NM)に到達した分子はその場で終端状態にし、以後は後続分子の
   *  障害物にならない(画面外へ抜けていく)。
   *  移動中の速度はvelocityModeにより2通り: 既定('distribution')は分子固有の恒久的な形質に
   *  するのではなく1ステップ(DT_S秒)ごとに実測分布から引き直す瞬間的なゆらぎとして扱う。
   *  'fixedMean'は条件ごとの平均速度(WT/ΔCARD)を全分子・全時刻で一定速度として使う
   *  (理由・比較はファイル冒頭のコメントを参照)。 */
  private resolveMovement(): void {
    const active = this.molecules.filter((m) => this.isActive(m));
    active.sort((a, b) => b.position - a.position); // 3'側(前)から順に処理

    let frontLimit = RNA_LENGTH_NM;
    for (const m of active) {
      if (m.status === 'moving') {
        m.velocity =
          this.params.velocityMode === 'fixedMean'
            ? this.fixedVelocity
            : Math.max(0, sampleFrom(this.velocityDist, this.rng));
      }
      const proposed = m.status === 'moving' ? m.velocity * DT_S : 0;
      const actualDisp = Math.max(0, Math.min(proposed, frontLimit - m.position));
      if (actualDisp > 0) m.position += actualDisp;

      if (m.position >= RNA_LENGTH_NM - EPS) {
        m.finished = true;
        m.status = 'finished';
        m.position = RNA_LENGTH_NM;
        frontLimit = RNA_LENGTH_NM; // 終端で抜けた分子はもう障害物ではない
      } else {
        frontLimit = m.position - PARTICLE_DIAMETER_NM;
      }
    }
  }

  /** 現在の位置関係だけから接触グループ(隣接する分子同士の中心間距離が粒子直径以下)を
   *  その場で求める。持続的な「結合状態」は一切参照しない——毎ステップ、位置だけから
   *  再計算する純粋に幾何学的な概念。 */
  private computeContactGroups(): ContactGroup[] {
    const active = this.molecules.filter((m) => this.isActive(m));
    active.sort((a, b) => a.position - b.position);

    const groups: ContactGroup[] = [];
    let current: number[] = [];
    let prevPos: number | null = null;
    for (const m of active) {
      if (current.length > 0 && prevPos !== null && m.position - prevPos <= PARTICLE_DIAMETER_NM + EPS) {
        current.push(m.id);
      } else {
        if (current.length > 0) groups.push({ memberIds: current });
        current = [m.id];
      }
      prevPos = m.position;
    }
    if (current.length > 0) groups.push({ memberIds: current });
    return groups;
  }

  private updateClusterStats(groups: ContactGroup[]): void {
    for (const g of groups) {
      if (g.memberIds.length > this.maxClusterSize) this.maxClusterSize = g.memberIds.length;
      if (g.memberIds.length >= this.params.filamentThreshold) this.everFormedFilament = true;
    }
  }

  /** 各分子は自分の停止スケジュールに従って独立に停止・再開するだけ。「解離」という
   *  独立したイベントはない——停止が終われば動き出し、その結果として(まだ前の分子に
   *  塞がれていなければ)自然に前へ進める、というだけである。 */
  private advanceClocks(): void {
    for (const m of this.molecules) {
      if (!this.isActive(m)) continue;
      if (m.status === 'moving') {
        m.moveElapsed += DT_S;
        if (m.moveElapsed >= m.moveDurationUntilPause) {
          m.status = 'paused';
          m.pauseRemaining = Math.max(DT_S, m.pauseDurationOwn);
        }
      } else if (m.status === 'paused') {
        m.pauseRemaining -= DT_S;
        if (m.pauseRemaining <= 0) {
          this.startMovingSegment(m);
        }
      }
    }
  }

  /** RNA末端に到達した分子を、最後の速度でそのまま画面外へ抜けさせる(表示上の演出)。 */
  private advanceExiting(): void {
    for (const m of this.molecules) {
      if (!m.finished) continue;
      if (m.position >= RNA_LENGTH_NM + EXIT_CLEAR_NM) continue;
      m.position += Math.max(m.velocity, MIN_EXIT_SPEED_NM_S) * DT_S;
    }
  }

  /** 全分子が終端に到達し、かつ画面外まで抜けきったか */
  private allExited(): boolean {
    return this.molecules.every((m) => m.finished && m.position >= RNA_LENGTH_NM + EXIT_CLEAR_NM);
  }

  private snapshot(groups: ContactGroup[]): TrialFrame {
    const groupOf = new Map<number, { groupId: number; size: number; leaderId: number }>();
    groups.forEach((g, idx) => {
      const leaderId = g.memberIds[g.memberIds.length - 1]; // 昇順末尾 = 3'側最先端
      for (const id of g.memberIds) {
        groupOf.set(id, { groupId: idx + 1, size: g.memberIds.length, leaderId });
      }
    });
    const molecules: MoleculeSnapshot[] = this.molecules.map((m) => {
      const info = groupOf.get(m.id);
      const clusterSize = info ? info.size : 1;
      const isLeader = info ? info.leaderId === m.id : true;
      return {
        id: m.id,
        status: m.status,
        position: m.position,
        clusterSize,
        clusterId: info && info.size > 1 ? info.groupId : null,
        isLeader,
      };
    });
    return { t: this.simTime, molecules };
  }

  run(recordFrames: boolean): { result: TrialResult; frames: TrialFrame[] } {
    const frames: TrialFrame[] = [];
    let lastGroups: ContactGroup[] = [];
    // EPS: simTime accumulates 0.1 s steps in floating point, so without the tolerance the
    // frame at exactly MAX_HORIZON_S is dropped (the last frame would be 399.9 s).
    while (this.simTime <= MAX_HORIZON_S + EPS && !this.allExited()) {
      this.handleInjection();
      this.resolveMovement();
      lastGroups = this.computeContactGroups();
      this.updateClusterStats(lastGroups);
      this.advanceClocks();
      this.advanceExiting();
      if (recordFrames) frames.push(this.snapshot(lastGroups));
      this.simTime += DT_S;
    }

    let endHasFilament = false;
    for (const g of lastGroups) {
      if (g.memberIds.length >= this.params.filamentThreshold) {
        endHasFilament = true;
        break;
      }
    }

    return {
      result: {
        condition: 'WT', // 呼び出し側で上書き
        trialIndex: -1,
        everFormedFilament: this.everFormedFilament,
        maxClusterSize: this.maxClusterSize,
        endHasFilament,
        endTimeS: this.simTime,
      },
      frames,
    };
  }
}

/**
 * 1試行を実行する。確率的な要素は「分子投入タイミングのゆらぎ(±INJECTION_JITTER_S秒、
 * constants.ts参照)」「分子ごとの停止時間・停止頻度(実測分布からの復元抽出、投入時に1回)」
 * 「移動速度(実測分布からの復元抽出、1秒ごと)」の3つ。結合・解離のルール自体には自由
 * パラメータは一切ない。マスターシード + 条件 + trialIndex から試行ごとに独立なRNGを
 * 導出するため、同じ入力であれば何度実行しても同一の結果が得られる。
 */
export function runTrial(
  condition: Condition,
  trialIndex: number,
  params: SimulationParams,
  dist: Distributions,
  recordFrames: boolean,
): { result: TrialResult; frames: TrialFrame[] } {
  const rng = createTrialRng(params.seed, `${condition}:${trialIndex}`);
  const sim = new TrialSimulator(params, dist, rng);
  const { result, frames } = sim.run(recordFrames);
  result.condition = condition;
  result.trialIndex = trialIndex;
  return { result, frames };
}

export function runTrialAnimation(
  condition: Condition,
  trialIndex: number,
  params: SimulationParams,
  dist: Distributions,
): TrialAnimation {
  const { frames } = runTrial(condition, trialIndex, params, dist, true);
  return { condition, trialIndex, moleculeCount: params.moleculeCount, frames };
}

/**
 * 代表試行として表示するのに適した試行番号を探す(先頭から順にpredicateを満たす最初の試行)。
 * 「代表試行」が母集団の典型的な傾向とかけ離れた外れ値にならないようにするための処理であり、
 * 統計値(全試行結果パネルの形成率・残存率)自体は変えない。見つからない場合は0を返す。
 */
export function findRepresentativeTrialIndex(
  condition: Condition,
  params: SimulationParams,
  dist: Distributions,
  predicate: (r: TrialResult) => boolean,
  scanLimit = 40,
): number {
  for (let i = 0; i < scanLimit; i++) {
    const { result } = runTrial(condition, i, params, dist, false);
    if (predicate(result)) return i;
  }
  return 0;
}
