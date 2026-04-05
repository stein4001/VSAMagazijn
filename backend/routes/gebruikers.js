// backend/routes/gebruikers.js

const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAdmin, hashPassword } = require('../auth');

// GET /api/gebruikers
router.get('/', requireAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, naam, email, rol, actief, aangemaakt FROM gebruikers ORDER BY naam'
  ).all();
  res.json(users);
});

// POST /api/gebruikers
router.post('/', requireAdmin, (req, res) => {
  const { naam, email, wachtwoord, rol } = req.body;
  if (!naam || !email || !wachtwoord) {
    return res.status(400).json({ error: 'Naam, email en wachtwoord zijn verplicht' });
  }

  const bestaand = db.prepare('SELECT id FROM gebruikers WHERE email = ?').get(email);
  if (bestaand) return res.status(409).json({ error: 'Email al in gebruik' });

  const id = uuid();
  db.prepare(`
    INSERT INTO gebruikers (id, naam, email, wachtwoord, rol)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, naam, email.toLowerCase().trim(), hashPassword(wachtwoord), rol || 'medewerker');

  res.status(201).json(
    db.prepare('SELECT id, naam, email, rol, actief, aangemaakt FROM gebruikers WHERE id = ?').get(id)
  );
});

// PUT /api/gebruikers/:id
router.put('/:id', requireAdmin, (req, res) => {
  const { naam, email, rol, actief, wachtwoord } = req.body;
  const user = db.prepare('SELECT * FROM gebruikers WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Gebruiker niet gevonden' });

  const nieuwWw = wachtwoord ? hashPassword(wachtwoord) : user.wachtwoord;

  db.prepare(`
    UPDATE gebruikers SET naam=?, email=?, rol=?, actief=?, wachtwoord=? WHERE id=?
  `).run(
    naam ?? user.naam,
    email ?? user.email,
    rol ?? user.rol,
    actief !== undefined ? (actief ? 1 : 0) : user.actief,
    nieuwWw,
    req.params.id
  );

  res.json(
    db.prepare('SELECT id, naam, email, rol, actief, aangemaakt FROM gebruikers WHERE id = ?').get(req.params.id)
  );
});

// DELETE /api/gebruikers/:id — soft delete
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE gebruikers SET actief = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
