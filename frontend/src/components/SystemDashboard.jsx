// ─────────────────────────────────────────────────────────────────────────────
// src/components/SystemDashboard.jsx  — Live Telemetry & DB Status
// ─────────────────────────────────────────────────────────────────────────────
import '../components.css';

export default function SystemDashboard({ stock, dbStock, stats, usingRedis, onReset, isResetting }) {
  const completed = stats?.byStatus?.COMPLETED || 0;
  const queued    = stats?.byStatus?.QUEUED || 0;
  const isConsistent = stock === dbStock;

  return (
    <div className="telemetry-card">
      <div className="telemetry-header">
        <div className="telemetry-title">
          <span className="live-dot" />
          <span>Live System Telemetry</span>
        </div>
        <button className="btn-reset" onClick={onReset} disabled={isResetting} title="Reset DB and cache to 500 units">
          🔄 Reset Sale
        </button>
      </div>

      <div className="telemetry-grid">
        <div className="metric-box">
          <div className="metric-label">Cache / Memory Stock</div>
          <div className="metric-val">{stock} <span className="metric-sub">/ 500</span></div>
          <div className="metric-tag">{usingRedis ? 'Redis Cluster' : 'In-Memory Atomic'}</div>
        </div>

        <div className="metric-box">
          <div className="metric-label">SQLite DB Stock</div>
          <div className="metric-val">{dbStock} <span className="metric-sub">/ 500</span></div>
          <div className="metric-tag">ACID Conditional</div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Orders Completed</div>
          <div className="metric-val highlight-green">{completed}</div>
          <div className="metric-tag">Persisted to Disk</div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Queue Backlog</div>
          <div className="metric-val">{queued}</div>
          <div className="metric-tag">Worker Queue (x5)</div>
        </div>
      </div>

      <div className="consistency-bar">
        <span className="badge-status">
          {isConsistent ? '✅ In-Sync: Cache == DB' : '⏳ Async Workers Syncing...'}
        </span>
        <span className="oversell-guard">
          🛡️ Zero-Overselling Guard: <strong>ACTIVE</strong>
        </span>
      </div>
    </div>
  );
}
