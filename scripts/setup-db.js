// scripts/setup-db.js
// Run once to create the SQLite database and all tables.

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../backend/data/magazijn.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- ── GEBRUIKERS ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS gebruikers (
    id          TEXT PRIMARY KEY,
    naam        TEXT NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    wachtwoord  TEXT NOT NULL,
    rol         TEXT NOT NULL DEFAULT 'medewerker', -- medewerker | admin
    actief      INTEGER NOT NULL DEFAULT 1,
    aangemaakt  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ── ARTIKELEN ───────────────────────────────────────
  CREATE TABLE IF NOT EXISTS artikelen (
    id          TEXT PRIMARY KEY,
    naam        TEXT NOT NULL,
    omschrijving TEXT,
    qr_code     TEXT UNIQUE NOT NULL,
    eenheid     TEXT NOT NULL DEFAULT 'stuk',
    categorie   TEXT,
    min_voorraad INTEGER DEFAULT 0,
    actief      INTEGER NOT NULL DEFAULT 1,
    aangemaakt  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ── PICKLIJSTEN ─────────────────────────────────────
  CREATE TABLE IF NOT EXISTS picklijsten (
    id            TEXT PRIMARY KEY,
    gebruiker_id  TEXT NOT NULL REFERENCES gebruikers(id),
    status        TEXT NOT NULL DEFAULT 'actief',
                  -- actief | wacht_retour | afgerond | geannuleerd
    notities      TEXT,
    aangemaakt    TEXT NOT NULL DEFAULT (datetime('now')),
    verstuurd_op  TEXT,
    gesloten_op   TEXT,
    CHECK(status IN ('actief','wacht_retour','afgerond','geannuleerd'))
  );

  -- ── PICKLIJST REGELS ────────────────────────────────
  CREATE TABLE IF NOT EXISTS picklijst_regels (
    id            TEXT PRIMARY KEY,
    picklijst_id  TEXT NOT NULL REFERENCES picklijsten(id) ON DELETE CASCADE,
    artikel_id    TEXT NOT NULL REFERENCES artikelen(id),
    meegenomen    INTEGER NOT NULL DEFAULT 0,
    teruggekomen  INTEGER,          -- NULL = nog niet verwerkt
    verbruik      INTEGER,          -- berekend: meegenomen - teruggekomen
    aangemaakt    TEXT NOT NULL DEFAULT (datetime('now')),
    bijgewerkt    TEXT
  );

  -- ── INDEXEN ─────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_picklijsten_gebruiker ON picklijsten(gebruiker_id);
  CREATE INDEX IF NOT EXISTS idx_picklijsten_status    ON picklijsten(status);
  CREATE INDEX IF NOT EXISTS idx_regels_picklijst      ON picklijst_regels(picklijst_id);
  CREATE INDEX IF NOT EXISTS idx_regels_artikel        ON picklijst_regels(artikel_id);
  CREATE INDEX IF NOT EXISTS idx_artikelen_qr          ON artikelen(qr_code);
`);

console.log('✅ Database aangemaakt:', DB_PATH);
db.close();
