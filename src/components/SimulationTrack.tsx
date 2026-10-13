import { useMemo } from 'react';
import type { MoleculeSnapshot, TrialAnimation } from '../types';
import { DT_S, PARTICLE_DIAMETER_NM, RNA_LENGTH_NM } from '../lib/constants';

const TRACK_X0 = 118;
const SCALE = 8; // px / nm
const TRACK_WIDTH = RNA_LENGTH_NM * SCALE;
const TRACK_Y = 84;
const RADIUS = (PARTICLE_DIAMETER_NM * SCALE) / 2;
const SVG_W = TRACK_X0 + TRACK_WIDTH + 46;
const SVG_H = 176;
const QUEUE_X = 62;
const QUEUE_DOT_R = 9;
const QUEUE_MAX_SHOWN = 8;

interface Props {
  label: string;
  accentVar: string;
  trial: TrialAnimation | null;
  time: number;
}

interface Positioned extends MoleculeSnapshot {
  interpPosition: number;
}

function interpolate(trial: TrialAnimation, time: number): Positioned[] {
  const frames = trial.frames;
  if (frames.length === 0) return [];
  // frames は DT_S 秒おきに記録されている(frames[i].t ≈ i * DT_S)ため、
  // 実時間(秒)のtimeをフレーム添字に変換するにはDT_Sで割る必要がある。
  const framePos = time / DT_S;
  const idx = Math.min(frames.length - 1, Math.max(0, Math.floor(framePos)));
  const frameA = frames[idx];
  const frameB = frames[Math.min(idx + 1, frames.length - 1)];
  const frac = Math.min(1, Math.max(0, framePos - idx));
  return frameA.molecules.map((snapA, i) => {
    const snapB = frameB.molecules[i];
    const interp =
      snapA.position < 0 || snapB.position < 0
        ? snapA.position
        : snapA.position + (snapB.position - snapA.position) * frac;
    return { ...snapA, interpPosition: interp };
  });
}

function xForPos(posNm: number): number {
  return TRACK_X0 + posNm * SCALE;
}

function monomerColor(m: Positioned): string {
  if (m.status === 'finished') return 'var(--c-finished)';
  if (m.clusterSize > 1) return 'var(--c-bound)';
  if (m.status === 'paused') return 'var(--c-paused)';
  if (m.status === 'moving') return 'var(--c-moving)';
  return 'var(--c-pending)';
}

export default function SimulationTrack({ label, accentVar, trial, time }: Props) {
  const positioned = useMemo(() => (trial ? interpolate(trial, time) : []), [trial, time]);

  // 投入前(まだ投入予定時刻が来ていない)
  const notYetDue = positioned.filter((m) => m.status === 'pending');
  // 投入済みだが5'側入口(position 0)がふさがっていて、入口の外(位置<0)で並んでいる分子
  const queued = positioned
    .filter((m) => m.status !== 'pending' && m.interpPosition < 0)
    .sort((a, b) => b.interpPosition - a.interpPosition); // 入口に近い順
  const active = positioned.filter((m) => m.status !== 'pending' && m.interpPosition >= 0);

  const clusterGroups = new Map<number, Positioned[]>();
  const singles: Positioned[] = [];
  for (const m of active) {
    if (m.clusterId !== null && m.clusterSize > 1) {
      const list = clusterGroups.get(m.clusterId) ?? [];
      list.push(m);
      clusterGroups.set(m.clusterId, list);
    } else {
      singles.push(m);
    }
  }

  return (
    <div className="track-panel" style={{ borderTopColor: `var(${accentVar})` }}>
      <div className="track-panel-header">
        <span className="track-panel-title" style={{ color: `var(${accentVar})` }}>
          {label}
        </span>
        <span className="track-panel-time">t = {time.toFixed(1)} s</span>
      </div>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="track-svg" role="img" aria-label={`${label} シミュレーション`}>
        {/* 投入待ち・入口渋滞エリア */}
        <text x={QUEUE_X} y={18} className="track-label-sm" textAnchor="middle">
          投入前 / 入口待機
        </text>
        {queued.slice(0, QUEUE_MAX_SHOWN).map((m, i) => (
          <circle key={`q${m.id}`} cx={QUEUE_X} cy={34 + i * 15} r={QUEUE_DOT_R} fill={monomerColor(m)} />
        ))}
        {notYetDue.slice(0, Math.max(0, QUEUE_MAX_SHOWN - queued.length)).map((m, i) => (
          <circle
            key={`p${m.id}`}
            cx={QUEUE_X}
            cy={34 + (Math.min(queued.length, QUEUE_MAX_SHOWN) + i) * 15}
            r={5}
            fill="var(--c-pending)"
          />
        ))}
        {queued.length + notYetDue.length > QUEUE_MAX_SHOWN && (
          <text x={QUEUE_X} y={34 + QUEUE_MAX_SHOWN * 15 + 4} className="track-label-sm" textAnchor="middle">
            +{queued.length + notYetDue.length - QUEUE_MAX_SHOWN}
          </text>
        )}
        {queued.length + notYetDue.length > 0 && (
          <text x={QUEUE_X} y={SVG_H - 8} className="track-label-sm" textAnchor="middle">
            計 {queued.length + notYetDue.length}
          </text>
        )}

        {/* RNAトラック */}
        <line
          x1={TRACK_X0}
          y1={TRACK_Y}
          x2={TRACK_X0 + TRACK_WIDTH}
          y2={TRACK_Y}
          stroke="var(--c-track)"
          strokeWidth={4}
          strokeLinecap="round"
        />
        <text x={TRACK_X0 - 8} y={TRACK_Y + 4} className="track-label-sm" textAnchor="end">
          5′ppp
        </text>
        <text x={TRACK_X0 + TRACK_WIDTH + 8} y={TRACK_Y + 4} className="track-label-sm" textAnchor="start">
          3′
        </text>

        {/* クラスター(連結体) */}
        {Array.from(clusterGroups.entries()).map(([clusterId, members]) => {
          const sorted = [...members].sort((a, b) => a.interpPosition - b.interpPosition);
          const x0 = xForPos(sorted[0].interpPosition) - RADIUS;
          const x1 = xForPos(sorted[sorted.length - 1].interpPosition) + RADIUS;
          return (
            <g key={clusterId}>
              <rect
                x={x0}
                y={TRACK_Y - RADIUS}
                width={x1 - x0}
                height={RADIUS * 2}
                rx={RADIUS}
                fill="var(--c-bound)"
                stroke="var(--c-bound-border)"
                strokeWidth={1.5}
              />
              {sorted.map((m, i) =>
                i === 0 ? null : (
                  <line
                    key={m.id}
                    x1={xForPos(m.interpPosition) - RADIUS}
                    x2={xForPos(m.interpPosition) - RADIUS}
                    y1={TRACK_Y - RADIUS + 4}
                    y2={TRACK_Y + RADIUS - 4}
                    stroke="var(--c-bound-border)"
                    strokeWidth={1}
                    opacity={0.6}
                  />
                ),
              )}
            </g>
          );
        })}

        {/* 単量体 */}
        {singles.map((m) => (
          <circle
            key={m.id}
            cx={xForPos(m.interpPosition)}
            cy={TRACK_Y}
            r={RADIUS}
            fill={monomerColor(m)}
            stroke="rgba(0,0,0,0.15)"
            strokeWidth={1}
          />
        ))}
      </svg>
    </div>
  );
}
