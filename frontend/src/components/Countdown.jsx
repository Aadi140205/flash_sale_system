// ─────────────────────────────────────────────────────────────────────────────
// src/components/Countdown.jsx
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import '../components.css';

function pad(n) { return String(n).padStart(2, '0'); }

export default function Countdown({ targetHour = 20 }) {
  const [diff, setDiff] = useState(null);

  useEffect(() => {
    const tick = () => {
      const now    = new Date();
      const target = new Date(now);
      target.setHours(targetHour, 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      setDiff(Math.max(0, Math.floor((target - now) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetHour]);

  if (diff === null) return null;

  if (diff === 0) {
    return (
      <div className="countdown-wrap">
        <span className="sale-live-badge">⚡ Sale is Live!</span>
      </div>
    );
  }

  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;

  return (
    <div className="countdown-wrap">
      <h3>Flash Sale starts at 8:00 PM</h3>
      <div className="countdown-units">
        <div className="unit"><span className="num">{pad(h)}</span><span className="label">Hours</span></div>
        <div className="unit"><span className="num">{pad(m)}</span><span className="label">Mins</span></div>
        <div className="unit"><span className="num">{pad(s)}</span><span className="label">Secs</span></div>
      </div>
    </div>
  );
}
