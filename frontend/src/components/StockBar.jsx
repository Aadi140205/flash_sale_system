// ─────────────────────────────────────────────────────────────────────────────
// src/components/StockBar.jsx
// ─────────────────────────────────────────────────────────────────────────────
import '../components.css';

const INITIAL = 500;

export default function StockBar({ stock }) {
  const pct = Math.max(0, Math.min(100, (stock / INITIAL) * 100));
  const low = pct < 20;

  return (
    <div className="stock-section">
      <div className="stock-header">
        <span>Units remaining</span>
        <span>{stock} / {INITIAL}</span>
      </div>
      <div className="stock-bar-bg">
        <div
          className={`stock-bar-fill${low ? ' low' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
