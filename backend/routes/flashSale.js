// ─────────────────────────────────────────────────────────────────────────────
// routes/flashSale.js  — All Flash Sale API endpoints
// Uses Node.js 22 built-in node:sqlite
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const { inventoryManager, PRODUCT_ID } = require('../lib/inventory');
const { orderQueue } = require('../lib/queue');
const { getDb } = require('../db/database');

const router = express.Router();

// ── Friendly GET fallback for browser testing ────────────────────────────────
router.get('/checkout', (_req, res) => {
  res.status(405).json({
    error: 'Method Not Allowed',
    message: 'The /checkout endpoint requires an HTTP POST request with a JSON payload { userId: "user_123" }.',
    tip: 'To test checkout interactively, use the frontend UI at http://localhost:5173 or send a POST request.'
  });
});

// ── Reset endpoint (both GET and POST for convenience) ───────────────────────
const handleReset = async (_req, res) => {
  try {
    const db = getDb();
    db.prepare("UPDATE inventory SET stock = 500 WHERE product_id = ?").run(PRODUCT_ID);
    db.prepare("DELETE FROM orders").run();
    await inventoryManager.reset(500);

    return res.json({
      status: 'RESET_OK',
      stock: 500,
      message: 'Sale reset! Inventory set to 500, orders cleared.'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

router.post('/reset', handleReset);
router.get('/reset', handleReset);

// ── POST /api/flash-sale/simulate — Fast In-UI Load Generator ────────────────
router.post('/simulate', async (req, res) => {
  const count = Math.min(Math.max(Number(req.body.count) || 500, 1), 2000);
  const startTime = Date.now();
  const baseId = 100000 + Math.floor(Math.random() * 800000);

  const results = { accepted: 0, soldOut: 0, duplicate: 0, errors: 0 };

  for (let i = 0; i < count; i++) {
    const simUserId = String(baseId + i);
    try {
      const outcome = await inventoryManager.decrement(simUserId);
      if (outcome === 1) {
        results.accepted++;
        const orderId = uuidv4();
        const now = Date.now();
        getDb().prepare(
          'INSERT INTO orders (order_id, product_id, user_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(orderId, PRODUCT_ID, simUserId, 'QUEUED', now, now);
        orderQueue.enqueue({ orderId, userId: simUserId, productId: PRODUCT_ID })
          .catch(err => console.error('[Queue error]', err.message));
      } else if (outcome === 0) {
        results.soldOut++;
      } else if (outcome === -1) {
        results.duplicate++;
      }
    } catch {
      results.errors++;
    }
  }

  const durationMs = Date.now() - startTime;
  const inMemStock = await inventoryManager.getStock();
  const dbRow = getDb().prepare('SELECT stock FROM inventory WHERE product_id = ?').get(PRODUCT_ID);

  return res.json({
    totalSimulated: count,
    results,
    durationMs,
    throughputReqSec: Math.round((count / (Math.max(durationMs, 1) / 1000))),
    stock: {
      inMemory: inMemStock,
      database: dbRow ? dbRow.stock : 0
    }
  });
});

// ── Strict Numeric User ID Validator & Normalizer (Range: 1 - 1,000,000) ─────
const MIN_USER_ID = 1;
const MAX_USER_ID = 1000000;

function validateAndNormalizeUserId(raw) {
  if (raw === undefined || raw === null) {
    return { valid: false, error: 'User ID is required' };
  }
  const str = String(raw).trim();
  if (!str) {
    return { valid: false, error: 'User ID cannot be empty' };
  }
  // Must be digits only (strictly no letters, symbols, or negative signs)
  if (!/^\d+$/.test(str)) {
    return { valid: false, error: 'User ID must contain only digits (no letters or special characters)' };
  }
  const num = parseInt(str, 10);
  if (isNaN(num) || num < MIN_USER_ID || num > MAX_USER_ID) {
    return { valid: false, error: `User ID must be a number between ${MIN_USER_ID} and ${MAX_USER_ID.toLocaleString()}` };
  }
  // Canonical form: strip leading zeros ("007" -> "7")
  return { valid: true, normalized: String(num) };
}

// ── POST /api/flash-sale/checkout ────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  const { userId, productId } = req.body;

  // Validation: Product ID
  if (productId && productId !== PRODUCT_ID) {
    return res.status(400).json({ error: 'Invalid productId' });
  }

  // Strict numeric validation (1 - 7777777)
  const validation = validateAndNormalizeUserId(userId);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const safeUserId = validation.normalized;

  try {
    // ── Atomic decrement (Redis Lua or in-memory) ─────────────────────────
    const result = await inventoryManager.decrement(safeUserId);

    if (result === -1) {
      return res.status(409).json({
        status: 'DUPLICATE',
        message: 'You have already placed an order for this item.'
      });
    }

    if (result === 0) {
      return res.status(410).json({
        status: 'SOLD_OUT',
        message: 'Sorry! All 500 units have been sold.'
      });
    }

    // ── Create order record immediately ──────────────────────────────────
    const orderId = uuidv4();
    const now     = Date.now();

    getDb().prepare(
      'INSERT INTO orders (order_id, product_id, user_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(orderId, PRODUCT_ID, safeUserId, 'QUEUED', now, now);

    // Push to background worker (fire-and-forget from HTTP perspective)
    orderQueue.enqueue({ orderId, userId: safeUserId, productId: PRODUCT_ID })
      .catch(err => console.error('[Queue] Job failed:', err.message));

    // ── 202 Accepted immediately ──────────────────────────────────────────
    return res.status(202).json({
      status:    'QUEUED',
      orderId,
      statusUrl: `/api/flash-sale/status/${orderId}`,
      message:   'Order queued! Check statusUrl to track your order.'
    });

  } catch (err) {
    console.error('[Checkout] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/flash-sale/status/:orderId ──────────────────────────────────────
router.get('/status/:orderId', (req, res) => {
  const order = getDb().prepare(
    'SELECT order_id, status, created_at, updated_at FROM orders WHERE order_id = ?'
  ).get(req.params.orderId);

  if (!order) return res.status(404).json({ error: 'Order not found' });

  return res.json({
    orderId:   order.order_id,
    status:    order.status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  });
});

// ── GET /api/flash-sale/stock ─────────────────────────────────────────────────
router.get('/stock', async (req, res) => {
  try {
    const redisStock = await inventoryManager.getStock();
    const dbRow      = getDb().prepare('SELECT stock FROM inventory WHERE product_id = ?').get(PRODUCT_ID);

    return res.json({
      productId:   PRODUCT_ID,
      redisStock,
      dbStock:     dbRow ? dbRow.stock : null,
      usingRedis:  inventoryManager.isRedis(),
      queueLength: orderQueue.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /api/flash-sale/stats ─────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const rows  = getDb().prepare(
    'SELECT status, COUNT(*) as count FROM orders GROUP BY status'
  ).all();

  const byStatus = {};
  rows.forEach(r => { byStatus[r.status] = r.count; });

  return res.json({
    totalOrders: rows.reduce((s, r) => s + r.count, 0),
    byStatus,
  });
});

// ── GET /api/flash-sale/sse/:orderId — Server-Sent Events ────────────────────
router.get('/sse/:orderId', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  const interval = setInterval(() => {
    const order = getDb().prepare(
      'SELECT status FROM orders WHERE order_id = ?'
    ).get(req.params.orderId);

    const status = order ? order.status : 'NOT_FOUND';
    send({ orderId: req.params.orderId, status });

    if (!order || status === 'COMPLETED' || status === 'FAILED') {
      clearInterval(interval);
      res.end();
    }
  }, 400);

  req.on('close', () => clearInterval(interval));
});

module.exports = router;
