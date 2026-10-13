import {
  DT_S,
  INJECTION_JITTER_S,
  MAX_HORIZON_S,
  PARTICLE_DIAMETER_NM,
  REFERENCE_VELOCITY_DCARD_NM_S,
  REFERENCE_VELOCITY_WT_NM_S,
  RNA_LENGTH_NM,
} from '../lib/constants';

export default function ModelInfo() {
  return (
    <div className="panel model-info">
      <h2 className="panel-title">モデル説明</h2>

      <div className="model-info-grid">
        <div className="model-info-col">
          <h3>実測値(CSVから復元抽出)</h3>
          <ul>
            <li>
              移動速度: 既定では計算時間刻み({DT_S} s)ごとに実測分布から引き直す(平均速度固定モードも選択可:
              WT {REFERENCE_VELOCITY_WT_NM_S} nm/s・ΔCARD {REFERENCE_VELOCITY_DCARD_NM_S} nm/s)
            </li>
            <li>停止持続時間・停止頻度: 投入時に実測分布から1回だけ抽選し、以後固定</li>
          </ul>
        </div>

        <div className="model-info-col">
          <h3>固定値</h3>
          <ul>
            <li>RIG-I直径・接触判定距離: {PARTICLE_DIAMETER_NM} nm</li>
            <li>RNA長: {RNA_LENGTH_NM} nm</li>
            <li>計算時間刻み: {DT_S} s</li>
            <li>投入ゆらぎ(規則的モード): ±{INJECTION_JITTER_S} s</li>
          </ul>
        </div>

        <div className="model-info-col">
          <h3>調整可能パラメータ</h3>
          <ul>
            <li>投入分子数</li>
            <li>投入タイミング(規則的 / 完全ランダム)</li>
            <li>ランダム投入間隔の上下限(完全ランダムモード、20〜200 s)</li>
            <li>移動速度の与え方(毎ステップ抽選 / 平均速度固定)</li>
            <li>フィラメント判定分子数(閾値)</li>
          </ul>
        </div>
      </div>

      <h3>結合ルール</h3>
      <p className="hint">
        中心間距離が{PARTICLE_DIAMETER_NM} nm以下になったら必ず結合する(確率判定なし)。持続的な「結合状態」は
        管理せず、位置関係から毎ステップ再計算する幾何学的な概念——結合寿命や解離イベントという自由パラメータは
        存在しない。
      </p>

      <h3>補足</h3>
      <p className="hint">
        観察時間の上限は{MAX_HORIZON_S} s(実装上の安全上限)。教育・可視化目的の簡略化モデルであり、定量的な
        生化学的予測を保証するものではない。最新の形成率・占有率は下の「図の生成」パネルで再計算できる。
      </p>
    </div>
  );
}
