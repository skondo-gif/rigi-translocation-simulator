// 2群比較の棒グラフ(x軸カテゴリごとにA/B 2本の棒 + ジッタードット + エラーバー + 有意差)。
// Figure S1のパネルa〜d、到達率図のパネルa〜cで使う汎用コンポーネント。
import { useMemo } from 'react';
import { mean, sem, welchTTest, significanceStars } from '../../lib/stats';

export interface PairedSeries {
  label: string;
  color: string; // 枠線・点
  fill: string; // 塗り("none"で白抜き)
  /** カテゴリごとのシード値配列: valuesByCategory[categoryIndex] = number[] */
  valuesByCategory: number[][];
}

interface Props {
  categories: string[];
  seriesA: PairedSeries;
  seriesB: PairedSeries;
  yLabel: string;
  /** X軸の意味を示すタイトル(省略可)。例:「フィラメント判定閾値(複合体サイズ以上)」。 */
  xLabel?: string;
  width?: number;
  height?: number;
  /** 指定すると、このY軸上限に固定する(データからの自動スケーリングをしない)。
   *  パネルをまたいでバーの見た目を正しく比較できるようにするため——省略時はこれまで通り
   *  そのパネル内のデータの最大値から自動計算する。 */
  yMax?: number;
}

const MARGIN = { top: 34, right: 16, bottom: 58, left: 56 };

export default function PairedBarChart({
  categories,
  seriesA,
  seriesB,
  yLabel,
  xLabel,
  width = 420,
  height = 300,
  yMax: fixedYMax,
}: Props) {
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;

  const { yMax, groupWidth, barWidth } = useMemo(() => {
    const gw = plotW / Math.max(1, categories.length);
    if (fixedYMax !== undefined) {
      return { yMax: fixedYMax, groupWidth: gw, barWidth: gw * 0.34 };
    }
    let max = 0;
    for (let i = 0; i < categories.length; i++) {
      const ma = mean(seriesA.valuesByCategory[i] ?? []);
      const sa = sem(seriesA.valuesByCategory[i] ?? []);
      const mb = mean(seriesB.valuesByCategory[i] ?? []);
      const sb = sem(seriesB.valuesByCategory[i] ?? []);
      max = Math.max(max, ma + sa, mb + sb);
      const allA = seriesA.valuesByCategory[i] ?? [];
      const allB = seriesB.valuesByCategory[i] ?? [];
      for (const v of allA) max = Math.max(max, v);
      for (const v of allB) max = Math.max(max, v);
    }
    return { yMax: max * 1.35 || 1, groupWidth: gw, barWidth: gw * 0.34 };
  }, [categories.length, seriesA, seriesB, plotW, fixedYMax]);

  const yScale = (v: number) => plotH - (v / yMax) * plotH;

  const seedJitter = (n: number, seedIndex: number, width: number) => {
    // 決定論的な疑似乱数(seedIndexベース)でジッタさせる——描画のたびに位置が変わらないように
    const x = Math.sin(seedIndex * 12.9898 + n * 78.233) * 43758.5453;
    return ((x - Math.floor(x)) - 0.5) * width;
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="fig-svg" role="img">
      {/* y軸グリッド線・ラベル */}
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
      {/* y軸タイトル */}
      <text
        x={14}
        y={MARGIN.top + plotH / 2}
        textAnchor="middle"
        className="fig-axis-title"
        transform={`rotate(-90 14 ${MARGIN.top + plotH / 2})`}
      >
        {yLabel}
      </text>

      {categories.map((cat, i) => {
        const cx = MARGIN.left + groupWidth * (i + 0.5);
        const aValues = seriesA.valuesByCategory[i] ?? [];
        const bValues = seriesB.valuesByCategory[i] ?? [];
        const ma = mean(aValues);
        const mb = mean(bValues);
        const sa = sem(aValues);
        const sb = sem(bValues);
        const ax = cx - barWidth * 0.6;
        const bx = cx + barWidth * 0.6;
        const p = aValues.length > 1 && bValues.length > 1 ? welchTTest(aValues, bValues).p : 1;
        const starY = MARGIN.top + yScale(Math.max(ma + sa, mb + sb)) - 8;

        return (
          <g key={cat}>
            {/* A bar */}
            <rect
              x={ax - barWidth / 2}
              y={MARGIN.top + yScale(ma)}
              width={barWidth}
              height={plotH - yScale(ma)}
              fill={seriesA.fill}
              stroke={seriesA.color}
              strokeWidth={1.4}
            />
            <line
              x1={ax}
              x2={ax}
              y1={MARGIN.top + yScale(ma - sa)}
              y2={MARGIN.top + yScale(ma + sa)}
              stroke="#333"
              strokeWidth={1}
            />
            {aValues.map((v, si) => (
              <circle
                key={si}
                cx={ax + seedJitter(si, i, barWidth * 0.7)}
                cy={MARGIN.top + yScale(v)}
                r={2}
                fill="#555"
                opacity={0.55}
              />
            ))}

            {/* B bar */}
            <rect
              x={bx - barWidth / 2}
              y={MARGIN.top + yScale(mb)}
              width={barWidth}
              height={plotH - yScale(mb)}
              fill={seriesB.fill}
              stroke={seriesB.color}
              strokeWidth={1.4}
            />
            <line
              x1={bx}
              x2={bx}
              y1={MARGIN.top + yScale(mb - sb)}
              y2={MARGIN.top + yScale(mb + sb)}
              stroke="#333"
              strokeWidth={1}
            />
            {bValues.map((v, si) => (
              <circle
                key={si}
                cx={bx + seedJitter(si, i + 100, barWidth * 0.7)}
                cy={MARGIN.top + yScale(v)}
                r={2}
                fill="#555"
                opacity={0.55}
              />
            ))}

            {/* 有意差 */}
            <text x={cx} y={starY} textAnchor="middle" className="fig-sig-star">
              {significanceStars(p)}
            </text>

            {/* xラベル */}
            <text x={cx} y={MARGIN.top + plotH + 18} textAnchor="middle" className="fig-axis-label">
              {cat}
            </text>
          </g>
        );
      })}

      {/* x軸タイトル */}
      {xLabel && (
        <text x={MARGIN.left + plotW / 2} y={MARGIN.top + plotH + 38} textAnchor="middle" className="fig-axis-title">
          {xLabel}
        </text>
      )}

      {/* 軸線 */}
      <line
        x1={MARGIN.left}
        x2={MARGIN.left + plotW}
        y1={MARGIN.top + plotH}
        y2={MARGIN.top + plotH}
        stroke="#333"
        strokeWidth={1}
      />
      <line x1={MARGIN.left} x2={MARGIN.left} y1={MARGIN.top} y2={MARGIN.top + plotH} stroke="#333" strokeWidth={1} />

      {/* 凡例(長い英語ラベルでも右端で切れないよう、左マージン基準・全幅で配置) */}
      <g transform={`translate(${MARGIN.left}, ${MARGIN.top - 24})`}>
        <rect x={0} y={-9} width={10} height={10} fill={seriesA.fill} stroke={seriesA.color} strokeWidth={1.2} />
        <text x={14} y={0} className="fig-legend-label">
          {seriesA.label}
        </text>
        <rect x={0} y={9} width={10} height={10} fill={seriesB.fill} stroke={seriesB.color} strokeWidth={1.2} />
        <text x={14} y={18} className="fig-legend-label">
          {seriesB.label}
        </text>
      </g>
    </svg>
  );
}
