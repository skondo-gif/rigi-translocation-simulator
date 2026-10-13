# RIG-I translocation simulator

A one-dimensional simulation of RIG-I molecules translocating along dsRNA, pausing, and forming
multi-molecule complexes, built to examine how pausing relates to filament formation
(WT vs. Δ2CARD RIG-I). The simulator runs in the browser (React + TypeScript + Vite); the user
interface is in Japanese.

- Archived release DOI: _to be added after archiving_
- Paper: _to be added_

## Model

| Item | Value |
|---|---|
| dsRNA | straight line, 106 nm |
| RIG-I | circle, 7.04022 nm in diameter |
| Time step | 0.1 s |
| Maximum duration | 400 s per run (a run ends earlier once every molecule has left the dsRNA) |
| Molecules per run | up to 20 |
| Introduction | sequential at the 5′ end; the gap to the previous molecule is drawn uniformly from 20–50 s |
| Velocity | constant mean velocity per construct: WT 0.39 nm/s, Δ2CARD 0.81 nm/s (default; the app can optionally resample the measured velocities at every step instead) |
| Pause duration, pause frequency | each drawn once per molecule at its introduction, by resampling (with replacement) the measured values in `public/data/` |

Rules:

- Molecules move unidirectionally from the 5′ end toward the other end. A molecule that reaches the
  far end (106 nm) is treated as dissociated and no longer blocks the molecules behind it.
- A molecule cannot overtake the molecule ahead: its step is limited so that the centre-to-centre
  distance stays at least one particle diameter. The limit is recomputed at every step, so a trailing
  molecule advances again as soon as the molecule ahead moves away.
- Two molecules whose centre-to-centre distance is ≤ one particle diameter are bound. A group of
  bound molecules is a complex; an unbound molecule is a complex of size 1. Complexes are recomputed
  from positions at every step; there is no persistent bound state, bond lifetime, or binding
  probability.
- A pause frequency of *f* events/100 s of moving time is converted to a moving time of 100/*f* s
  before each pause (no pause if *f* = 0).
- A molecule that is due for introduction while the 5′ entrance is blocked waits just outside the
  entrance (position < 0). These waiting molecules are counted in the same contact groups.

Randomness: every trial draws from its own pseudo-random sequence (`mulberry32`, initialised by
hashing `seed:condition:trialIndex` with `xmur3`; see `src/lib/rng.ts`), so identical inputs always
give identical results.

## Statistics used for the figures

All statistics use 20 fixed random numbers (seeds 42–61), each defining one independent block.

- **Complex-size occupancy**: 15 trials per block. Complex sizes (1, 2, 3, 4, ≥5) of all molecules
  on the dsRNA are tallied at every 10-s mark of each trial, excluding molecules not yet introduced
  or already dissociated; the result is the share of each size among all tallied records of the block.
  Implementation note: the tally uses every 0.1-s frame whose time rounds to a multiple of 10 s
  (`Math.round(t) % 10 === 0` in `src/lib/experiments.ts`), i.e. about 10 consecutive frames around
  each 10-s mark.
- **Complex-size reach rate**: 200 trials per block. For each trial the largest complex size reached
  is compared with the thresholds 2, 3, 4 and 5; the reach rate is the percentage of the block's 200
  trials that met each threshold.
- **Paired design**: within a block, WT and each knockout condition use the same trial numbers and
  therefore the same random draws; they differ only in which measured distribution is applied
  (`buildDistributionFor` in `src/lib/experiments.ts`).

## Running

Requires Node.js 18 or later (developed with Node 24 / npm 11).

```bash
npm ci
npm run dev        # open the printed URL (default http://localhost:5173)
npm run typecheck
npm run build      # output in dist/
```

The figures are regenerated in the app with the **図の生成 (Figure generator)** panel. The four
snapshot panels (WT, ΔCARD, WT without pausing, WT with ΔCARD velocity) are regenerated with

```bash
npm run snapshots  # writes snapshots/*.svg and snapshots/snapshots_meta.json
```

## Data (`public/data/`)

Measured by HS-AFM. Each CSV has a `Group` column (WT / ΔCARD). Files without a suffix are the ones
used by the simulator and are identical to the `_ge3s` files (segments of at least 3 s).

| File | Quantity | n (WT / ΔCARD) |
|---|---|---|
| `01_Moving_segment_velocity_WT_dCARD.csv` | moving velocity (nm/s) | 60 / 19 |
| `02_Pause_segment_duration_WT_dCARD.csv` | pause duration (s) | 27 / 4 |
| `03_Pause_frequency_WT_dCARD.csv` | pause frequency (events / 100 s of moving time) | 16 / 10 |

The remaining files (`_nocutoff_backup`, `_ge1.3s`, `_ge2s`, `_ge3s`) are the same measurements with
other cutoffs, kept for sensitivity analyses; they can be loaded from the app's data panel.

## Layout

```
src/lib/        simulation engine (simulation.ts), constants, RNG, CSV parsing, experiments, statistics
src/components/ user interface and figure generation
public/data/    measured distributions (CSV)
scripts/        make_snapshots.ts (snapshot figures)
```

## License and citation

_To be added._
