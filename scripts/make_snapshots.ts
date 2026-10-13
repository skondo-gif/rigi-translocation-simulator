// Reproduces the four simulation-snapshot panels (WT, ΔCARD, WT without pausing,
// WT with ΔCARD velocity) as SVG files using the same simulation engine as the app.
// Usage: npm run snapshots   (writes ./snapshots/*.svg and ./snapshots/snapshots_meta.json)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePauseDurationCsv, parsePauseFrequencyCsv, parseVelocityCsv } from '../src/lib/csv';
import { findRepresentativeTrialIndex, runTrial } from '../src/lib/simulation';
import { buildDistributionFor, type KnockoutId } from '../src/lib/experiments';
import { PARTICLE_DIAMETER_NM, RANDOM_INJECTION_MAX_S, RANDOM_INJECTION_MIN_S, RNA_LENGTH_NM } from '../src/lib/constants';
import type { Condition, DistributionSet, MoleculeSnapshot, SimulationParams, TrialFrame } from '../src/types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'snapshots');
mkdirSync(OUT_DIR, { recursive: true });

const read = (name: string) => readFileSync(resolve(ROOT, 'public', 'data', name), 'utf-8');
const v = parseVelocityCsv(read('01_Moving_segment_velocity_WT_dCARD.csv')).values;
const pd = parsePauseDurationCsv(read('02_Pause_segment_duration_WT_dCARD.csv')).values;
const pf = parsePauseFrequencyCsv(read('03_Pause_frequency_WT_dCARD.csv')).values;

const distributions: DistributionSet = {
  WT: { velocity: v.WT, pauseDuration: pd.WT, pauseFrequency: pf.WT },
  dCARD: { velocity: v.dCARD, pauseDuration: pd.dCARD, pauseFrequency: pf.dCARD },
};

// Same defaults as the app (src/App.tsx DEFAULT_PARAMS).
const params: SimulationParams = {
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

interface PanelSpec {
  key: string;
  title: string;
  knockoutId: KnockoutId;
  conditionLabel: Condition; // used only to derive the trial's random sequence
  wantFilament: boolean; // true: frame with the largest cluster; false: typical frame of a trial that never formed a filament
}

const panels: PanelSpec[] = [
  { key: 'WTsimulation', title: 'Simulated WT', knockoutId: 'wtNative', conditionLabel: 'WT', wantFilament: true },
  { key: 'DCARDsim', title: 'Simulated ΔCARD', knockoutId: 'dcNative', conditionLabel: 'dCARD', wantFilament: false },
  { key: 'WTNopause', title: 'Simulated WT (no pausing)', knockoutId: 'noPause', conditionLabel: 'WT', wantFilament: false },
  { key: 'WTDCARDspeed', title: 'Simulated WT (ΔCARD velocity)', knockoutId: 'velocityKO', conditionLabel: 'WT', wantFilament: false },
];

function pickFilamentFrame(frames: TrialFrame[]): { frame: TrialFrame; maxSize: number } {
  let best: TrialFrame | null = null;
  let bestSize = 0;
  for (const f of frames) {
    let sz = 0;
    for (const m of f.molecules) if (m.status !== 'pending' && m.status !== 'finished') sz = Math.max(sz, m.clusterSize);
    if (sz >= bestSize) {
      bestSize = sz;
      best = f;
    }
  }
  return { frame: best ?? frames[Math.floor(frames.length / 2)], maxSize: bestSize };
}

function pickTypicalFrame(frames: TrialFrame[]): { frame: TrialFrame; maxSize: number } {
  const lo = Math.floor(frames.length * 0.35);
  const hi = Math.floor(frames.length * 0.75);
  let best: TrialFrame | null = null;
  let bestActive = -1;
  let bestSize = 0;
  for (let i = lo; i <= hi && i < frames.length; i++) {
    const f = frames[i];
    let active = 0;
    let sz = 0;
    for (const m of f.molecules) {
      if (m.status === 'pending') continue;
      active++;
      sz = Math.max(sz, m.clusterSize);
    }
    if (active > bestActive) {
      bestActive = active;
      best = f;
      bestSize = sz;
    }
  }
  return { frame: best ?? frames[Math.floor(frames.length / 2)], maxSize: bestSize };
}

// ---- SVG rendering (same geometry and colors as src/components/SimulationTrack.tsx) ----
// Molecules already injected but blocked at the 5' entrance sit at position < 0 and can belong
// to the same contact cluster as on-track molecules; the canvas widens to the left to show them.
const BASE_MARGIN = 70;
const SCALE = 8; // px per nm
const TRACK_WIDTH = RNA_LENGTH_NM * SCALE;
const TRACK_Y = 108;
const RADIUS = (PARTICLE_DIAMETER_NM * SCALE) / 2;
const RIGHT_PAD = 170;
const SVG_H = 190;

const COLOR = {
  pending: '#9ca3af',
  moving: '#2563eb',
  paused: '#f59e0b',
  bound: '#7c3aed',
  boundBorder: '#5b21b6',
  finished: '#16a34a',
  track: '#b8c0cc',
};

function monomerColor(m: MoleculeSnapshot): string {
  if (m.status === 'finished') return COLOR.finished;
  if (m.clusterSize > 1) return COLOR.bound;
  if (m.status === 'paused') return COLOR.paused;
  if (m.status === 'moving') return COLOR.moving;
  return COLOR.pending;
}

function renderSvg(title: string, frame: TrialFrame): string {
  const active = frame.molecules.filter((m) => m.status !== 'pending');
  const notYetInjected = frame.molecules.filter((m) => m.status === 'pending').length;

  const minPos = active.length > 0 ? Math.min(0, ...active.map((m) => m.position)) : 0;
  const leftExtNm = Math.max(0, -minPos) + 3;
  const trackX0 = BASE_MARGIN + leftExtNm * SCALE;
  const svgW = trackX0 + TRACK_WIDTH + RIGHT_PAD;
  const xForPos = (posNm: number) => trackX0 + posNm * SCALE;

  const clusterGroups = new Map<number, MoleculeSnapshot[]>();
  const singles: MoleculeSnapshot[] = [];
  for (const m of active) {
    if (m.clusterId !== null && m.clusterSize > 1) {
      const list = clusterGroups.get(m.clusterId) ?? [];
      list.push(m);
      clusterGroups.set(m.clusterId, list);
    } else {
      singles.push(m);
    }
  }

  const parts: string[] = [];
  parts.push(
    `<svg width="${svgW}" height="${SVG_H}" viewBox="0 0 ${svgW} ${SVG_H}" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica">`,
  );
  parts.push(`<rect x="0" y="0" width="${svgW}" height="${SVG_H}" fill="white"/>`);
  parts.push(`<text x="16" y="26" font-size="16" font-weight="bold" fill="#111827">${title}</text>`);
  parts.push(`<text x="${svgW - 16}" y="26" font-size="13" text-anchor="end" fill="#4b5563">t = ${frame.t.toFixed(0)} s</text>`);
  parts.push(
    `<line x1="${trackX0}" y1="${TRACK_Y}" x2="${trackX0 + TRACK_WIDTH}" y2="${TRACK_Y}" stroke="${COLOR.track}" stroke-width="4" stroke-linecap="round"/>`,
  );
  const labelY = TRACK_Y - RADIUS - 12;
  parts.push(`<text x="${trackX0}" y="${labelY}" font-size="13" text-anchor="start" fill="#374151">5′ppp</text>`);
  parts.push(`<text x="${trackX0 + TRACK_WIDTH}" y="${labelY}" font-size="13" text-anchor="end" fill="#374151">3′</text>`);
  if (notYetInjected > 0) {
    parts.push(
      `<text x="16" y="${SVG_H - 14}" font-size="12" text-anchor="start" fill="#6b7280">×${notYetInjected} not yet injected</text>`,
    );
  }

  for (const members of clusterGroups.values()) {
    const sorted = [...members].sort((a, b) => a.position - b.position);
    const x0 = xForPos(sorted[0].position) - RADIUS;
    const x1 = xForPos(sorted[sorted.length - 1].position) + RADIUS;
    parts.push(
      `<rect x="${x0.toFixed(1)}" y="${(TRACK_Y - RADIUS).toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(RADIUS * 2).toFixed(1)}" rx="${RADIUS.toFixed(1)}" fill="${COLOR.bound}" stroke="${COLOR.boundBorder}" stroke-width="1.5"/>`,
    );
    for (let i = 1; i < sorted.length; i++) {
      const lx = (xForPos(sorted[i].position) - RADIUS).toFixed(1);
      parts.push(
        `<line x1="${lx}" x2="${lx}" y1="${(TRACK_Y - RADIUS + 4).toFixed(1)}" y2="${(TRACK_Y + RADIUS - 4).toFixed(1)}" stroke="${COLOR.boundBorder}" stroke-width="1" opacity="0.6"/>`,
      );
    }
  }
  for (const m of singles) {
    parts.push(
      `<circle cx="${xForPos(m.position).toFixed(1)}" cy="${TRACK_Y}" r="${RADIUS.toFixed(1)}" fill="${monomerColor(m)}" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>`,
    );
  }
  parts.push('</svg>');
  return parts.join('\n');
}

const meta: Record<string, unknown> = {};
for (const panel of panels) {
  const dist = buildDistributionFor(distributions, panel.knockoutId);
  const predicate = panel.wantFilament
    ? (r: { endHasFilament: boolean }) => r.endHasFilament
    : (r: { everFormedFilament: boolean }) => !r.everFormedFilament;
  const trialIdx = findRepresentativeTrialIndex(panel.conditionLabel, params, dist, predicate as never, 80);
  const { frames, result } = runTrial(panel.conditionLabel, trialIdx, params, dist, true);
  const { frame, maxSize } = panel.wantFilament ? pickFilamentFrame(frames) : pickTypicalFrame(frames);
  writeFileSync(resolve(OUT_DIR, `${panel.key}.svg`), renderSvg(panel.title, frame), 'utf-8');
  meta[panel.key] = {
    trialIdx,
    t: Number(frame.t.toFixed(1)),
    maxClusterSizeAtFrame: maxSize,
    maxClusterSizeWholeTrial: result.maxClusterSize,
    everFormedFilament: result.everFormedFilament,
  };
  console.log(panel.key, JSON.stringify(meta[panel.key]));
}
writeFileSync(resolve(OUT_DIR, 'snapshots_meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
