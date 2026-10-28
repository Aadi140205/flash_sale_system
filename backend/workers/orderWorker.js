// ─────────────────────────────────────────────────────────────────────────────
// workers/orderWorker.js
//
// Background consumer: reads jobs from the in-process queue and
// persists them to SQLite with ACID conditional updates.
// Uses Node.js 22 built-in node:sqlite (no db.transaction() — uses SQL directly)
// ─────────────────────────────────────────────────────────────────────────────
const { orderQueue } = require('../lib/queue');
const { getDb }      = require('../db/database');

function processOrder(job) {
  const { orderId, userId, productId } = job;
  const db  = getDb();
  const now = Date.now();

  try {
    db.exec('BEGIN');

    // Defensive backstop: only decrement if DB still has stock
    const result = db.prepare(
      'UPDATE inventory SET stock = stock - 1 WHERE product_id = ? AND stock > 0'
    ).run(productId);

    if (result.changes === 0) {
      // Should never happen (Redis gated it), but safe to handle
      db.prepare(
        'UPDATE orders SET status = ?, updated_at = ? WHERE order_id = ?'
      ).run('FAILED', now, orderId);
      db.exec('COMMIT');
      console.log(`[Worker] ${orderId.slice(0, 8)}… → FAILED (no DB stock)`);
      return { success: false };
    }

    db.prepare(
      'UPDATE orders SET status = ?, updated_at = ? WHERE order_id = ?'
    ).run('COMPLETED', now, orderId);

    db.exec('COMMIT');
    return { success: true };

  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    console.error(`[Worker] Error processing ${orderId}:`, err.message);
    return { success: false };
  }
}

// Register processor — the queue calls this for every job
orderQueue.process(processOrder);

console.log('[Worker] Order processing started (concurrency=5)');

module.exports = { processOrder };
