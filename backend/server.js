// ─────────────────────────────────────────────────────────────────────────────
// server.js  — Express application entry point
// ─────────────────────────────────────────────────────────────────────────────
const express  = require('express');
const cors     = require('cors');
const http     = require('http');
const { inventoryManager } = require('./lib/inventory');

// Boot the worker so it starts consuming queue jobs
require('./workers/orderWorker');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/flash-sale', require('./routes/flashSale'));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  await inventoryManager.init();

  // Sync in-memory stock from SQLite database on startup if not using Redis
  if (!inventoryManager.isRedis()) {
    const { getDb } = require('./db/database');
    const row = getDb().prepare("SELECT stock FROM inventory WHERE product_id = 'PHONE_001'").get();
    if (row && typeof row.stock === 'number') {
      await inventoryManager.reset(row.stock);
    }
  }

  // Create raw HTTP server to configure higher connection limits
  const server = http.createServer(app);
  server.maxConnections = 10000;   // Handle load test bursts

  server.listen(PORT, () => {
    console.log(`\n🚀 Flash Sale API running at http://localhost:${PORT}`);
    console.log(`   Mode: ${inventoryManager.isRedis() ? '🔴 Redis' : '💾 In-Memory'}`);
    console.log(`   POST http://localhost:${PORT}/api/flash-sale/checkout`);
    console.log(`   GET  http://localhost:${PORT}/api/flash-sale/stock\n`);
  });
}

start().catch(err => {
  console.error('[Startup] Fatal error:', err);
  process.exit(1);
});
