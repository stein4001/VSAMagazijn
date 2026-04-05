// scripts/seed.js
// Vult de database met demo-gebruikers en artikelen.

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const path = require('path');

const DB_PATH = path.join(__dirname, '../backend/data/magazijn.db');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// ── GEBRUIKERS ──────────────────────────────────────────────────────────────
const gebruikers = [
  { naam: 'Admin',         email: 'admin@magazijn.nl',   rol: 'admin',       ww: 'admin123'  },
  { naam: 'Jan de Vries',  email: 'jan@magazijn.nl',     rol: 'medewerker',  ww: 'jan123'    },
  { naam: 'Sarah Meijer',  email: 'sarah@magazijn.nl',   rol: 'medewerker',  ww: 'sarah123'  },
  { naam: 'Tom Bakker',    email: 'tom@magazijn.nl',     rol: 'medewerker',  ww: 'tom123'    },
];

const insUser = db.prepare(`
  INSERT OR IGNORE INTO gebruikers (id, naam, email, wachtwoord, rol)
  VALUES (?, ?, ?, ?, ?)
`);

for (const g of gebruikers) {
  const hash = bcrypt.hashSync(g.ww, 10);
  insUser.run(uuid(), g.naam, g.email, hash, g.rol);
  console.log(`👤 ${g.naam} (${g.email} / ${g.ww})`);
}

// ── ARTIKELEN ───────────────────────────────────────────────────────────────
const artikelen = [
  { naam: 'Boormachine 18V',   omschrijving: 'Accu boormachine 18V',     eenheid: 'stuk', categorie: 'Gereedschap',    qr: 'ART-001' },
  { naam: 'Verlengkabel 10m',  omschrijving: 'Verlengsnoer 3-voudig 10m', eenheid: 'stuk', categorie: 'Elektra',         qr: 'ART-002' },
  { naam: 'Schuurpapier P80',  omschrijving: 'Schuurpapier korrel P80',   eenheid: 'vel',  categorie: 'Verbruiksartikelen', qr: 'ART-003' },
  { naam: 'Veiligheidshelm',   omschrijving: 'EN 397 veiligheidshelm',    eenheid: 'stuk', categorie: 'PBM',             qr: 'ART-004' },
  { naam: 'Tape 50mm',         omschrijving: 'Ducttape 50mm grijs',       eenheid: 'rol',  categorie: 'Verbruiksartikelen', qr: 'ART-005' },
  { naam: 'Schroeven M6x20',   omschrijving: 'Inox schroeven M6x20',      eenheid: 'zak',  categorie: 'Bevestigingsmateriaal', qr: 'ART-006' },
  { naam: 'Slijpschijf 125mm', omschrijving: 'Metaal slijpschijf 125mm',  eenheid: 'stuk', categorie: 'Verbruiksartikelen', qr: 'ART-007' },
  { naam: 'Veiligheidsschoenen', omschrijving: 'S3 veiligheidsschoenen',  eenheid: 'paar', categorie: 'PBM',             qr: 'ART-008' },
  { naam: 'Werkhandschoenen',  omschrijving: 'Snijbestendige handschoenen', eenheid: 'paar', categorie: 'PBM',           qr: 'ART-009' },
  { naam: 'Meetlint 5m',       omschrijving: 'Meetlint staal 5 meter',    eenheid: 'stuk', categorie: 'Gereedschap',    qr: 'ART-010' },
];

const insArt = db.prepare(`
  INSERT OR IGNORE INTO artikelen (id, naam, omschrijving, qr_code, eenheid, categorie)
  VALUES (?, ?, ?, ?, ?, ?)
`);

for (const a of artikelen) {
  insArt.run(uuid(), a.naam, a.omschrijving, a.qr, a.eenheid, a.categorie);
  console.log(`📦 ${a.naam} (${a.qr})`);
}

console.log('\n✅ Seed klaar!');
db.close();
