// 単一行の複数条件比較(棒+ジッタードット+エラーバー)+ 指定したペア間の有意差ブラケット。
// Figure S1のパネルe(決定的な比較)で使う。
import { useMemo } from 'react';
import { mean, sem, welchTTest, significanceStars } from '../../lib/stats';

export interface BarSpec {
  label: string; // 複数行可(\nで改行)
  color: string;
  fill: string;
  values: number[]; // シードごとの値
}

export interface BracketSpec {
  fromIndex: number;
  toIndex: number;
  level: number; // 0が一番低い位置、大きいほど上に積む
}

interface Props {
  bars: BarSpec[];
  brackets: BracketSpec[];
  yLabel: string;
  width?: number;
  height?: number;
  refLineIndex?: number; // このバーの平均値に破線を引く(任意)
}

const MARGIN = { top: 24, right: 20, bottom: 56, left: 60 };

export default function MultiBarChart({ bars, brackets, yLabel, width = 640, height = 360, refLineIndex }: Props) {
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const n = bars.length;
  const slotW = plotW / Math.max(1, n);
  const barWidth = slotW * 0.56;

  const maxLevel = brackets.reduce((m, b) => Math.max(m, b.level), -1);
  const nLevels = maxLevel + 1;

  const { yMax, dataMax } = useMemo(() => {
    let max = 0;
    for (const b of bars) {
      const m = mean(b.values);
      const s = sem(b.values);
      max = Math.max(max, m + s);
      for (const v of b.values) max = Math.max(max, v);
    }
    const headroomFactor = nLevels > 0 ? 1 + nLevels * 0.16 + 0.1 : 1.15;
    return { yMax: (max || 1) * headroomFactor, dataMax: max || 1 };
  }, [bars, nLevels]);

  const yScale = (v: number) => plotH - (v / yMax) * plotH;

  const seedJitter = (seedIndex: number, w: number) => {
    const x = Math.sin(seedIndex * 12.9898) * 43758.5453;
    return ((x - Math.floor(x)) - 0.5) * w;
  };

  const barCenterX = (i: number) => MARGIN.left + slotW * (i + 0.5);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="fig-svg" role="img">
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const v = yMax * frac;
        const y = MARGIN.top + yScale(v);
        return (
          <g key={frac}>
            <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y} y2={y} className="fig-gridline" />
            <text x={MARGIN.left - 8} y={y + 3} textAnchor="end" className="fig-axis-label">
              {Math.round(v)}
            </text>
          </g>
        );
      })}
      <text
        x={14}
        y={MARGIN.top + plotH / 2}
        textAnchor="middle"
        className="fig-axis-title"
        transform={`rotate(-90 14 ${MARGIN.top + plotH / 2})`}
      >
        {yLabel}
      </text>

      {refLineIndex !== undefined && bars[refLineIndex] && (
        <line
          x1={MARGIN.left}
          x2={MARGIN.left + plotW}
          y1={MARGIN.top + yScale(mean(bars[refLineIndex].values))}
          y2={MARGIN.top + yScale(mean(bars[refLineIndex].values))}
          stroke={bars[refLineIndex].color}
          strokeDasharray="5 4"
          strokeWidth={1}
          opacity={0.55}
        />
      )}

      {bars.map((b, i) => {
        const cx = barCenterX(i);
        const m = mean(b.values);
        const s = sem(b.values);
        return (
          <g key={i}>
            <rect
              x={cx - barWidth / 2}
              y={MARGIN.top + yScale(m)}
              width={barWidth}
              height={plotH - yScale(m)}
              fill={b.fill}
              stroke={b.color}
              strokeWidth={1.6}
            />
            <line
              x1={cx}
              x2={cx}
              y1={MARGIN.top + yScale(m - s)}
              y2={MARGIN.top + yScale(m + s)}
              stroke="#333"
              strokeWidth={1}
            />
            {b.values.map((v, si) => (
              <circle
                key={si}
                cx={cx + seedJitter(si + i * 37, barWidth * 0.65)}
                cy={MARGIN.top + yScale(v)}
                r={2.2}
                fill="#333"
                opacity={0.5}
              />
            ))}
            {b.label.split('\n').map((line, li) => (
              <text
                key={li}
                x={cx}
                y={MARGIN.top + plotH + 18 + li * 14}
                textAnchor="middle"
                className="fig-axis-label"
              >
                {line}
              </text>
            ))}
          </g>
        );
      })}

      {brackets.map((br, i) => {
        const x1 = barCenterX(br.fromIndex);
        const x2 = barCenterX(br.toIndex);
        const levelFrac = dataMax + (br.level + 0.6) * ((yMax - dataMax) / Math.max(1, nLevels + 0.3));
        const y = MARGIN.top + yScale(levelFrac);
        const h = 6;
        const a = bars[br.fromIndex].values;
        const c = bars[br.toIndex].values;
        const p = a.length > 1 && c.length > 1 ? welchTTest(a, c).p : 1;
        return (
          <g key={i}>
            <polyline
              points={`${x1},${y} ${x1},${y - h} ${x2},${y - h} ${x2},${y}`}
              fill="none"
              stroke="#222"
              strokeWidth={1}
            />
            <text x={(x1 + x2) / 2} y={y - h - 3} textAnchor="middle" className="fig-sig-star">
              {significanceStars(p)}
            </text>
          </g>
        );
      })}

      <line
        x1={MARGIN.left}
        x2={MARGIN.left + plotW}
        y1={MARGIN.top + plotH}
        y2={MARGIN.top + plotH}
        stroke="#333"
        strokeWidth={1}
      />
      <line x1={MARGIN.left} x2={MARGIN.left} y1={MARGIN.top} y2={MARGIN.top + plotH} stroke="#333" strokeWidth={1} />
    </svg>
  );
}
