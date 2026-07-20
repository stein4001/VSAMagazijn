// backend/routes/klanten.js

const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

// GET /api/klanten — alle klanten (alle ingelogde gebruikers, voor autocomplete)
router.get('/', requireAuth, (req, res) => {
  const klanten = db.prepare('SELECT * FROM klanten ORDER BY naam').all();
  res.json(klanten);
});

// POST /api/klanten — nieuwe klant (admin)
router.post('/', requireAdmin, (req, res) => {
  const { naam, notities } = req.body;
  if (!naam?.trim()) return res.status(400).json({ error: 'Naam is verplicht' });

  const bestaand = db.prepare('SELECT id FROM klanten WHERE naam = ?').get(naam.trim());
  if (bestaand) return res.status(409).json({ error: 'Klant bestaat al' });

  const id = uuid();
  db.prepare('INSERT INTO klanten (id, naam, notities) VALUES (?, ?, ?)').run(id, naam.trim(), notities || null);
  res.status(201).json(db.prepare('SELECT * FROM klanten WHERE id = ?').get(id));
});

// PUT /api/klanten/:id — klant bijwerken (admin)
router.put('/:id', requireAdmin, (req, res) => {
  const { naam, notities } = req.body;
  const klant = db.prepare('SELECT * FROM klanten WHERE id = ?').get(req.params.id);
  if (!klant) return res.status(404).json({ error: 'Klant niet gevonden' });

  const nieuweNaam = naam?.trim() || klant.naam;

  if (nieuweNaam !== klant.naam) {
    const bestaand = db.prepare('SELECT id FROM klanten WHERE naam = ? AND id != ?').get(nieuweNaam, req.params.id);
    if (bestaand) return res.status(409).json({ error: 'Klantnaam is al in gebruik' });
    // Naam doorvoeren in bestaande picklijsten
    db.prepare('UPDATE picklijsten SET klant = ? WHERE klant = ?').run(nieuweNaam, klant.naam);
  }

  db.prepare('UPDATE klanten SET naam = ?, notities = ? WHERE id = ?')
    .run(nieuweNaam, notities !== undefined ? (notities || null) : klant.notities, req.params.id);

  res.json(db.prepare('SELECT * FROM klanten WHERE id = ?').get(req.params.id));
});

// GET /api/klanten/export/csv — alle klanten als CSV (admin)
router.get('/export/csv', requireAdmin, (req, res) => {
  const klanten = db.prepare('SELECT naam, notities FROM klanten ORDER BY naam').all();
  const pc = v => (v == null ? '' : String(v).replace(/"/g, '""'));
  const rows = klanten.map(k => `"${pc(k.naam)}";"${pc(k.notities)}"`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="klanten-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send('﻿' + ['naam;notities', ...rows].join('\n'));
});

// POST /api/klanten/import/csv — upsert klanten vanuit CSV (admin)
router.post('/import/csv', requireAdmin, (req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const lines = body.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    if (!lines.length) return res.status(400).json({ error: 'Leeg bestand' });

    const header = lines[0].toLowerCase().replace(/"/g, '').split(';');
    const iNaam     = header.indexOf('naam');
    const iNotities = header.indexOf('notities');
    if (iNaam === -1) return res.status(400).json({ error: 'Kolom "naam" ontbreekt' });

    let aangemaakt = 0, bijgewerkt = 0, fouten = 0;
    const upsert = db.transaction(() => {
      for (const line of lines.slice(1)) {
        const cols = line.split(';').map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
        const naam = cols[iNaam];
        if (!naam) { fouten++; continue; }
        const notities = iNotities !== -1 ? (cols[iNotities] || null) : null;
        const bestaand = db.prepare('SELECT id FROM klanten WHERE naam = ?').get(naam);
        if (bestaand) {
          db.prepare('UPDATE klanten SET notities = ? WHERE id = ?').run(notities, bestaand.id);
          bijgewerkt++;
        } else {
          db.prepare('INSERT INTO klanten (id, naam, notities) VALUES (?, ?, ?)').run(uuid(), naam, notities);
          aangemaakt++;
        }
      }
    });
    try {
      upsert();
      res.json({ aangemaakt, bijgewerkt, fouten });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

// DELETE /api/klanten/:id — klant verwijderen (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  const klant = db.prepare('SELECT * FROM klanten WHERE id = ?').get(req.params.id);
  if (!klant) return res.status(404).json({ error: 'Klant niet gevonden' });

  db.prepare('DELETE FROM klanten WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
