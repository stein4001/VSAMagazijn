// backend/db.js
// Singleton database verbinding.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data/magazijn.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Auto-migraties: kolommen toevoegen als ze nog niet bestaan
try { db.prepare('ALTER TABLE picklijst_regels ADD COLUMN serienummer TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE picklijsten ADD COLUMN klant TEXT').run(); } catch {}

module.exports = db;
