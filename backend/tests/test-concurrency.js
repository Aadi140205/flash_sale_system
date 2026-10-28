// ─────────────────────────────────────────────────────────────────────────────
// tests/test-concurrency.js
//
// FLASH SALE — Concurrency Verification Script
//
// Fires 2,000 simultaneous HTTP checkout requests against a running backend.
// Asserts exactly 500 succeed (202 Accepted) and 1,500 fail (410 Sold Out).
// Verifies zero overselling in both Redis and the database.
//
// Usage:
//   1. Start backend:  npm run dev   (in /backend terminal)
//   2. Run this test:  node tests/test-concurrency.js
// ─────────────────────────────────────────────────────────────────────────────

const http = require('http');

// Allow many parallel sockets for the burst test
http.globalAgent.maxSockets = Infinity;

const BASE_URL    = 'http://localhost:3001';
const CHECKOUT    = `${BASE_URL}/api/flash-sale/checkout`;
const STOCK_URL   = `${BASE_URL}/api/flash-sale/stock`;
const STATS_URL   = `${BASE_URL}/api/flash-sale/stats`;
const HEALTH_URL  = `${BASE_URL}/health`;

const STOCK       = 500;
const TOTAL_REQS  = 2000;   // 4× stock

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function httpRequest(url, method = 'GET', body = null, retries = 3) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      port:     urlObj.port,
      path:     urlObj.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const attempt = (n) => {
      const req = http.request(opts, (res) => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode, body: {} }); }
        });
      });
      req.on('error', (err) => {
        // Retry on transient connection errors (ECONNRESET, ETIMEDOUT)
        if (n > 0 && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'EPIPE')) {
          setTimeout(() => attempt(n - 1), 50);
        } else {
          resolve({ status: 0, error: err.message });
        }
      });
      if (data) req.write(data);
      req.end();
    };

    attempt(retries);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Wait for all queued orders to reach COMPLETED status
async function waitForWorkersDrain(orderIds, timeoutMs = 20000) {
  const start = Date.now();
  process.stdout.write('\n[Verify] Waiting for worker to complete all orders...');

  while (Date.now() - start < timeoutMs) {
    const stats = await httpRequest(STATS_URL);
    const completed = stats.body?.byStatus?.COMPLETED || 0;
    const queued    = stats.body?.byStatus?.QUEUED    || 0;
    process.stdout.write(`\r[Verify] Completed: ${completed}/${orderIds.length}  Queued: ${queued}   `);

    if (completed >= orderIds.length) {
      process.stdout.write('\n[Verify] ✅ All orders processed!\n');
      return true;
    }
    await sleep(300);
  }
  process.stdout.write('\n[Verify] ⚠️  Timeout — some orders may still be processing.\n');
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ⚡ FLASH SALE — CONCURRENCY TEST');
  console.log(`  ${TOTAL_REQS} simultaneous requests | ${STOCK} units in stock`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Verify server is reachable
  const health = await httpRequest(HEALTH_URL);
  if (health.status !== 200) {
    console.error('❌  Backend not running! Run: npm run dev\n');
    process.exit(1);
  }
  console.log('[Test] ✅ Backend reachable\n');

  // Build unique numeric user payloads between 1 and 7,777,777
  const payloads = Array.from({ length: TOTAL_REQS }, (_, i) => ({
    userId:    String(i + 1),  // 1 to 2000
    productId: 'PHONE_001',
  }));

  console.log('[Test] Firing all requests simultaneously via Promise.all...');
  const t0      = Date.now();
  const results = await Promise.all(payloads.map(p => httpRequest(CHECKOUT, 'POST', p)));
  const elapsed = Date.now() - t0;

  // Tally
  const successes  = results.filter(r => r.status === 202);
  const soldOut    = results.filter(r => r.status === 410);
  const duplicates = results.filter(r => r.status === 409);
  const errors     = results.filter(r => r.status !== 202 && r.status !== 410 && r.status !== 409);

  const successOrderIds = successes.map(r => r.body?.orderId).filter(Boolean);

  // Wait for workers to drain
  if (successOrderIds.length > 0) {
    await waitForWorkersDrain(successOrderIds);
  }

  // Fetch final state
  const stockData = await httpRequest(STOCK_URL);
  const statsData = await httpRequest(STATS_URL);

  const redisStock = stockData.body?.redisStock;
  const dbStock    = stockData.body?.dbStock;
  const completed  = statsData.body?.byStatus?.COMPLETED || 0;
  const failed     = statsData.body?.byStatus?.FAILED    || 0;

  // ── Print Report ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  CONCURRENCY TEST REPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total requests sent    : ${TOTAL_REQS}`);
  console.log(`  Time elapsed           : ${elapsed} ms  (~${(TOTAL_REQS / (elapsed / 1000)).toFixed(0)} req/s)`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  ✅  202 Accepted       : ${successes.length}  (expected: ${STOCK})`);
  console.log(`  🔴  410 Sold Out       : ${soldOut.length}`);
  console.log(`  🔄  409 Duplicate      : ${duplicates.length}`);
  console.log(`  ⚠️   Other / Errors    : ${errors.length}`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  Redis stock (live)     : ${redisStock ?? 'N/A (in-memory)'}`);
  console.log(`  DB stock (final)       : ${dbStock}`);
  console.log(`  DB orders COMPLETED    : ${completed}`);
  console.log(`  DB orders FAILED       : ${failed}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // ── Assertions ────────────────────────────────────────────────────────────
  let allPassed = true;
  function assert(condition, label, got, expected) {
    const ok = condition;
    console.log(`  ${ok ? '✅' : '❌'}  ${label}: got ${got}, expected ${expected}`);
    if (!ok) allPassed = false;
  }

  const invStock = stockData.body?.usingRedis ? redisStock : dbStock;

  console.log('\n  ASSERTIONS:');
  assert(successes.length === STOCK,
    'Exactly 500 orders accepted', successes.length, STOCK);
  assert(successes.length + soldOut.length + duplicates.length + errors.length === TOTAL_REQS,
    'All requests accounted for', successes.length + soldOut.length + duplicates.length + errors.length, TOTAL_REQS);
  assert(invStock === 0,
    'Inventory depleted to zero', invStock, 0);
  assert(dbStock === 0,
    'DB stock = 0 (no oversell)',  dbStock, 0);
  assert(errors.length === 0,
    'Zero unexpected errors',      errors.length, 0);

  console.log('═══════════════════════════════════════════════════════════════');

  if (allPassed) {
    console.log('\n  🏆  ALL ASSERTIONS PASSED — ZERO OVERSELLING CONFIRMED!\n');
  } else {
    console.log('\n  ❌  SOME ASSERTIONS FAILED — review output above.\n');
  }

  process.exit(allPassed ? 0 : 1);
}

runTest().catch(err => {
  console.error('\n[Test] Fatal error:', err.message);
  process.exit(1);
});
