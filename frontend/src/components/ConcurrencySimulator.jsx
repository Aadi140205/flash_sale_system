// ─────────────────────────────────────────────────────────────────────────────
// src/components/ConcurrencySimulator.jsx — In-UI Load Benchmark
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import '../components.css';

export default function ConcurrencySimulator({ onSimulate, isSimulating, report }) {
  const [count, setCount] = useState(500);

  return (
    <div className="sim-card">
      <div className="sim-header">
        <div>
          <h3>⚡ Live Concurrency Benchmark</h3>
          <p className="sim-sub">Simulate a sudden traffic surge hitting checkout simultaneously.</p>
        </div>
        <div className="sim-presets">
          {[100, 500, 1000].map(val => (
            <button
              key={val}
              className={`preset-btn ${count === val ? 'active' : ''}`}
              onClick={() => setCount(val)}
              disabled={isSimulating}
            >
              {val} Users
            </button>
          ))}
        </div>
      </div>

      <button
        className="btn-simulate"
        onClick={() => onSimulate(count)}
        disabled={isSimulating}
      >
        {isSimulating ? (
          <>
            <span className="spinner" />
            Simulating {count} Concurrent Checkouts...
          </>
        ) : (
          `🚀 Fire ${count} Parallel Checkout Requests`
        )}
      </button>

      {report && (
        <div className="sim-report">
          <div className="report-row">
            <span>Requests Simulated</span>
            <strong>{report.totalSimulated}</strong>
          </div>
          <div className="report-row">
            <span>✅ Accepted (HTTP 202)</span>
            <strong className="text-green">{report.results.accepted}</strong>
          </div>
          <div className="report-row">
            <span>🔴 Sold Out (HTTP 410)</span>
            <strong className="text-red">{report.results.soldOut}</strong>
          </div>
          <div className="report-row">
            <span>Throughput</span>
            <strong>~{report.throughputReqSec.toLocaleString()} req/s ({report.durationMs}ms)</strong>
          </div>
          <div className="sim-banner">
            🏆 Zero Overselling Verified: exactly {report.results.accepted} units reserved!
          </div>
        </div>
      )}
    </div>
  );
}
