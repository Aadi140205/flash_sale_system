// ─────────────────────────────────────────────────────────────────────────────
// src/App.jsx  — Complete Flash Sale System with Live Telemetry & Benchmark
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import './App.css';
import Countdown            from './components/Countdown.jsx';
import StockBar             from './components/StockBar.jsx';
import OrderStatus          from './components/OrderStatus.jsx';
import SystemDashboard      from './components/SystemDashboard.jsx';
import ConcurrencySimulator from './components/ConcurrencySimulator.jsx';
import { useFlashSale, validateUserId, MIN_USER_ID, MAX_USER_ID } from './hooks/useFlashSale.js';

function getBtnLabel(isLoading, orderState, stock) {
  if (stock <= 0)                               return 'Sold Out';
  if (isLoading && orderState?.status === 'QUEUED') return 'Processing…';
  if (isLoading)                                return 'Reserving…';
  if (orderState?.status === 'COMPLETED')       return 'Order Confirmed ✓';
  if (orderState?.status === 'DUPLICATE')       return 'Already Ordered';
  return '⚡ Buy Now — Flash Price';
}

export default function App() {
  const [userId, setUserId] = useState('');
  const {
    stock,
    dbStock,
    stats,
    usingRedis,
    orderState,
    isLoading,
    isSimulating,
    simReport,
    checkout,
    resetSale,
    runSimulation
  } = useFlashSale(userId);

  const validation       = validateUserId(userId);
  const soldOut          = stock <= 0 || orderState?.status === 'SOLD_OUT';
  const btnDone          = orderState?.status === 'COMPLETED' || orderState?.status === 'DUPLICATE';
  const disabled         = isLoading || soldOut || btnDone || !validation.valid;

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!disabled && validation.valid) {
      checkout();
    }
  };

  return (
    <div className="app">
      {/* Header Badge */}
      <div className="hero-badge">⚡ Enterprise Flash Sale System</div>
      <h1 className="hero-title">Flagship Smartphone X1</h1>
      <p className="hero-sub">
        Strict 500-unit batch. High-concurrency zero-overselling demonstration.
        {usingRedis !== null && (
          <span className={`backend-badge ${usingRedis ? 'redis' : 'memory'}`}>
            {usingRedis ? '🔴 Redis Cluster' : '💾 In-Memory Atomic Engine'}
          </span>
        )}
      </p>

      {/* Main Checkout Card */}
      <div className="card">
        <Countdown targetHour={20} />

        <div className="product-row">
          <div className="product-icon">📱</div>
          <div>
            <div className="product-name">Flagship Smartphone X1</div>
            <div className="product-price">
              ₹39,999
              <span className="original">₹79,999</span>
            </div>
          </div>
        </div>

        <StockBar stock={stock} />

        {/* User Input with Strict Numeric 1-1,000,000 Validation */}
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div className="user-input-row">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Enter User ID (1 - 1,000,000)"
              value={userId}
              onChange={e => {
                // Strictly allow only numeric digits, max 7 digits
                const numbersOnly = e.target.value.replace(/\D/g, '').slice(0, 7);
                setUserId(numbersOnly);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleSubmit(e);
                }
              }}
              disabled={isLoading || btnDone}
              maxLength={7}
              autoFocus
            />
          </div>

          {/* Validation Feedback */}
          {userId.trim() && (
            <div style={{ fontSize: '0.74rem', marginTop: '-0.7rem', marginBottom: '0.8rem' }}>
              {!validation.valid ? (
                <span style={{ color: '#ef4444' }}>⚠️ {validation.error}</span>
              ) : validation.normalized !== userId ? (
                <span style={{ color: '#38bdf8' }}>
                  ℹ️ Normalized ID: <strong>"{validation.normalized}"</strong> (range 1 - 1,000,000)
                </span>
              ) : (
                <span style={{ color: '#22c55e' }}>
                  ✓ Valid User ID: <strong>{validation.normalized}</strong>
                </span>
              )}
            </div>
          )}

          <button
            type="submit"
            className={`btn-buy${soldOut ? ' sold-out' : ''}`}
            disabled={disabled}
          >
            {isLoading && <span className="spinner" />}
            {!validation.valid && userId.trim()
              ? 'Enter Valid Number (1-1000000)'
              : getBtnLabel(isLoading, orderState, stock)}
          </button>
        </form>

        <OrderStatus orderState={orderState} />
      </div>

      {/* Live System Telemetry & ACID Database Monitor */}
      <SystemDashboard
        stock={stock}
        dbStock={dbStock}
        stats={stats}
        usingRedis={usingRedis}
        onReset={resetSale}
      />

      {/* Interactive Concurrency Surge Simulator */}
      <ConcurrencySimulator
        onSimulate={runSimulation}
        isSimulating={isSimulating}
        report={simReport}
      />


    </div>
  );
}
