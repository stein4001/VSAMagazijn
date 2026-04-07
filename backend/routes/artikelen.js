// backend/routes/artikelen.js

const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const QRCode = require('qrcode');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

// GET /api/artikelen — lijst alle actieve artikelen
router.get('/', requireAuth, (req, res) => {
  const { q, categorie } = req.query;
  let sql = 'SELECT * FROM artikelen WHERE actief = 1';
  const params = [];

  if (q) {
    sql += ' AND (naam LIKE ? OR qr_code LIKE ? OR omschrijving LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (categorie) {
    sql += ' AND categorie = ?';
    params.push(categorie);
  }
  sql += ' ORDER BY naam';

  res.json(db.prepare(sql).all(...params));
});

// GET /api/artikelen/qr/:code — zoek op QR code (gebruikt door scanner)
router.get('/qr/:code', requireAuth, (req, res) => {
  const artikel = db.prepare(
    'SELECT * FROM artikelen WHERE qr_code = ? AND actief = 1'
  ).get(req.params.code);

  if (!artikel) return res.status(404).json({ error: 'Artikel niet gevonden' });
  res.json(artikel);
});

// GET /api/artikelen/:id — één artikel
router.get('/:id', requireAuth, (req, res) => {
  const artikel = db.prepare(
    'SELECT * FROM artikelen WHERE id = ? AND actief = 1'
  ).get(req.params.id);

  if (!artikel) return res.status(404).json({ error: 'Artikel niet gevonden' });
  res.json(artikel);
});

// GET /api/artikelen/:id/qr-image — genereer QR PNG (admin)
router.get('/:id/qr-image', requireAdmin, async (req, res) => {
  const artikel = db.prepare('SELECT * FROM artikelen WHERE id = ?').get(req.params.id);
  if (!artikel) return res.status(404).json({ error: 'Artikel niet gevonden' });

  try {
    const png = await QRCode.toBuffer(artikel.qr_code, {
      errorCorrectionLevel: 'M',
      width: 300,
      margin: 2,
    });
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', `inline; filename="${artikel.qr_code}.png"`);
    res.send(png);
  } catch (err) {
    res.status(500).json({ error: 'QR generatie mislukt' });
  }
});

// POST /api/artikelen — nieuw artikel (alle ingelogde gebruikers mogen auto-aanmaken via scan)
router.post('/', requireAuth, (req, res) => {
  const { naam, omschrijving, eenheid, categorie, min_voorraad, qr_code: qrOverride } = req.body;
  if (!naam || !eenheid) {
    return res.status(400).json({ error: 'Naam en eenheid zijn verplicht' });
  }

  // Als qr_code meegegeven en al bestaat → geef bestaande terug
  if (qrOverride) {
    const bestaand = db.prepare('SELECT * FROM artikelen WHERE qr_code = ? AND actief = 1').get(qrOverride);
    if (bestaand) return res.json(bestaand);
  }

  const id = uuid();
  const qr_code = qrOverride || ('ART-' + Date.now().toString(36).toUpperCase());

  try {
    db.prepare(`
      INSERT INTO artikelen (id, naam, omschrijving, qr_code, eenheid, categorie, min_voorraad)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, naam, omschrijving || null, qr_code, eenheid, categorie || null, min_voorraad || 0);
  } catch (err) {
    // UNIQUE conflict op qr_code — geef bestaand artikel terug
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
      const bestaand = db.prepare('SELECT * FROM artikelen WHERE qr_code = ?').get(qr_code);
      if (bestaand) return res.json(bestaand);
    }
    throw err;
  }

  res.status(201).json(db.prepare('SELECT * FROM artikelen WHERE id = ?').get(id));
});

// PUT /api/artikelen/:id — wijzig artikel (admin)
router.put('/:id', requireAdmin, (req, res) => {
  const { naam, omschrijving, eenheid, categorie, min_voorraad, actief } = req.body;
  const artikel = db.prepare('SELECT * FROM artikelen WHERE id = ?').get(req.params.id);
  if (!artikel) return res.status(404).json({ error: 'Artikel niet gevonden' });

  db.prepare(`
    UPDATE artikelen SET
      naam = ?, omschrijving = ?, eenheid = ?,
      categorie = ?, min_voorraad = ?, actief = ?
    WHERE id = ?
  `).run(
    naam ?? artikel.naam,
    omschrijving ?? artikel.omschrijving,
    eenheid ?? artikel.eenheid,
    categorie ?? artikel.categorie,
    min_voorraad ?? artikel.min_voorraad,
    actief !== undefined ? (actief ? 1 : 0) : artikel.actief,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM artikelen WHERE id = ?').get(req.params.id));
});

// DELETE /api/artikelen/:id — soft delete (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE artikelen SET actief = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/artikelen/export — CSV download (admin)
router.get('/export/csv', requireAdmin, (req, res) => {
  const arts = db.prepare('SELECT * FROM artikelen WHERE actief = 1 ORDER BY naam').all();
  const header = 'qr_code;naam;omschrijving;eenheid;categorie';
  const rows = arts.map(a => [
    csvEsc(a.qr_code), csvEsc(a.naam), csvEsc(a.omschrijving||''),
    csvEsc(a.eenheid), csvEsc(a.categorie||''),
  ].join(';'));
  const csv = [header, ...rows].join('\r\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="artikelen-${dateStr()}.csv"`);
  res.send('\uFEFF' + csv); // BOM voor Excel
});

// POST /api/artikelen/import — CSV upload (admin)
router.post('/import/csv', requireAdmin, express.text({ type: '*/*', limit: '2mb' }), (req, res) => {
  const lines = req.body.replace(/\r/g, '').split('\n').filter(Boolean);
  if (lines.length < 2) return res.status(400).json({ error: 'Lege of ongeldige CSV' });

  const header = lines[0].toLowerCase().split(';').map(h => h.trim());
  const idx = (name) => header.indexOf(name);

  if (idx('qr_code') === -1 || idx('naam') === -1) {
    return res.status(400).json({ error: 'CSV moet minimaal kolommen qr_code en naam bevatten' });
  }

  const insert = db.prepare(`
    INSERT INTO artikelen (id, naam, omschrijving, qr_code, eenheid, categorie)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE artikelen SET naam=?, omschrijving=?, eenheid=?, categorie=?, actief=1 WHERE qr_code=?
  `);

  let aangemaakt = 0, bijgewerkt = 0, fouten = 0;

  const importAll = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';').map(c => c.trim().replace(/^"|"$/g, ''));
      const qr_code = cols[idx('qr_code')];
      const naam    = cols[idx('naam')];
      if (!qr_code || !naam) { fouten++; continue; }

      const omschrijving = idx('omschrijving') >= 0 ? cols[idx('omschrijving')] || null : null;
      const eenheid      = idx('eenheid')      >= 0 ? cols[idx('eenheid')]      || 'stuk' : 'stuk';
      const categorie    = idx('categorie')    >= 0 ? cols[idx('categorie')]     || null : null;

      const bestaand = db.prepare('SELECT id FROM artikelen WHERE qr_code = ?').get(qr_code);
      if (bestaand) {
        update.run(naam, omschrijving, eenheid, categorie, qr_code);
        bijgewerkt++;
      } else {
        insert.run(uuid(), naam, omschrijving, qr_code, eenheid, categorie);
        aangemaakt++;
      }
    }
  });

  try {
    importAll();
    res.json({ aangemaakt, bijgewerkt, fouten });
  } catch (err) {
    res.status(500).json({ error: 'Import mislukt: ' + err.message });
  }
});

function csvEsc(val) {
  const s = String(val ?? '');
  return s.includes(';') || s.includes('"') || s.includes('\n')
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}
function dateStr() {
  return new Date().toISOString().slice(0,10);
}

// GET /api/artikelen/categorieën/lijst
router.get('/categorieen/lijst', requireAuth, (req, res) => {
  const cats = db.prepare(
    "SELECT DISTINCT categorie FROM artikelen WHERE actief = 1 AND categorie IS NOT NULL ORDER BY categorie"
  ).all().map(r => r.categorie);
  res.json(cats);
});

module.exports = router;
