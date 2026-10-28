// ─────────────────────────────────────────────────────────────────────────────
// db/init.js  — Create SQLite tables + seed inventory
// Uses Node.js 22 built-in node:sqlite (no native compilation needed)
// ─────────────────────────────────────────────────────────────────────────────
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'flash_sale.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS inventory (
    product_id   TEXT PRIMARY KEY,
    product_name TEXT NOT NULL,
    stock        INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    order_id   TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'QUEUED',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// Seed inventory if not present
const row = db.prepare('SELECT * FROM inventory WHERE product_id = ?').get('PHONE_001');
if (!row) {
  db.prepare(
    "INSERT INTO inventory (product_id, product_name, stock) VALUES (?, ?, ?)"
  ).run('PHONE_001', 'Flagship Smartphone X1', 500);
  console.log('[DB] Seeded: 500 units of PHONE_001');
} else {
  console.log(`[DB] Already seeded. Current stock: ${row.stock}`);
}

db.close();
console.log('[DB] Ready:', DB_PATH);
