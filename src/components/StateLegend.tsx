const ITEMS: { color: string; label: string }[] = [
  { color: 'var(--c-pending)', label: '投入前' },
  { color: 'var(--c-moving)', label: '移動中' },
  { color: 'var(--c-paused)', label: '停止中' },
  { color: 'var(--c-bound)', label: '結合中(マルチマー)' },
  { color: 'var(--c-finished)', label: 'RNA末端到達' },
];

export default function StateLegend() {
  return (
    <div className="legend">
      {ITEMS.map((item) => (
        <span key={item.label} className="legend-item">
          <span className="legend-dot" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
