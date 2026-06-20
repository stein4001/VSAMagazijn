// backend/routes/gebruikers.js

const express = require('express');
const router = express.Router();
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAdmin, hashPassword } = require('../auth');

// GET /api/gebruikers
router.get('/', requireAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, naam, email, rol, actief, auth_methode, aangemaakt FROM gebruikers ORDER BY naam'
  ).all();
  res.json(users);
});

// POST /api/gebruikers
router.post('/', requireAdmin, (req, res) => {
  const { naam, email, wachtwoord, rol, auth_methode } = req.body;
  if (!naam || !email || !wachtwoord) {
    return res.status(400).json({ error: 'Naam, email en wachtwoord zijn verplicht' });
  }

  const bestaand = db.prepare('SELECT id FROM gebruikers WHERE email = ?').get(email);
  if (bestaand) return res.status(409).json({ error: 'Email al in gebruik' });

  const id = uuid();
  const methode = ['local','microsoft','beide'].includes(auth_methode) ? auth_methode : 'beide';
  db.prepare(`
    INSERT INTO gebruikers (id, naam, email, wachtwoord, rol, auth_methode)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, naam, email.toLowerCase().trim(), hashPassword(wachtwoord), rol || 'medewerker', methode);

  res.status(201).json(
    db.prepare('SELECT id, naam, email, rol, actief, auth_methode, aangemaakt FROM gebruikers WHERE id = ?').get(id)
  );
});

// PUT /api/gebruikers/:id
router.put('/:id', requireAdmin, (req, res) => {
  const { naam, email, rol, actief, wachtwoord, auth_methode } = req.body;
  const user = db.prepare('SELECT * FROM gebruikers WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Gebruiker niet gevonden' });

  const nieuwWw  = wachtwoord ? hashPassword(wachtwoord) : user.wachtwoord;
  const methode  = ['local','microsoft','beide'].includes(auth_methode) ? auth_methode : user.auth_methode;

  db.prepare(`
    UPDATE gebruikers SET naam=?, email=?, rol=?, actief=?, wachtwoord=?, auth_methode=? WHERE id=?
  `).run(
    naam ?? user.naam,
    email ?? user.email,
    rol ?? user.rol,
    actief !== undefined ? (actief ? 1 : 0) : user.actief,
    nieuwWw,
    methode,
    req.params.id
  );

  res.json(
    db.prepare('SELECT id, naam, email, rol, actief, auth_methode, aangemaakt FROM gebruikers WHERE id = ?').get(req.params.id)
  );
});

// DELETE /api/gebruikers/:id — hard delete (geblokkeerd als gebruiker picklijsten heeft)
router.delete('/:id', requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Je kunt je eigen account niet verwijderen.' });
  }

  const { n } = db.prepare('SELECT COUNT(*) as n FROM picklijsten WHERE gebruiker_id = ?').get(req.params.id);
  if (n > 0) {
    return res.status(409).json({
      error: `Gebruiker heeft ${n} picklijst(en) en kan niet worden verwijderd. Deactiveer de gebruiker via "Wijzig".`
    });
  }

  db.prepare('DELETE FROM gebruikers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
