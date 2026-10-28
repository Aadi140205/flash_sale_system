// ─────────────────────────────────────────────────────────────────────────────
// lib/inventory.js
//
// Atomic inventory manager.
// Strategy: Try Redis first (real deployment). If Redis is unreachable,
// fall back to a pure in-memory serialized counter that gives identical
// zero-overselling guarantees for single-process demos.
// ─────────────────────────────────────────────────────────────────────────────
const Redis = require('ioredis');

const PRODUCT_ID    = 'PHONE_001';
const STOCK_KEY     = `flash_sale:stock:${PRODUCT_ID}`;
const RESERVED_KEY  = 'flash_sale:reserved_users';
const INITIAL_STOCK = 500;

// ── Lua script: atomic check-and-decrement ────────────────────────────────
// Returns: -1 = duplicate, 0 = sold out, 1 = success
const LUA_SCRIPT = `
local stock_key    = KEYS[1]
local reserved_key = KEYS[2]
local user_id      = ARGV[1]

if redis.call("SISMEMBER", reserved_key, user_id) == 1 then
  return -1
end

local stock = tonumber(redis.call("GET", stock_key) or "0")
if stock <= 0 then
  return 0
end

redis.call("DECRBY", stock_key, 1)
redis.call("SADD",   reserved_key, user_id)
return 1
`;

// ── In-Memory Fallback ─────────────────────────────────────────────────────
// Achieves atomicity by serializing every decrement through a promise chain.
// This is single-process safe — in multi-process production, Redis is mandatory.
class InMemoryInventory {
  constructor(initialStock) {
    this._stock    = initialStock;
    this._reserved = new Set();
    // All operations are queued through this chain to guarantee serial execution
    this._chain    = Promise.resolve();
  }

  decrement(userId) {
    // Each call appends to the promise chain — they execute one at a time
    const p = this._chain.then(() => this._doDecrement(userId));
    this._chain = p.catch(() => {});  // prevent chain breakage on error
    return p;
  }

  _doDecrement(userId) {
    if (this._reserved.has(userId)) return -1;
    if (this._stock <= 0)           return 0;
    this._stock--;
    this._reserved.add(userId);
    return 1;
  }

  getStock()       { return this._stock; }
  setStock(n)      { this._stock = n; this._reserved.clear(); }
  reset(n)         { this._stock = n; this._reserved.clear(); this._chain = Promise.resolve(); }
}

// ── Inventory Manager ─────────────────────────────────────────────────────
class InventoryManager {
  constructor() {
    this._redis        = null;
    this._luaSha       = null;
    this._useRedis     = false;
    this._memInventory = new InMemoryInventory(INITIAL_STOCK);
  }

  async init() {
    try {
      this._redis = new Redis({
        host:              '127.0.0.1',
        port:              6379,
        lazyConnect:       true,
        connectTimeout:    2000,
        maxRetriesPerRequest: 0,   // fail fast
        enableOfflineQueue: false,
        retryStrategy:     () => null,  // no auto-retry on initial connect
      });

      // Suppress subsequent unhandled error events after we handle the first
      this._redis.on('error', () => {});

      await this._redis.connect();

      this._luaSha = await this._redis.script('LOAD', LUA_SCRIPT);
      // Only set stock if key doesn't exist yet (preserve existing sale state)
      await this._redis.setnx(STOCK_KEY, INITIAL_STOCK);

      this._useRedis = true;
      console.log('[Inventory] ✅  Redis connected — atomic Lua decrement active');
    } catch (err) {
      console.warn('[Inventory] ⚠️  Redis unavailable — using in-memory fallback');
      console.warn(`[Inventory]    (${err.message})`);
      this._useRedis = false;
      if (this._redis) {
        this._redis.disconnect();
        this._redis = null;
      }
    }
  }

  /**
   * Atomically reserve 1 unit.
   * @returns {Promise<number>}  1=success  0=sold-out  -1=duplicate
   */
  async decrement(userId) {
    if (this._useRedis) {
      try {
        const result = await this._redis.evalsha(
          this._luaSha, 2, STOCK_KEY, RESERVED_KEY, userId
        );
        return Number(result);
      } catch (err) {
        if (err.message && err.message.includes('NOSCRIPT')) {
          this._luaSha = await this._redis.script('LOAD', LUA_SCRIPT);
          return this.decrement(userId);
        }
        throw err;
      }
    }
    return this._memInventory.decrement(userId);
  }

  async getStock() {
    if (this._useRedis) {
      const v = await this._redis.get(STOCK_KEY);
      return Math.max(0, Number(v) || 0);
    }
    return this._memInventory.getStock();
  }

  async reset(stock = INITIAL_STOCK) {
    if (this._useRedis) {
      await this._redis.set(STOCK_KEY, stock);
      await this._redis.del(RESERVED_KEY);
    } else {
      this._memInventory.reset(stock);
    }
  }

  isRedis() { return this._useRedis; }
}

const inventoryManager = new InventoryManager();
module.exports = { inventoryManager, PRODUCT_ID, INITIAL_STOCK };
