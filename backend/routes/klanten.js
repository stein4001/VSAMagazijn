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

// DELETE /api/klanten/:id — klant verwijderen (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  const klant = db.prepare('SELECT * FROM klanten WHERE id = ?').get(req.params.id);
  if (!klant) return res.status(404).json({ error: 'Klant niet gevonden' });

  db.prepare('DELETE FROM klanten WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
