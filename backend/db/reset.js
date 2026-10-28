// ─────────────────────────────────────────────────────────────────────────────
// db/reset.js  — Reset inventory + orders for re-testing
// ─────────────────────────────────────────────────────────────────────────────
const { DatabaseSync } = require('node:sqlite');
const path  = require('path');

const DB_PATH      = path.join(__dirname, 'flash_sale.db');
const INITIAL_STOCK = 500;

async function reset() {
  // Reset SQLite
  const db = new DatabaseSync(DB_PATH);
  db.prepare('UPDATE inventory SET stock = ? WHERE product_id = ?').run(INITIAL_STOCK, 'PHONE_001');
  db.prepare('DELETE FROM orders').run();
  db.close();
  console.log('[RESET] SQLite: stock → 500, orders cleared');

  // Reset Redis (if available)
  try {
    const Redis = require('ioredis');
    const redis = new Redis({
      host: '127.0.0.1', port: 6379, lazyConnect: true, connectTimeout: 2000,
      maxRetriesPerRequest: 0, retryStrategy: () => null, enableOfflineQueue: false,
    });
    redis.on('error', () => {});
    await redis.connect();
    await redis.set('flash_sale:stock:PHONE_001', INITIAL_STOCK);
    await redis.del('flash_sale:reserved_users');
    console.log('[RESET] Redis: stock → 500');
    await redis.quit();
  } catch {
    console.log('[RESET] Redis not available — skipped');
  }

  console.log('[RESET] ✅ Done! Ready for a new flash sale.\n');
  process.exit(0);
}

reset();
