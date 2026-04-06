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

// Auto-migraties
try { db.prepare('ALTER TABLE picklijst_regels ADD COLUMN serienummer TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE picklijsten ADD COLUMN klant TEXT').run(); } catch {}

// Migratie: projectnummer + wacht_verwerking status (vereist tabel-recreatie vanwege CHECK constraint)
const pickCols = db.prepare("PRAGMA table_info(picklijsten)").all().map(c => c.name);
if (!pickCols.includes('projectnummer')) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE picklijsten_v2 (
      id            TEXT PRIMARY KEY,
      gebruiker_id  TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'actief',
      klant         TEXT,
      notities      TEXT,
      aangemaakt    TEXT NOT NULL DEFAULT (datetime('now')),
      verstuurd_op  TEXT,
      gesloten_op   TEXT,
      projectnummer TEXT,
      CHECK(status IN ('actief','wacht_retour','wacht_verwerking','afgerond','geannuleerd'))
    );
    INSERT INTO picklijsten_v2
      SELECT id, gebruiker_id, status, klant, notities, aangemaakt, verstuurd_op, gesloten_op, NULL
      FROM picklijsten;
    DROP TABLE picklijsten;
    ALTER TABLE picklijsten_v2 RENAME TO picklijsten;
    CREATE INDEX IF NOT EXISTS idx_picklijsten_gebruiker ON picklijsten(gebruiker_id);
    CREATE INDEX IF NOT EXISTS idx_picklijsten_status    ON picklijsten(status);
  `);
  db.pragma('foreign_keys = ON');
}

module.exports = db;
