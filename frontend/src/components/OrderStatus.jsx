// ─────────────────────────────────────────────────────────────────────────────
// src/components/OrderStatus.jsx
// ─────────────────────────────────────────────────────────────────────────────
import '../components.css';

const CONFIG = {
  QUEUED:    { emoji: '⏳', title: 'Order Queued',       sub: 'Processing your order…' },
  COMPLETED: { emoji: '✅', title: 'Order Confirmed!',   sub: 'Congratulations! Your phone is reserved.' },
  FAILED:    { emoji: '❌', title: 'Order Failed',       sub: 'Something went wrong. Please try again.' },
  SOLD_OUT:  { emoji: '😔', title: 'Sold Out',           sub: 'All 500 units have been claimed.' },
  DUPLICATE: { emoji: '🔄', title: 'Already Ordered',    sub: 'You already have an active order.' },
  ERROR:     { emoji: '⚠️', title: 'Connection Error',   sub: 'Could not reach the server.' },
};

export default function OrderStatus({ orderState }) {
  if (!orderState) return null;

  const cfg = CONFIG[orderState.status] || CONFIG.ERROR;

  return (
    <div className={`order-status ${orderState.status}`}>
      <div className="status-emoji">{cfg.emoji}</div>
      <div className="status-title">{cfg.title}</div>
      <div className="status-sub">{orderState.message || cfg.sub}</div>
      {orderState.orderId && (
        <div className="order-id">Order ID: {orderState.orderId}</div>
      )}
    </div>
  );
}
