// ─────────────────────────────────────────────────────────────────────────────
// db/database.js  — Singleton SQLite connection using Node.js 22 built-in
//
// Node.js 22.5+ ships a built-in 'node:sqlite' module — zero dependencies,
// no native compilation needed, fully synchronous API.
// ─────────────────────────────────────────────────────────────────────────────
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const DB_DIR  = path.join(__dirname);
const DB_PATH = path.join(DB_DIR, 'flash_sale.db');

let _db;

function getDb() {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    // WAL mode: allows concurrent readers while writer is active
    _db.exec('PRAGMA journal_mode = WAL;');
    _db.exec('PRAGMA synchronous = NORMAL;');
  }
  return _db;
}

module.exports = { getDb, DB_PATH };
