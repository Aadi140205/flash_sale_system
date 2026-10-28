// ─────────────────────────────────────────────────────────────────────────────
// src/hooks/useFlashSale.js  — Core Flash Sale state & API interaction
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react';

const API = '/api/flash-sale';
const INITIAL_STOCK = 500;

export const MIN_USER_ID = 1;
export const MAX_USER_ID = 1000000;

export function validateUserId(raw) {
  if (!raw) return { valid: false, error: 'User ID is required' };
  const str = String(raw).trim();
  if (!/^\d+$/.test(str)) {
    return { valid: false, error: 'Numbers only (no letters or symbols)' };
  }
  const num = parseInt(str, 10);
  if (isNaN(num) || num < MIN_USER_ID || num > MAX_USER_ID) {
    return { valid: false, error: `Must be between 1 and ${MAX_USER_ID.toLocaleString()}` };
  }
  return { valid: true, normalized: String(num) };
}

export function useFlashSale(userId) {
  const [stock,         setStock]         = useState(INITIAL_STOCK);
  const [dbStock,       setDbStock]       = useState(INITIAL_STOCK);
  const [stats,         setStats]         = useState({ totalOrders: 0, byStatus: { COMPLETED: 0, QUEUED: 0, FAILED: 0 } });
  const [usingRedis,    setUsingRedis]    = useState(null);
  const [orderState,    setOrderState]    = useState(null);
  const [isLoading,     setIsLoading]     = useState(false);
  const [isSimulating,  setIsSimulating]  = useState(false);
  const [simReport,     setSimReport]     = useState(null);

  const pollingRef   = useRef(null);
  const lastClickRef = useRef(0);

  // ── Fetch telemetry & stock ──────────────────────────────────────────────
  const fetchTelemetry = useCallback(async () => {
    try {
      const [stockRes, statsRes] = await Promise.all([
        fetch(`${API}/stock`),
        fetch(`${API}/stats`)
      ]);
      const stockData = await stockRes.json();
      const statsData = await statsRes.json();

      setStock(stockData.redisStock ?? stockData.dbStock ?? 0);
      setDbStock(stockData.dbStock ?? 0);
      setUsingRedis(stockData.usingRedis);
      setStats(statsData);
    } catch {
      /* server might be temporarily starting */
    }
  }, []);

  // Poll telemetry every 1.5 seconds for snappy updates
  useEffect(() => {
    fetchTelemetry();
    const id = setInterval(fetchTelemetry, 1500);
    return () => clearInterval(id);
  }, [fetchTelemetry]);

  // ── SSE status listener ───────────────────────────────────────────────────
  const startSSE = useCallback((orderId) => {
    if (pollingRef.current) { pollingRef.current.close(); }

    const es = new EventSource(`${API}/sse/${orderId}`);
    pollingRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setOrderState(prev => ({ ...prev, status: data.status }));
      if (data.status === 'COMPLETED' || data.status === 'FAILED') {
        es.close();
        pollingRef.current = null;
        setIsLoading(false);
        fetchTelemetry();
      }
    };

    es.onerror = () => {
      es.close();
      pollingRef.current = null;
      setIsLoading(false);
    };
  }, [fetchTelemetry]);

  // ── Checkout handler with debounce & normalization ────────────────────────
  const checkout = useCallback(async () => {
    const now = Date.now();
    if (now - lastClickRef.current < 2500) return; // 2.5s client debounce
    lastClickRef.current = now;

    const validation = validateUserId(userId);
    if (!validation.valid) {
      setOrderState({ orderId: null, status: 'ERROR', message: validation.error });
      return;
    }
    if (isLoading) return;

    setIsLoading(true);
    setOrderState(null);

    try {
      const res = await fetch(`${API}/checkout`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId: validation.normalized, productId: 'PHONE_001' }),
      });
      const data = await res.json();

      if (res.status === 202) {
        setOrderState({ orderId: data.orderId, status: 'QUEUED', message: data.message });
        startSSE(data.orderId);
      } else if (res.status === 410) {
        setOrderState({ orderId: null, status: 'SOLD_OUT', message: data.message });
        setIsLoading(false);
      } else if (res.status === 409) {
        setOrderState({ orderId: null, status: 'DUPLICATE', message: data.message });
        setIsLoading(false);
      } else {
        setOrderState({ orderId: null, status: 'ERROR', message: data.error || 'Unknown error' });
        setIsLoading(false);
      }
      fetchTelemetry();
    } catch {
      setOrderState({ orderId: null, status: 'ERROR', message: 'Cannot reach server.' });
      setIsLoading(false);
    }
  }, [userId, isLoading, startSSE, fetchTelemetry]);

  // ── Reset sale handler ────────────────────────────────────────────────────
  const resetSale = useCallback(async () => {
    try {
      await fetch(`${API}/reset`, { method: 'POST' });
      setOrderState(null);
      setSimReport(null);
      await fetchTelemetry();
    } catch (err) {
      console.error('Reset failed:', err);
    }
  }, [fetchTelemetry]);

  // ── Concurrency simulation handler ────────────────────────────────────────
  const runSimulation = useCallback(async (count = 500) => {
    setIsSimulating(true);
    setSimReport(null);
    try {
      const res  = await fetch(`${API}/simulate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ count }),
      });
      const report = await res.json();
      setSimReport(report);
      await fetchTelemetry();
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setIsSimulating(false);
    }
  }, [fetchTelemetry]);

  useEffect(() => () => pollingRef.current?.close(), []);

  return {
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
    runSimulation,
    fetchTelemetry
  };
}
