// 基本統計量とWelchの両側t検定(等分散を仮定しない)。
// P値の算出にはt分布の累積分布関数(不完全ベータ関数の正則化版)を使う。

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** 標本分散(不偏分散、n-1で割る) */
export function variance(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const ss = xs.reduce((s, x) => s + (x - m) ** 2, 0);
  return ss / (xs.length - 1);
}

export function sem(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  return Math.sqrt(variance(xs) / xs.length);
}

/** 正則化不完全ベータ関数 I_x(a, b)(連分数展開、Numerical Recipes準拠) */
function betacf(x: number, a: number, b: number): number {
  const MAXIT = 200;
  const EPS = 3e-9;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta =
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x);
  const bt = Math.exp(lnBeta);
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(x, a, b)) / a;
  }
  return 1 - (bt * betacf(1 - x, b, a)) / b;
}

/** log-gamma関数(Lanczos近似) */
function lgamma(x: number): number {
  const g = 7;
  const coefs = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = coefs[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += coefs[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** t分布(自由度df)の両側P値: P(|T| >= |t|) */
function tTwoTailedP(t: number, df: number): number {
  const x = df / (df + t * t);
  return regularizedIncompleteBeta(x, df / 2, 0.5);
}

export interface WelchResult {
  meanA: number;
  meanB: number;
  t: number;
  df: number;
  p: number;
}

/** Welchの両側t検定(等分散を仮定しない) */
export function welchTTest(a: readonly number[], b: readonly number[]): WelchResult {
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a);
  const vb = variance(b);
  const na = a.length;
  const nb = b.length;
  const se2 = va / na + vb / nb;
  const se = Math.sqrt(se2);
  if (se === 0 || na < 2 || nb < 2) {
    return { meanA: ma, meanB: mb, t: 0, df: 0, p: 1 };
  }
  const t = (ma - mb) / se;
  const df = (se2 * se2) / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
  const p = tTwoTailedP(t, df);
  return { meanA: ma, meanB: mb, t, df, p: Math.min(1, Math.max(0, p)) };
}

export function significanceStars(p: number): string {
  if (p < 0.0001) return '****';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return 'ns';
}
