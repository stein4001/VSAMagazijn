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

  db.prepare(`
    INSERT INTO artikelen (id, naam, omschrijving, qr_code, eenheid, categorie, min_voorraad)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, naam, omschrijving || null, qr_code, eenheid, categorie || null, min_voorraad || 0);

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

// GET /api/artikelen/categorieën/lijst
router.get('/categorieen/lijst', requireAuth, (req, res) => {
  const cats = db.prepare(
    "SELECT DISTINCT categorie FROM artikelen WHERE actief = 1 AND categorie IS NOT NULL ORDER BY categorie"
  ).all().map(r => r.categorie);
  res.json(cats);
});

module.exports = router;
